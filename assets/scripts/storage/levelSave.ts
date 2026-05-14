import { sys } from 'cc';
import { MAX_LEVELS } from '../game/levelMeta';

const KEY = 'cat-game-level-v1';

export type LevelSaveV1 = {
  version: 1;
  maxUnlockedLevel: number;
  lastPlayedLevel: number;
  bestTimeRemainingSec: Record<string, number>;
  lastMapLines: string[] | null;
};

const defaultSave = (): LevelSaveV1 => ({
  version: 1,
  maxUnlockedLevel: 1,
  lastPlayedLevel: 1,
  bestTimeRemainingSec: {},
  lastMapLines: null,
});

export function loadLevelSave(): LevelSaveV1 {
  try {
    const raw = sys.localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    const o = JSON.parse(raw) as Partial<LevelSaveV1>;
    if (o.version !== 1) return defaultSave();
    return {
      version: 1,
      maxUnlockedLevel: Math.min(
        MAX_LEVELS,
        Math.max(1, Number(o.maxUnlockedLevel) || 1),
      ),
      lastPlayedLevel: Math.min(
        MAX_LEVELS,
        Math.max(1, Number(o.lastPlayedLevel) || 1),
      ),
      bestTimeRemainingSec:
        o.bestTimeRemainingSec && typeof o.bestTimeRemainingSec === 'object'
          ? o.bestTimeRemainingSec
          : {},
      lastMapLines: Array.isArray(o.lastMapLines)
        ? (o.lastMapLines as string[])
        : null,
    };
  } catch {
    return defaultSave();
  }
}

export function writeLevelSave(data: LevelSaveV1): void {
  try {
    sys.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

export function clearLevelSave(): void {
  try {
    sys.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
