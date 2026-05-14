export enum Cell {
  Empty = 0,
  Obstacle = 1,
}

export type Facing = { readonly dx: -1 | 0 | 1; readonly dy: -1 | 0 | 1 };

export const FACINGS = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
} as const;

export type Mouse = { id: number; x: number; y: number };

export type GameEnd = 'none' | 'win' | 'lose';
