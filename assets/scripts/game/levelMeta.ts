export const MAX_LEVELS = 30;
export const MAX_MICE = 15;

export function clampLevel(level: number): number {
  const n = Math.floor(Number(level)) || 1;
  return Math.min(MAX_LEVELS, Math.max(1, n));
}

export function mouseCountForLevel(level: number): number {
  return Math.min(MAX_MICE, Math.max(1, clampLevel(level)));
}
