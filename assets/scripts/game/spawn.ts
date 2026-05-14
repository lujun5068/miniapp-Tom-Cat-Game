import type { Grid } from './grid';
import type { Mouse } from './types';

const DEFAULT_MIN_DIST = 3;

function manhattan(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function shuffle<T>(arr: T[], rnd: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
}

export type SpawnResult = {
  cat: { x: number; y: number };
  mice: Mouse[];
};

export function spawnEntities(
  grid: Grid,
  mouseCount: number,
  rnd: () => number,
  minDist: number = DEFAULT_MIN_DIST,
): SpawnResult {
  const empties = grid.listEmptyCells();
  shuffle(empties, rnd);

  for (let attempt = 0; attempt < 80; attempt++) {
    const cat = empties[Math.floor(rnd() * empties.length)];
    if (!cat) break;

    const candidates = empties.filter((p) => manhattan(p, cat) >= minDist);
    shuffle(candidates, rnd);

    const mice: Mouse[] = [];
    let id = 0;
    for (const p of candidates) {
      if (mice.length >= mouseCount) break;
      if (mice.every((m) => manhattan(m, p) >= minDist)) {
        mice.push({ id: id++, x: p.x, y: p.y });
      }
    }

    if (mice.length === mouseCount) {
      return { cat, mice };
    }
  }

  const cat = empties[0] ?? { x: 1, y: 1 };
  const mice: Mouse[] = [];
  let nid = 0;
  for (const p of empties) {
    if (mice.length >= mouseCount) break;
    if (manhattan(p, cat) >= minDist) {
      mice.push({ id: nid++, x: p.x, y: p.y });
    }
  }
  while (mice.length < mouseCount && empties.length > 0) {
    const p = empties[mice.length % empties.length];
    if (!mice.some((m) => m.x === p.x && m.y === p.y)) {
      mice.push({ id: nid++, x: p.x, y: p.y });
    } else break;
  }

  return { cat, mice };
}
