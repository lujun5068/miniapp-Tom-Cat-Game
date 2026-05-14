import {
  _decorator,
  Color,
  Component,
  Graphics,
  Node,
  Sprite,
  SpriteFrame,
  UITransform,
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

function clearChildren(node: Node): void {
  for (let i = node.children.length - 1; i >= 0; i--) {
    node.children[i].destroy();
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
  private mouseFrame: SpriteFrame | null = null;

  /** 地板 / 外圈 / 内圈石头贴图相对单格的缩放（默认 1 与格对齐） */
  private mapTileScales: MapTileDisplayScales = {
    ...DEFAULT_MAP_TILE_DISPLAY_SCALES,
  };

  private lastMapToken = '';
  private readonly mousePrevGrid = new Map<number, { x: number; y: number }>();

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

  redraw(sim: GameSimulation, anim: CatMotionAnimator, stunned: boolean): void {
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

    this.drawEntities(sim, anim, stunned, gw, gh, t);
  }

  private rebuildMap(sim: GameSimulation): void {
    clearChildren(this.mapGroundLayer);
    clearChildren(this.mapStoneLayer);
    this.mapGfx.clear();
    this.mapObstacleGfx.clear();
    this.mousePrevGrid.clear();
    clearChildren(this.miceRoot);

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
    const n = new Node('cell');
    const ut = n.addComponent(UITransform);
    ut.setAnchorPoint(ax, ay);
    n.setPosition(cx, cy, 0);
    const sp = n.addComponent(Sprite);
    /* 必须先 CUSTOM，再赋 spriteFrame；否则赋帧时会用贴图原始尺寸覆盖 UITransform */
    sp.type = Sprite.Type.SIMPLE;
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    sp.spriteFrame = frame;
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
    gw: number,
    gh: number,
    t: number,
  ): void {
    const cat = anim.getPixelCenter();
    const catR = Math.min(t * 0.38, 18);

    this.entityGfx.clear();

    if (this.catFrame) {
      this.catSpr.enabled = true;
      this.catSpr.spriteFrame = this.catFrame;
      this.catSpr.sizeMode = Sprite.SizeMode.CUSTOM;
      const cut = this.catNode.getComponent(UITransform)!;
      const side = catR * 2.2;
      cut.setContentSize(side, side);
      this.catNode.setPosition(cat.x, cat.y, 0);
      const flip = sim.facing.dx < 0 ? -1 : 1;
      this.catNode.setScale(flip, 1, 1);
      this.catNode.angle = sim.facing.dy > 0 ? 180 : 0;
      this.catSpr.color = stunned ? new Color(255, 200, 200, 255) : Color.WHITE;
    } else {
      this.catSpr.enabled = false;
      this.entityGfx.fillColor = stunned
        ? new Color(200, 120, 120, 255)
        : new Color(240, 160, 90, 255);
      this.entityGfx.circle(cat.x, cat.y, catR);
      this.entityGfx.fill();
    }

    if (this.mouseFrame) {
      const seen = new Set<number>();
      for (const m of sim.mice) {
        seen.add(m.id);
        let n = this.miceRoot.getChildByName(`m-${m.id}`);
        if (!n) {
          n = new Node(`m-${m.id}`);
          const ut = n.addComponent(UITransform);
          ut.setAnchorPoint(0.5, 0.5);
          const sp = n.addComponent(Sprite);
          sp.spriteFrame = this.mouseFrame;
          sp.sizeMode = Sprite.SizeMode.CUSTOM;
          const mr = Math.min(t * 0.22, 11) * 2.2;
          ut.setContentSize(mr, mr);
          this.miceRoot.addChild(n);
        }
        const p = cellCenterLocal(m.x, m.y, gw, gh, t);
        n.setPosition(p.x, p.y, 0);
        const prev = this.mousePrevGrid.get(m.id);
        if (prev && (prev.x !== m.x || prev.y !== m.y)) {
          const dx = m.x - prev.x;
          const dy = m.y - prev.y;
          if (dx !== 0) {
            n.setScale(dx < 0 ? -1 : 1, 1, 1);
          } else if (dy !== 0) {
            n.setScale(1, dy < 0 ? -1 : 1, 1);
          }
        } else if (!prev) {
          n.setScale(1, 1, 1);
        }
        this.mousePrevGrid.set(m.id, { x: m.x, y: m.y });
      }
      for (const c of [...this.miceRoot.children]) {
        const id = Number(c.name.slice(2));
        if (!seen.has(id)) {
          c.destroy();
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
}
