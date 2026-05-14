export type MotionKind = 'walk' | 'jump' | 'attack';

export type MotionEvent = {
  kind: MotionKind;
  from: { x: number; y: number };
  to: { x: number; y: number };
  mergedWalkCells?: number;
};
