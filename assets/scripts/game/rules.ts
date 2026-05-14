import type { Facing, Mouse } from './types';
import { Cell } from './types';
import type { Grid } from './grid';

export const STUN_DURATION_SEC = 1;

export type JumpResult =
  | { ok: true; x: number; y: number }
  | { ok: false; stun: true };

export type AttackResult =
  | { ok: true; x: number; y: number }
  | { ok: false; stun: true };

export function evalJump(
  grid: Grid,
  ax: number,
  ay: number,
  face: Facing,
): JumpResult {
  const bx = ax + face.dx;
  const by = ay + face.dy;
  const cx = ax + face.dx * 2;
  const cy = ay + face.dy * 2;

  const bCell = grid.get(bx, by);
  if (bCell === undefined || bCell !== Cell.Obstacle) {
    return { ok: false, stun: true };
  }
  if (!grid.isWalkable(cx, cy)) {
    return { ok: false, stun: true };
  }
  return { ok: true, x: cx, y: cy };
}

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
  return { ok: true, x: p1x, y: p1y };
}

export function catchMice(
  catX: number,
  catY: number,
  mice: Mouse[],
): Mouse[] {
  return mice.filter((m) => !(m.x === catX && m.y === catY));
}
