import type { MotionEvent, MotionKind } from './game/motionTypes';

type Active =
  | {
      kind: 'walk';
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
      t: number;
      dur: number;
    }
  | {
      kind: 'attack';
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
      seg: 0 | 1;
      t: number;
      durSeg: number;
    }
  | {
      kind: 'jump';
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
      seg: 0 | 1;
      t: number;
      durSeg: number;
      perpX: number;
      perpY: number;
    };

function gridCenterPx(
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

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

function easeOutQuad(u: number): number {
  return 1 - (1 - u) * (1 - u);
}

export class CatMotionAnimator {
  private active: Active | null = null;
  private readonly queue: MotionEvent[] = [];
  private px: number;
  private py: number;

  constructor(
    catGridX: number,
    catGridY: number,
    private gridW: number,
    private gridH: number,
    private tile: number,
  ) {
    const c = gridCenterPx(catGridX, catGridY, gridW, gridH, tile);
    this.px = c.x;
    this.py = c.y;
  }

  setGridTile(gridW: number, gridH: number, tile: number): void {
    this.gridW = gridW;
    this.gridH = gridH;
    this.tile = tile;
  }

  snapToGrid(catGridX: number, catGridY: number): void {
    this.active = null;
    this.queue.length = 0;
    const c = gridCenterPx(
      catGridX,
      catGridY,
      this.gridW,
      this.gridH,
      this.tile,
    );
    this.px = c.x;
    this.py = c.y;
  }

  enqueue(ev: MotionEvent): void {
    if (ev.kind === 'walk') {
      const last = this.queue[this.queue.length - 1];
      if (
        last?.kind === 'walk' &&
        last.to.x === ev.from.x &&
        last.to.y === ev.from.y
      ) {
        last.to = { x: ev.to.x, y: ev.to.y };
        last.mergedWalkCells = (last.mergedWalkCells ?? 1) + 1;
        return;
      }
    }
    this.queue.push(ev);
  }

  start(ev: MotionEvent): void {
    this.enqueue(ev);
  }

  private begin(ev: MotionEvent): void {
    const fromX = this.px;
    const fromY = this.py;
    const to = gridCenterPx(
      ev.to.x,
      ev.to.y,
      this.gridW,
      this.gridH,
      this.tile,
    );
    if (ev.kind === 'walk') {
      const cells = Math.min(6, Math.max(1, ev.mergedWalkCells ?? 1));
      // 行走视觉时长公式（保持原版手感）：每格基线 ~28ms + 起步常量 12ms。
      // 单格 = 40ms（在 60fps 下 ≈ 2.4 帧，配合 easeOutQuad 出现 3 帧平滑曲线，
      // 避免和 walkRepeatIntervalSec 等长时出现"瞬移→静止→瞬移"的卡顿感）。
      // 多格合并时（高频连按 / 卡顿后补播）每格摊薄到 ~30ms，让视觉追上游戏状态。
      const dur = 0.028 * cells + 0.012;
      this.active = {
        kind: 'walk',
        fromX,
        fromY,
        toX: to.x,
        toY: to.y,
        t: 0,
        dur,
      };
      return;
    }
    if (ev.kind === 'attack') {
      // 每段 0.15s × 2 段 = 总 0.3s。与攻击帧动画一个完整循环（5 帧 × 0.06s）
      // 时长对齐，使玩家能看到完整的"扑击"动作而非瞬移；同时保留冲撞感不至于拖沓。
      this.active = {
        kind: 'attack',
        fromX,
        fromY,
        toX: to.x,
        toY: to.y,
        seg: 0,
        t: 0,
        durSeg: 0.11,
      };
      return;
    }
    const dx = to.x - fromX;
    const dy = to.y - fromY;
    const len = Math.hypot(dx, dy) || 1;
    const perpX = (-dy / len) * 14;
    const perpY = (dx / len) * 14;
    this.active = {
      kind: 'jump',
      fromX,
      fromY,
      toX: to.x,
      toY: to.y,
      seg: 0,
      t: 0,
      durSeg: 0.04,
      perpX,
      perpY,
    };
  }

  update(dt: number, catGridX: number, catGridY: number): void {
    if (!this.active) {
      const next = this.queue.shift();
      if (next) {
        this.begin(next);
      } else {
        // 直接设置位置，避免每次都计算
        const c = gridCenterPx(
          catGridX,
          catGridY,
          this.gridW,
          this.gridH,
          this.tile,
        );
        if (this.px !== c.x || this.py !== c.y) {
          this.px = c.x;
          this.py = c.y;
        }
        return;
      }
    }

    const a = this.active;
    if (!a) return;

    // 避免除以零
    const dtNormalized = dt > 0 ? dt : 0.001;

    if (a.kind === 'walk') {
      a.t += dtNormalized / a.dur;
      if (a.t >= 1) {
        this.px = a.toX;
        this.py = a.toY;
        this.active = null;
        return;
      }
      const u = easeOutQuad(a.t);
      this.px = lerp(a.fromX, a.toX, u);
      this.py = lerp(a.fromY, a.toY, u);
      return;
    }

    if (a.kind === 'attack') {
      // 预计算中间点
      const midX = lerp(a.fromX, a.toX, 0.55);
      const midY = lerp(a.fromY, a.toY, 0.55);

      a.t += dtNormalized / a.durSeg;
      if (a.t >= 1) {
        if (a.seg === 0) {
          a.seg = 1;
          a.t = 0;
        } else {
          this.px = a.toX;
          this.py = a.toY;
          this.active = null;
        }
        return;
      }

      const u = easeOutQuad(a.t);
      if (a.seg === 0) {
        this.px = lerp(a.fromX, midX, u);
        this.py = lerp(a.fromY, midY, u);
      } else {
        this.px = lerp(midX, a.toX, u);
        this.py = lerp(midY, a.toY, u);
      }
      return;
    }

    // 跳跃动画
    const midX = lerp(a.fromX, a.toX, 0.5);
    const midY = lerp(a.fromY, a.toY, 0.5);

    a.t += dtNormalized / a.durSeg;
    if (a.t >= 1) {
      if (a.seg === 0) {
        a.seg = 1;
        a.t = 0;
      } else {
        this.px = a.toX;
        this.py = a.toY;
        this.active = null;
      }
      return;
    }

    const u = easeOutQuad(a.t);
    const arc = Math.sin(u * Math.PI);
    if (a.seg === 0) {
      this.px = lerp(a.fromX, midX, u) + a.perpX * arc;
      this.py = lerp(a.fromY, midY, u) + a.perpY * arc;
    } else {
      this.px = lerp(midX, a.toX, u) + a.perpX * arc;
      this.py = lerp(midY, a.toY, u) + a.perpY * arc;
    }
  }

  getPixelCenter(): { x: number; y: number } {
    return { x: this.px, y: this.py };
  }

  getActiveMotionKind(): MotionKind | null {
    return this.active?.kind ?? null;
  }

  /**
   * 仅在 `walk` 时有效：相对格子的行走是否主要为水平方向（否则为纵向）。
   */
  getWalkIsHorizontal(): boolean | null {
    if (this.active?.kind !== 'walk') return null;
    const { fromX, fromY, toX, toY } = this.active;
    const adx = Math.abs(toX - fromX);
    const ady = Math.abs(toY - fromY);
    if (adx < 1e-6 && ady < 1e-6) return null;
    return adx >= ady;
  }
}
