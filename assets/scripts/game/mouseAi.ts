import type { Grid } from './grid';
import type { Mouse } from './types';

const NEI: readonly [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

function distanceField(
  grid: Grid,
  cx: number,
  cy: number,
): { w: number; h: number; d: Int32Array } {
  const w = grid.width;
  const h = grid.height;
  const d = new Int32Array(w * h);
  d.fill(-1);
  const idx = (x: number, y: number) => y * w + x;

  if (!grid.isWalkable(cx, cy)) {
    return { w, h, d };
  }

  const qx: number[] = [cx];
  const qy: number[] = [cy];
  d[idx(cx, cy)] = 0;
  let head = 0;

  while (head < qx.length) {
    const x = qx[head];
    const y = qy[head];
    head++;
    const base = d[idx(x, y)];
    for (const [dx, dy] of NEI) {
      const nx = x + dx;
      const ny = y + dy;
      if (!grid.isWalkable(nx, ny)) continue;
      const i = idx(nx, ny);
      if (d[i] !== -1) continue;
      d[i] = base + 1;
      qx.push(nx);
      qy.push(ny);
    }
  }

  return { w, h, d };
}

type DistanceField = ReturnType<typeof distanceField>;

function distAt(field: DistanceField, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= field.w || y >= field.h) return -1;
  return field.d[y * field.w + x];
}

type Cand = { x: number; y: number; dist: number };

function stepMouseWithField(
  grid: Grid,
  mouse: Mouse,
  field: DistanceField,
  rnd: () => number,
): void {
  const here = distAt(field, mouse.x, mouse.y);
  if (here < 0) return;

  const cands: Cand[] = [];

  for (const [dx, dy] of NEI) {
    const nx = mouse.x + dx;
    const ny = mouse.y + dy;
    if (!grid.isWalkable(nx, ny)) continue;
    const di = distAt(field, nx, ny);
    if (di < 0) continue;
    cands.push({ x: nx, y: ny, dist: di });
  }

  if (cands.length === 0) return;

  let bestDist = -1;
  let pick = cands[0];
  let tieSize = 0;
  for (const c of cands) {
    if (c.dist > bestDist) {
      bestDist = c.dist;
      pick = c;
      tieSize = 1;
    } else if (c.dist === bestDist) {
      tieSize++;
      if (Math.floor(rnd() * tieSize) === 0) pick = c;
    }
  }
  mouse.x = pick.x;
  mouse.y = pick.y;
}

export function stepAllMiceAwayFromCat(
  grid: Grid,
  mice: readonly Mouse[],
  catX: number,
  catY: number,
  rnd: () => number,
): void {
  if (mice.length === 0) return;
  const field = distanceField(grid, catX, catY);
  for (let i = 0; i < mice.length; i++) {
    stepMouseWithField(grid, mice[i], field, rnd);
  }
}
