import {
  _decorator,
  Color,
  Component,
  director,
  Graphics,
  Node,
  Sprite,
  SpriteFrame,
  UITransform,
  Label,
} from 'cc';
import { Cell } from './game/types';
import type { GameSimulation } from './game/simulation';
import type { CatMotionAnimator } from './visual/CatMotionAnimator';
import {
  DEFAULT_MAP_TILE_DISPLAY_SCALES,
  mergeMapTileDisplayScales,
  type MapTileDisplayScales,
} from './render/MapTileDisplayConfig';
import {
  hasCompleteMapFrames,
  hasFloorSprite,
  type MapTileSpriteFrames,
} from './render/MapTileSpriteFrames';
import {
  RAT_SKIN_IDS,
  RAT_DIRECTIONS,
  type RatDirection,
  type RatSkinId,
  type RatSkinPack,
} from './game/ratSkinLoader';

const { ccclass } = _decorator;

type CatAnimKey = 'start' | 'walkH' | 'walkV' | 'stun' | 'attack';

type CatAnimPack = {
  secPerFrame: number;
  /**
   * 攻击动作专用帧间隔（秒/帧）。与 `secPerFrame` 分离，使攻击的 5 帧动画
   * 能在更短的攻击移动时长（CatMotionAnimator 中 attack durSeg×2 = 0.3s）
   * 内完整播完一遍，避免玩家只看到第一帧就被切回 start/walk。
   * 未单独配置时与 `secPerFrame` 相同（向后兼容）。
   */
  attackSecPerFrame: number;
  start: SpriteFrame[];
  walkH: SpriteFrame[];
  walkV: SpriteFrame[];
  stun: SpriteFrame[];
  /**
   * 攻击帧组。catSkinLoader 在该皮肤没有 attack/ 资源时已自动用本皮肤 walkH 填充
   * （见 catSkinLoader.ts 文件头注释），所以这里读到空数组的概率很低；空时会按 'start' 兜底。
   */
  attack: SpriteFrame[];
};

type RatRuntimeState = {
  skin: RatSkinId;
  dir: RatDirection;
  animTime: number;
  frameIndex: number;
};

const CAT_VERTICAL_ANIM_SCALE = 0.9;
/** 棋盘上猫节点相对默认半径的额外放大系数；调大会让猫整体看起来更显眼 */
const CAT_DISPLAY_SCALE = 1.75;
/**
 * 猫精灵默认 tint：纯白即 modulate 1.0，等价于「不染色，按贴图原样显示」。
 * 早期 `skinConfig.visualTint` 通过 `Sprite.color` 做乘法染色会把贴图整体压暗，
 * 现在贴图路径强制走这个常量，皮肤主题色仅在「贴图加载失败回退色块」时生效。
 * 复用同一个 Color 实例，避免 drawEntities 每帧 new Color() 的分配开销。
 */
const CAT_SPRITE_NEUTRAL_TINT = new Color(255, 255, 255, 255);
/** 猫眩晕态的泛红 tint；同样复用实例避免每帧分配。 */
const CAT_SPRITE_STUN_TINT = new Color(255, 200, 200, 255);

/**
 * 按资源名中的帧序号排序，兼容下面几种命名：
 * - `frame_00_delay-0.2s` / `frame_00`（旧版 GIF 拆帧）
 * - `frame-00` / `frame-12`（新皮肤资源）
 * - `start1` / `xuanyun03` 之类以纯数字结尾的单帧
 * 找不到任何数字时按 uuid 兜底排序，保证调用方拿到稳定顺序。
 */
function sortCatSpriteFrames(frames: SpriteFrame[]): SpriteFrame[] {
  const frameIndex = (sf: SpriteFrame): number => {
    const name = sf.name ?? '';
    const m = /frame[-_](\d+)/i.exec(name);
    if (m) return parseInt(m[1], 10);
    const t = /(\d+)\s*$/.exec(name);
    return t ? parseInt(t[1], 10) : 0;
  };
  return [...frames]
    .filter((f) => !!f)
    .sort((a, b) => {
      const d = frameIndex(a) - frameIndex(b);
      return d !== 0 ? d : (a.uuid ?? '').localeCompare(b.uuid ?? '');
    });
}

function isMapOuterRing(x: number, y: number, w: number, h: number): boolean {
  return x === 0 || y === 0 || x === w - 1 || y === h - 1;
}

function cellCenterLocal(
  gx: number,
  gy: number,
  gridW: number,
  gridH: number,
  tile: number,
): { x: number; y: number } {
  const halfW = (gridW * tile) / 2;
  const halfH = (gridH * tile) / 2;
  return {
    x: -halfW + gx * tile + tile / 2,
    y: halfH - gy * tile - tile / 2,
  };
}

function clearChildren(node: Node, pool?: Node[]): void {
  for (let i = node.children.length - 1; i >= 0; i--) {
    const child = node.children[i];
    if (pool) {
      // 回收节点到对象池
      child.removeFromParent();
      child.active = false;
      pool.push(child);
    } else {
      // 直接销毁节点
      child.destroy();
    }
  }
}

@ccclass('BoardView')
export class BoardView extends Component {
  tileSize = 40;

  /** 地板 + 外圈边（下层） */
  private mapGroundLayer!: Node;
  /** 仅「混合模式」：无 edge/石头贴图时用色块画障碍，叠在地板精灵之上、石头精灵之下 */
  private mapObstacleGfx!: Graphics;
  /** 内圈石头（上层，避免外圈边盖住石头外扩区域） */
  private mapStoneLayer!: Node;
  private mapGfx!: Graphics;
  private entityGfx!: Graphics;

  private catNode!: Node;
  private catSpr!: Sprite;
  private miceRoot!: Node;

  private mapFrames: Partial<MapTileSpriteFrames> | null = null;
  private catFrame: SpriteFrame | null = null;
  private catAnim: CatAnimPack | null = null;
  private catAnimTime = 0;
  private catAnimStateKey: CatAnimKey | '' = '';
  private catTint = new Color(255, 255, 255, 255);
  private mouseFrame: SpriteFrame | null = null;
  /** 纵向移动时贴图；空则与 mouseFrame 共用 */
  private mouseFrameVertical: SpriteFrame | null = null;
  /** 相对默认老鼠显示尺寸的缩放（默认 1） */
  private mouseDisplayScale = 1;
  /** 老鼠方向帧组（4 皮肤 × 4 方向 × N 帧），来自 ratSkinLoader.loadAllRatSkinFrames */
  private ratSkinPack: RatSkinPack | null = null;
  /** 老鼠方向帧动画的每帧时长（秒） */
  private ratAnimSecPerFrame = 0.15;
  /** 每只老鼠在本场内的稳定皮肤 / 方向 / 动画时间状态（按 mouse.id 维护） */
  private readonly ratState = new Map<number, RatRuntimeState>();

  /** 地板 / 外圈 / 内圈石头贴图相对单格的缩放（默认 1 与格对齐） */
  private mapTileScales: MapTileDisplayScales = {
    ...DEFAULT_MAP_TILE_DISPLAY_SCALES,
  };

  private lastMapToken = '';
  private readonly mousePrevGrid = new Map<number, { x: number; y: number }>();

  /** 对象池 */
  private readonly spritePool: Node[] = [];
  private readonly mousePool: Node[] = [];

  onLoad(): void {
    this.mapGroundLayer = new Node('MapGround');
    this.node.addChild(this.mapGroundLayer);

    const obsGfxNode = new Node('MapObstacleGfx');
    this.node.addChild(obsGfxNode);
    this.mapObstacleGfx = obsGfxNode.addComponent(Graphics);

    this.mapStoneLayer = new Node('MapStones');
    this.node.addChild(this.mapStoneLayer);

    const mapGfxNode = new Node('MapFallbackGfx');
    this.node.addChild(mapGfxNode);
    this.mapGfx = mapGfxNode.addComponent(Graphics);

    const entNode = new Node('EntityGfx');
    this.node.addChild(entNode);
    this.entityGfx = entNode.addComponent(Graphics);

    this.catNode = new Node('Cat');
    this.node.addChild(this.catNode);
    this.catSpr = this.catNode.addComponent(Sprite);
    this.catSpr.enabled = false;
    const catUt = this.catNode.addComponent(UITransform);
    catUt.setAnchorPoint(0.5, 0.5);

    this.miceRoot = new Node('Mice');
    this.node.addChild(this.miceRoot);
  }

  configureSprites(
    map: Partial<MapTileSpriteFrames> | null,
    cat: SpriteFrame | null,
    mouse: SpriteFrame | null,
  ): void {
    this.mapFrames = map;
    this.catFrame = cat;
    this.mouseFrame = mouse;
    this.markMapDirty();
  }

  /**
   * 设置猫的皮肤主题色。**仅在贴图加载失败回退到 entityGfx 色块圆点时生效**；
   * 贴图路径走 `CAT_SPRITE_NEUTRAL_TINT` 不再做乘法染色，避免把贴图整体压暗。
   * 如果将来想让贴图也叠加皮肤色调，需要换成非 modulate 的混合方式（如自定义 shader），
   * 不能直接复用 `Sprite.color`。
   */
  setCatVisualTint(tint: { r: number; g: number; b: number }): void {
    this.catTint = new Color(tint.r, tint.g, tint.b, 255);
  }

  /**
   * 老鼠精灵：纵向贴图与整体显示缩放（由 GameController 绑定 Inspector）。
   */
  setMouseVisualOptions(opts: {
    verticalFrame?: SpriteFrame | null;
    displayScale?: number;
  }): void {
    if (opts.verticalFrame !== undefined) {
      this.mouseFrameVertical = opts.verticalFrame;
    }
    if (opts.displayScale !== undefined && Number.isFinite(opts.displayScale)) {
      this.mouseDisplayScale = Math.max(0.25, Math.min(4, opts.displayScale));
    }
  }

  /**
   * 注入老鼠四方向帧组。一旦 pack 至少包含一个皮肤的某方向帧，drawEntities 会改走
   * "随机皮肤 + 方向动画"分支：每只老鼠按 id 稳定地分配一种皮肤，按位移自动选择
   * up/down/left/right 帧组并按 `frameDurationSec` 循环播放；当前方向缺帧时按
   * "其它方向 → 单帧 mouseFrame → 色块"顺序回退。
   *
   * 多次调用以最后一次为准；ratState 会全部清空，避免旧动画时间错位。
   */
  setMouseSkinFrames(opts: {
    pack: RatSkinPack | null;
    frameDurationSec?: number;
  }): void {
    this.ratSkinPack = opts.pack;
    if (
      opts.frameDurationSec !== undefined &&
      Number.isFinite(opts.frameDurationSec)
    ) {
      this.ratAnimSecPerFrame = Math.max(0.04, opts.frameDurationSec);
    }
    this.ratState.clear();
  }

  /**
   * 猫多帧动画：`start` / `walk1`(水平) / `walk2`(纵向) / `xuanyun`(眩晕)。
   * 各数组在 Inspector 中拖入对应文件夹下全部 SpriteFrame 即可（可不手动排序）。
   * 若某状态数组为空，则回退到 `sfCat` 单帧（由 `configureSprites` 传入）。
   */
  configureCatFrameAnimations(opts: {
    framesStart?: SpriteFrame[] | null;
    framesWalkHorizontal?: SpriteFrame[] | null;
    framesWalkVertical?: SpriteFrame[] | null;
    framesStun?: SpriteFrame[] | null;
    framesAttack?: SpriteFrame[] | null;
    frameDurationSec?: number;
    /**
     * 攻击专用帧间隔。未提供时与 `frameDurationSec` 相同。
     * 建议值约 = 攻击移动总时长 / 攻击帧数（典型 0.3 / 5 = 0.06）。
     */
    attackFrameDurationSec?: number;
  }): void {
    const start = sortCatSpriteFrames([...(opts.framesStart ?? [])]);
    const walkH = sortCatSpriteFrames([...(opts.framesWalkHorizontal ?? [])]);
    const walkV = sortCatSpriteFrames([...(opts.framesWalkVertical ?? [])]);
    const stun = sortCatSpriteFrames([...(opts.framesStun ?? [])]);
    // attack 缺省时由 catSkinLoader 已经 fallback 到 walkH；这里再做一次空兜底确保类型安全。
    const attack = sortCatSpriteFrames([
      ...(opts.framesAttack ?? opts.framesWalkHorizontal ?? []),
    ]);
    if (
      !start.length &&
      !walkH.length &&
      !walkV.length &&
      !stun.length &&
      !attack.length
    ) {
      this.catAnim = null;
      this.catAnimStateKey = '';
      this.catAnimTime = 0;
      return;
    }
    const secPerFrame = Math.max(0.04, opts.frameDurationSec ?? 0.1);
    const attackSecPerFrame = Math.max(
      0.02,
      opts.attackFrameDurationSec ?? secPerFrame,
    );
    this.catAnim = {
      secPerFrame,
      attackSecPerFrame,
      start,
      walkH,
      walkV,
      stun,
      attack,
    };
    this.catAnimStateKey = '';
    this.catAnimTime = 0;
  }

  /**
   * 配置地图格贴图缩放（相对 `tileSize`）。可在运行时或 Inspector 绑定脚本里调用。
   * 未传入的键保持当前值；首次合并前内部默认为 1。
   */
  configureMapTileScales(partial?: Partial<MapTileDisplayScales>): void {
    this.mapTileScales = mergeMapTileDisplayScales(this.mapTileScales, partial);
    this.markMapDirty();
  }

  /** 地图尺寸未变但障碍布局变化时由 `GameController` 调用 */
  markMapDirty(): void {
    this.lastMapToken = '';
  }

  redraw(
    sim: GameSimulation,
    anim: CatMotionAnimator,
    stunned: boolean,
    isPlaying: boolean,
    orientStartToFacing: boolean,
  ): void {
    const gw = sim.grid.width;
    const gh = sim.grid.height;
    const t = this.tileSize;
    const mf = this.mapFrames;
    const sc = this.mapTileScales;
    const token = `${gw}x${gh}-F${mf?.floor ? '1' : '0'}E${mf?.edge ? '1' : '0'}S${mf?.stone1 ? '1' : '0'}${mf?.stone2 ? '1' : '0'}-${sc.floor}-${sc.edge}-${sc.stone}`;
    if (token !== this.lastMapToken) {
      this.lastMapToken = token;
      this.rebuildMap(sim);
    }

    this.drawEntities(
      sim,
      anim,
      stunned,
      isPlaying,
      orientStartToFacing,
      gw,
      gh,
      t,
    );
  }

  private rebuildMap(sim: GameSimulation): void {
    clearChildren(this.mapGroundLayer, this.spritePool);
    clearChildren(this.mapStoneLayer, this.spritePool);
    this.mapGfx.clear();
    this.mapObstacleGfx.clear();
    this.mousePrevGrid.clear();
    this.ratState.clear();
    clearChildren(this.miceRoot, this.mousePool);

    const f = this.mapFrames;
    if (!hasFloorSprite(f)) {
      this.mapGfx.node.active = true;
      this.mapObstacleGfx.node.active = false;
      this.mapGroundLayer.active = false;
      this.mapStoneLayer.active = false;
      this.drawFallbackMap(sim);
      return;
    }

    const gw = sim.grid.width;
    const gh = sim.grid.height;
    const t = this.tileSize;
    const complete = hasCompleteMapFrames(f);

    this.mapGfx.node.active = false;
    this.mapGroundLayer.active = true;
    this.mapStoneLayer.active = true;
    this.mapObstacleGfx.node.active = !complete;

    const cellCenter = (gx: number, gy: number) => {
      const left = -gw * t * 0.5 + gx * t;
      const bottom = gh * t * 0.5 - (gy + 1) * t;
      return { cx: left + t * 0.5, cy: bottom + t * 0.5, left, bottom };
    };

    const sFloor = this.mapTileScales.floor;
    const sEdge = this.mapTileScales.edge;
    const sStone = this.mapTileScales.stone;

    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        const { cx, cy } = cellCenter(gx, gy);
        const fw = t * sFloor;
        const fh = t * sFloor;
        this.addTileSprite(
          this.mapGroundLayer,
          f.floor!,
          cx,
          cy,
          fw,
          fh,
          0.5,
          0.5,
        );
      }
    }

    const ew = t * sEdge;
    const eh = t * sEdge;
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        const cell = sim.grid.get(gx, gy);
        const outer = isMapOuterRing(gx, gy, gw, gh);
        if (cell !== Cell.Obstacle || !outer) continue;
        const { cx, cy } = cellCenter(gx, gy);
        if (f.edge) {
          this.addTileSprite(
            this.mapGroundLayer,
            f.edge,
            cx,
            cy,
            ew,
            eh,
            0.5,
            0.5,
          );
        } else if (!complete) {
          const { left, bottom } = cellCenter(gx, gy);
          this.drawFallbackObstacleCell(this.mapObstacleGfx, left, bottom, t);
        }
      }
    }

    const stoneA = f.stone1;
    const stoneB = f.stone2;
    const hasBothStones = !!(stoneA && stoneB);
    const hasAnyStone = !!(stoneA || stoneB);
    const sw = t * sStone;
    const sh = t * sStone;
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        const cell = sim.grid.get(gx, gy);
        const outer = isMapOuterRing(gx, gy, gw, gh);
        if (cell !== Cell.Obstacle || outer) continue;
        const { cx, cy } = cellCenter(gx, gy);
        if (hasBothStones) {
          const stone = (gx + gy * 17) % 2 === 0 ? stoneA! : stoneB!;
          this.addTileSprite(
            this.mapStoneLayer,
            stone,
            cx,
            cy,
            sw,
            sh,
            0.5,
            0.5,
          );
        } else if (hasAnyStone) {
          const stone = stoneA ?? stoneB!;
          this.addTileSprite(
            this.mapStoneLayer,
            stone,
            cx,
            cy,
            sw,
            sh,
            0.5,
            0.5,
          );
        } else if (!complete) {
          const { left, bottom } = cellCenter(gx, gy);
          this.drawFallbackObstacleCell(this.mapObstacleGfx, left, bottom, t);
        }
      }
    }
  }

  private drawFallbackObstacleCell(
    g: Graphics,
    left: number,
    bottom: number,
    t: number,
  ): void {
    g.fillColor = new Color(55, 62, 82, 255);
    g.rect(left, bottom, t, t);
    g.fill();
    g.strokeColor = new Color(18, 20, 30, 80);
    g.lineWidth = 1;
    g.rect(left, bottom, t, t);
    g.stroke();
  }

  private addTileSprite(
    parent: Node,
    frame: SpriteFrame,
    cx: number,
    cy: number,
    w: number,
    h: number,
    ax: number,
    ay: number,
  ): void {
    let n: Node;
    if (this.spritePool.length > 0) {
      // 从对象池获取节点
      n = this.spritePool.pop()!;
      n.parent = parent;
      n.active = true;
    } else {
      // 创建新节点
      n = new Node('cell');
      const ut = n.addComponent(UITransform);
      ut.setAnchorPoint(ax, ay);
      const sp = n.addComponent(Sprite);
      sp.type = Sprite.Type.SIMPLE;
      sp.sizeMode = Sprite.SizeMode.CUSTOM;
    }

    n.setPosition(cx, cy, 0);
    const sp = n.getComponent(Sprite)!;
    sp.spriteFrame = frame;
    const ut = n.getComponent(UITransform)!;
    ut.setContentSize(w, h);
    parent.addChild(n);
  }

  private drawFallbackMap(sim: GameSimulation): void {
    const g = this.mapGfx;
    g.clear();
    const gw = sim.grid.width;
    const gh = sim.grid.height;
    const t = this.tileSize;

    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        const c = sim.grid.get(gx, gy);
        const left = -gw * t * 0.5 + gx * t;
        const bottom = gh * t * 0.5 - (gy + 1) * t;
        if (c === Cell.Obstacle) {
          g.fillColor = new Color(55, 62, 82, 255);
        } else {
          g.fillColor = new Color(28, 32, 48, 255);
        }
        g.rect(left, bottom, t, t);
        g.fill();
        g.strokeColor = new Color(18, 20, 30, 80);
        g.lineWidth = 1;
        g.rect(left, bottom, t, t);
        g.stroke();
      }
    }
  }

  private drawEntities(
    sim: GameSimulation,
    anim: CatMotionAnimator,
    stunned: boolean,
    isPlaying: boolean,
    orientStartToFacing: boolean,
    gw: number,
    gh: number,
    t: number,
  ): void {
    const cat = anim.getPixelCenter();
    // catR 仅作为占位圆点半径与 setContentSize 基准；最终视觉放大通过 setScale 叠加 CAT_DISPLAY_SCALE，
    // 避免依赖 Sprite.SizeMode.CUSTOM 在不同 trim / 帧切换时机下的尺寸刷新差异。
    const catR = Math.min(t * 0.38, 18);

    this.entityGfx.clear();

    const dt = director.getDeltaTime();
    const {
      frame: catSprite,
      softenStunTint,
      visualScale: catVisualScale,
      key: catAnimKey,
    } = this.resolveCatDisplay(sim, anim, stunned, isPlaying, dt);

    if (catSprite) {
      this.catSpr.enabled = true;
      this.catSpr.spriteFrame = catSprite;
      this.catSpr.sizeMode = Sprite.SizeMode.CUSTOM;
      const cut = this.catNode.getComponent(UITransform)!;
      const side = catR * 2.2;
      cut.setContentSize(side, side);
      this.catNode.setPosition(cat.x, cat.y, 0);
      // 资源约定（resources/cat-skins/<skin>/*）：
      //   - start / walk1 / xuanyun 单帧默认面朝右；
      //   - walk2 单帧默认面朝上；
      // 因此向左移动时左右翻转，向下移动时旋转 180°；start 在不允许跟随 facing 时保持原样。
      const isStart = catAnimKey === 'start';
      const facingNeutralStart = isStart && !orientStartToFacing;
      const flip = facingNeutralStart ? 1 : sim.facing.dx < 0 ? -1 : 1;
      const displayScale = catVisualScale * CAT_DISPLAY_SCALE;
      this.catNode.setScale(flip * displayScale, displayScale, 1);
      let angle = 0;
      if (isStart) {
        if (orientStartToFacing) {
          if (sim.facing.dy < 0) angle = 90;
          else if (sim.facing.dy > 0) angle = 270;
        }
      } else if (sim.facing.dy > 0) {
        angle = 180;
      }
      this.catNode.angle = angle;
      // 贴图路径强制走中性 tint：Sprite.color 是乘法 modulate，皮肤的 visualTint 若 < 255
      // 会把贴图整体压暗（除 default 外几乎所有皮肤都会发生，详见 CAT_SPRITE_NEUTRAL_TINT 注释）；
      // 因此皮肤色只保留在下面的色块 fallback 分支，作为「贴图加载失败时的可见反馈」。
      this.catSpr.color = softenStunTint
        ? CAT_SPRITE_STUN_TINT
        : CAT_SPRITE_NEUTRAL_TINT;
    } else {
      this.catSpr.enabled = false;
      this.entityGfx.fillColor = stunned
        ? new Color(200, 120, 120, 255)
        : this.catTint;
      this.entityGfx.circle(cat.x, cat.y, catR * CAT_DISPLAY_SCALE);
      this.entityGfx.fill();
    }

    const hasRatSkins = this.hasAnyRatSkinFrames();
    if (this.mouseFrame || hasRatSkins) {
      const seen = new Set<number>();
      const baseSide = Math.min(t * 0.22, 11) * 2.2 * this.mouseDisplayScale;
      for (const m of sim.mice) {
        seen.add(m.id);
        let n = this.miceRoot.getChildByName(`m-${m.id}`);
        if (!n) {
          // 从对象池获取节点
          if (this.mousePool.length > 0) {
            n = this.mousePool.pop()!;
            n.name = `m-${m.id}`;
            n.parent = this.miceRoot;
            n.active = true;
          } else {
            // 创建新节点
            n = new Node(`m-${m.id}`);
            const ut = n.addComponent(UITransform);
            ut.setAnchorPoint(0.5, 0.5);
            const sp = n.addComponent(Sprite);
            sp.type = Sprite.Type.SIMPLE;
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            this.miceRoot.addChild(n);
          }
        }
        const sp = n.getComponent(Sprite)!;
        const ut = n.getComponent(UITransform)!;
        ut.setContentSize(baseSide, baseSide);
        const p = cellCenterLocal(m.x, m.y, gw, gh, t);
        n.setPosition(p.x, p.y, 0);
        const prev = this.mousePrevGrid.get(m.id);
        const dx = prev ? m.x - prev.x : 0;
        const dy = prev ? m.y - prev.y : 0;
        if (hasRatSkins) {
          this.applyRatSkinFrame(n, sp, m.id, dx, dy, dt);
        } else {
          // 旧的单帧 + 翻转分支：mouseFrame 必非空（外层 if 已保证）
          if (prev && (dx !== 0 || dy !== 0)) {
            if (dx !== 0) {
              sp.spriteFrame = this.mouseFrame;
              /* 贴图默认朝向与网格位移相反时需左右翻转 */
              n.setScale(dx > 0 ? -1 : 1, 1, 1);
            } else {
              sp.spriteFrame = this.mouseFrameVertical ?? this.mouseFrame;
              n.setScale(1, dy > 0 ? -1 : 1, 1);
            }
          } else if (!prev) {
            sp.spriteFrame = this.mouseFrame;
            n.setScale(1, 1, 1);
          }
        }
        this.mousePrevGrid.set(m.id, { x: m.x, y: m.y });
      }
      for (const c of [...this.miceRoot.children]) {
        const id = Number(c.name.slice(2));
        if (!seen.has(id)) {
          // 回收节点到对象池
          c.removeFromParent();
          c.active = false;
          this.mousePool.push(c);
          this.mousePrevGrid.delete(id);
          this.ratState.delete(id);
        }
      }
    } else {
      this.entityGfx.fillColor = new Color(160, 170, 190, 255);
      for (const m of sim.mice) {
        const p = cellCenterLocal(m.x, m.y, gw, gh, t);
        this.entityGfx.circle(p.x, p.y, Math.min(t * 0.22, 11));
        this.entityGfx.fill();
      }
    }
  }

  /** ratSkinPack 至少包含一个皮肤的任一方向有帧 → drawEntities 启用方向动画分支 */
  private hasAnyRatSkinFrames(): boolean {
    const pack = this.ratSkinPack;
    if (!pack) return false;
    for (const skin of RAT_SKIN_IDS) {
      const dirs = pack[skin];
      if (!dirs) continue;
      for (const dir of RAT_DIRECTIONS) {
        if (dirs[dir] && dirs[dir].length > 0) return true;
      }
    }
    return false;
  }

  /** 当前方向若缺帧，依序回退到其它方向（保证至少能拿到 1 张帧组） */
  private pickRatFrames(skin: RatSkinId, dir: RatDirection): SpriteFrame[] {
    const dirs = this.ratSkinPack?.[skin];
    if (!dirs) return [];
    if (dirs[dir]?.length) return dirs[dir];
    for (const fallbackDir of RAT_DIRECTIONS) {
      if (fallbackDir === dir) continue;
      const fb = dirs[fallbackDir];
      if (fb?.length) return fb;
    }
    return [];
  }

  /**
   * 方向动画分支：
   * - 第一次出现的老鼠按 id 稳定地随机分配一种皮肤、默认方向 right；
   * - 后续每帧按 dx/dy 更新方向（无位移保持原方向），按 ratAnimSecPerFrame 推进 frameIndex；
   * - 帧贴图已含朝向，节点 setScale 强制 (1,1,1) 避免与旧 mouseFrame 翻转逻辑冲突；
   * - 当前方向缺帧时回退到其它方向；若该皮肤完全没帧再回退到 mouseFrame（或保持上一帧）。
   */
  private applyRatSkinFrame(
    node: Node,
    sprite: Sprite,
    mouseId: number,
    dx: number,
    dy: number,
    dt: number,
  ): void {
    let state = this.ratState.get(mouseId);
    if (!state) {
      const skinIdx = Math.floor(Math.random() * RAT_SKIN_IDS.length);
      state = {
        skin: RAT_SKIN_IDS[skinIdx],
        dir: 'right',
        animTime: 0,
        frameIndex: 0,
      };
      this.ratState.set(mouseId, state);
    }
    // 方向映射约定（与资源命名一致）：
    //   - rat_skins/<skin>/left|right：贴图鼻子方向与文件夹名一致，向左 / 向右移动直接用同名目录；
    //   - rat_skins/<skin>/up|down：实测用户资源是按"老鼠看上去面朝哪边"命名，与游戏内运动方向相反，
    //     即网格 `dy > 0`（屏幕往下走）应取 `up/` 帧、`dy < 0`（屏幕往上走）应取 `down/` 帧。
    //     如果未来重新出图改成"按运动方向"命名，把下面两条互换即可。
    let nextDir: RatDirection | null = null;
    if (dx > 0) nextDir = 'right';
    else if (dx < 0) nextDir = 'left';
    else if (dy > 0) nextDir = 'up';
    else if (dy < 0) nextDir = 'down';
    if (nextDir && nextDir !== state.dir) {
      state.dir = nextDir;
      state.animTime = 0;
      state.frameIndex = 0;
    }

    const frames = this.pickRatFrames(state.skin, state.dir);
    if (frames.length === 0) {
      sprite.spriteFrame = this.mouseFrame;
      node.setScale(1, 1, 1);
      return;
    }
    state.animTime += dt;
    const secPerFrame = this.ratAnimSecPerFrame;
    while (state.animTime >= secPerFrame) {
      state.animTime -= secPerFrame;
      state.frameIndex = (state.frameIndex + 1) % frames.length;
    }
    sprite.spriteFrame = frames[state.frameIndex] ?? frames[0];
    node.setScale(1, 1, 1);
  }

  private resolveCatDisplay(
    sim: GameSimulation,
    anim: CatMotionAnimator,
    stunned: boolean,
    isPlaying: boolean,
    dt: number,
  ): {
    frame: SpriteFrame | null;
    softenStunTint: boolean;
    visualScale: number;
    key: CatAnimKey;
  } {
    const pack = this.catAnim;
    if (!pack) {
      return {
        frame: this.catFrame,
        softenStunTint: stunned,
        visualScale: 1,
        key: 'start',
      };
    }

    let key: CatAnimKey = 'start';
    if (stunned && pack.stun.length > 0) {
      key = 'stun';
    } else {
      const mk = anim.getActiveMotionKind();
      if (mk === 'attack') {
        // attack 帧 catSkinLoader 已保证非空（缺则 fallback 到本皮肤 walkH），
        // 直接切 'attack' key；stripOf 内部还有空数组兜底（fallback 到 start）。
        key = 'attack';
      } else if (mk === 'walk') {
        const h = anim.getWalkIsHorizontal();
        if (h === true) key = 'walkH';
        else if (h === false) key = 'walkV';
        else key = 'start';
      } else if (isPlaying) {
        key = sim.facing.dx !== 0 ? 'walkH' : 'walkV';
      } else {
        key = 'start';
      }
    }

    const stripOf = (k: CatAnimKey): SpriteFrame[] => {
      if (k === 'stun') return pack.stun;
      if (k === 'walkH') return pack.walkH;
      if (k === 'walkV') return pack.walkV;
      if (k === 'attack') return pack.attack;
      return pack.start;
    };

    let strip = stripOf(key);
    if (!strip.length && key !== 'start') {
      strip = stripOf('start');
    }
    if (!strip.length) {
      return {
        frame: this.catFrame,
        softenStunTint: stunned && !(key === 'stun' && pack.stun.length > 0),
        visualScale: key === 'walkV' ? CAT_VERTICAL_ANIM_SCALE : 1,
        key,
      };
    }

    if (key !== this.catAnimStateKey) {
      this.catAnimStateKey = key;
      this.catAnimTime = 0;
    }
    this.catAnimTime += dt;
    const spf = key === 'attack' ? pack.attackSecPerFrame : pack.secPerFrame;
    const idx = Math.floor(this.catAnimTime / spf) % strip.length;
    const frame = strip[idx] ?? null;
    const showingStunSheet = key === 'stun' && pack.stun.length > 0;
    return {
      frame,
      softenStunTint: stunned && !showingStunSheet,
      visualScale: key === 'walkV' ? CAT_VERTICAL_ANIM_SCALE : 1,
      key,
    };
  }
}
