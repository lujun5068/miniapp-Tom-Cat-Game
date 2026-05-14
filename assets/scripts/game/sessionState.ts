import { MAX_LEVELS } from './levelMeta';
import { loadLevelSave } from '../storage/levelSave';

export const gameSession = {
  maxUnlocked: 1,
  bests: {} as Record<string, number>,

  initFromDisk(): void {
    const s = loadLevelSave();
    this.maxUnlocked = Math.min(MAX_LEVELS, s.maxUnlockedLevel);
    this.bests = { ...s.bestTimeRemainingSec };
  },

  recordClearedLevel(level: number, timeRemainingSec: number): void {
    const k = String(level);
    this.bests[k] = Math.max(this.bests[k] ?? 0, Math.max(0, timeRemainingSec));
    this.maxUnlocked = Math.min(
      MAX_LEVELS,
      Math.max(this.maxUnlocked, level + 1),
    );
  },
};
