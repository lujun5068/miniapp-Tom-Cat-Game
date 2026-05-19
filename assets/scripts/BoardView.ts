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

const { ccclass } = _decorator;

type CatAnimKey = 'start' | 'walkH' | 'walkV' | 'stun';

type CatAnimPack = {
  secPerFrame: number;
  start: SpriteFrame[];
  walkH: SpriteFrame[];
  walkV: SpriteFrame[];
  stun: SpriteFrame[];
};

const CAT_VERTICAL_ANIM_SCALE = 0.75;

/** 按资源名中的 frame_序号 排序（如从 GIF 拆出的 frame_00_delay-0.2s） */
function sortCatSpriteFrames(frames: SpriteFrame[]): SpriteFrame[] {
  const frameIndex = (sf: SpriteFrame): number => {
    const name = sf.name ?? '';
    const m = /frame_(\d+)/i.exec(name);
    return m ? parseInt(m[1], 10) : 0;
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
   * 猫多帧动画：`start` / `walk1`(水平) / `walk2`(纵向) / `xuanyun`(眩晕)。
   * 各数组在 Inspector 中拖入对应文件夹下全部 SpriteFrame 即可（可不手动排序）。
   * 若某状态数组为空，则回退到 `sfCat` 单帧（由 `configureSprites` 传入）。
   */
  configureCatFrameAnimations(opts: {
    framesStart?: SpriteFrame[] | null;
    framesWalkHorizontal?: SpriteFrame[] | null;
    framesWalkVertical?: SpriteFrame[] | null;
    framesStun?: SpriteFrame[] | null;
    frameDurationSec?: number;
  }): void {
    const start = sortCatSpriteFrames([...(opts.framesStart ?? [])]);
    const walkH = sortCatSpriteFrames([...(opts.framesWalkHorizontal ?? [])]);
    const walkV = sortCatSpriteFrames([...(opts.framesWalkVertical ?? [])]);
    const stun = sortCatSpriteFrames([...(opts.framesStun ?? [])]);
    if (!start.length && !walkH.length && !walkV.length && !stun.length) {
      this.catAnim = null;
      this.catAnimStateKey = '';
      this.catAnimTime = 0;
      return;
    }
    this.catAnim = {
      secPerFrame: Math.max(0.04, opts.frameDurationSec ?? 0.2),
      start,
      walkH,
      walkV,
      stun,
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
      const flip =
        catAnimKey === 'start' && !orientStartToFacing
          ? 1
          : catAnimKey === 'start'
            ? sim.facing.dx < 0
              ? -1
              : 1
            : sim.facing.dx > 0
              ? -1
              : 1;
      this.catNode.setScale(flip * catVisualScale, catVisualScale, 1);
      let angle = sim.facing.dy > 0 ? 180 : 0;
      if (catAnimKey === 'start') {
        if (!orientStartToFacing) {
          angle = 0;
        } else if (sim.facing.dy < 0) {
          angle = 90;
        } else if (sim.facing.dy > 0) {
          angle = 270;
        }
      }
      this.catNode.angle = angle;
      this.catSpr.color = softenStunTint
        ? new Color(255, 200, 200, 255)
        : this.catTint;
    } else {
      this.catSpr.enabled = false;
      this.entityGfx.fillColor = stunned
        ? new Color(200, 120, 120, 255)
        : this.catTint;
      this.entityGfx.circle(cat.x, cat.y, catR);
      this.entityGfx.fill();
    }

    if (this.mouseFrame) {
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
        if (prev && (prev.x !== m.x || prev.y !== m.y)) {
          const dx = m.x - prev.x;
          const dy = m.y - prev.y;
          if (dx !== 0) {
            sp.spriteFrame = this.mouseFrame;
            /* 贴图默认朝向与网格位移相反时需左右翻转 */
            n.setScale(dx > 0 ? -1 : 1, 1, 1);
          } else if (dy !== 0) {
            sp.spriteFrame = this.mouseFrameVertical ?? this.mouseFrame;
            n.setScale(1, dy > 0 ? -1 : 1, 1);
          }
        } else if (!prev) {
          sp.spriteFrame = this.mouseFrame;
          n.setScale(1, 1, 1);
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
      if (mk === 'walk') {
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
    const idx = Math.floor(this.catAnimTime / pack.secPerFrame) % strip.length;
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
