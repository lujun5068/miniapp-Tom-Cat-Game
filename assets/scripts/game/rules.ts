import type { Facing, Mouse } from './types';
import { Cell } from './types';
import type { Grid } from './grid';

export const STUN_DURATION_SEC = 1;

export type JumpResult =
  | { ok: true; x: number; y: number }
  | { ok: false; stun: true };

/**
 * 攻击判定结果：
 * - `ok: false, stun: true`：起步即被挡（p1 不可走），原地眩晕、不移动。
 * - `ok: true, stun: true`：冲撞中段被挡（p1 可走但 p2 不可走），前进到 p1 后眩晕；`path = [p1]`。
 * - `ok: true`：两格畅通，前进到 p2；`path = [p1, p2]`。
 */
export type AttackResult =
  | {
      ok: true;
      x: number;
      y: number;
      path: { x: number; y: number }[];
      stun?: boolean;
    }
  | { ok: false; stun: true };

/**
 * 是否是"墙"。
 * - 越界视为墙（外部空气墙）。
 * - 障碍格位于地图外圈（x==0 / y==0 / x==w-1 / y==h-1）也视为墙；与 `BoardView.isMapOuterRing`
 *   保持同样的几何判据，外圈障碍在视觉上铺 `edge` 贴图、内圈障碍才是石头。
 * - 内圈障碍（石头）不算墙，仍可跳跃越过。
 */
export function isWallCell(grid: Grid, x: number, y: number): boolean {
  if (!grid.inBounds(x, y)) return true;
  const cell = grid.get(x, y);
  if (cell !== Cell.Obstacle) return false;
  return (
    x === 0 || y === 0 || x === grid.width - 1 || y === grid.height - 1
  );
}

/**
 * 跳跃判定（更新后）：
 * 1. 前方下一格是墙（含越界）→ 眩晕。
 * 2. 前方下一格空地 → 前进 1 格落点 = 前方一格。
 * 3. 前方下一格是石头（内圈障碍）→ 沿用越过逻辑：检查 `+2dx,+2dy` 是否可走，
 *    可走则跳到 2 格落点，否则眩晕。
 */
export function evalJump(
  grid: Grid,
  ax: number,
  ay: number,
  face: Facing,
): JumpResult {
  const bx = ax + face.dx;
  const by = ay + face.dy;
  if (isWallCell(grid, bx, by)) {
    return { ok: false, stun: true };
  }
  const bCell = grid.get(bx, by);
  if (bCell === Cell.Empty) {
    return { ok: true, x: bx, y: by };
  }
  // 走到这里说明 b 是 Obstacle 但非墙（即内圈石头）
  const cx = ax + face.dx * 2;
  const cy = ay + face.dy * 2;
  if (!grid.isWalkable(cx, cy)) {
    return { ok: false, stun: true };
  }
  return { ok: true, x: cx, y: cy };
}

/**
 * 攻击判定（更新后）：尝试前进 **2 格** 的冲撞。
 * - p1 不可走 → 原地眩晕，不移动；
 * - p1 可走、p2 不可走 → 前进到 p1 后眩晕（撞墙 / 撞障碍效果，`path = [p1]`，`stun: true`）；
 * - p1 / p2 都可走 → 正常冲撞两格落到 p2，`path = [p1, p2]`，不眩晕。
 * 调用方按 `path` 逐格 catchMice，保证沿途的老鼠也会被吃掉。
 */
export function evalAttack(
  grid: Grid,
  ax: number,
  ay: number,
  face: Facing,
): AttackResult {
  const p1x = ax + face.dx;
  const p1y = ay + face.dy;
  if (!grid.isWalkable(p1x, p1y)) {
    return { ok: false, stun: true };
  }
  const p2x = ax + face.dx * 2;
  const p2y = ay + face.dy * 2;
  if (!grid.isWalkable(p2x, p2y)) {
    return {
      ok: true,
      x: p1x,
      y: p1y,
      path: [{ x: p1x, y: p1y }],
      stun: true,
    };
  }
  return {
    ok: true,
    x: p2x,
    y: p2y,
    path: [
      { x: p1x, y: p1y },
      { x: p2x, y: p2y },
    ],
  };
}

export function catchMice(
  catX: number,
  catY: number,
  mice: Mouse[],
): Mouse[] {
  return mice.filter((m) => !(m.x === catX && m.y === catY));
}
