import { buildDemoMap } from './demoMap';
import { MAX_LEVELS } from './levelMeta';
import type { GameSimulation } from './simulation';
import { gameSession } from './sessionState';
import {
  clearLevelSave,
  loadLevelSave,
  writeLevelSave,
  type LevelSaveV1,
} from '../storage/levelSave';

export function getEffectiveMaxUnlockedLevel(): number {
  const disk = loadLevelSave().maxUnlockedLevel;
  return Math.min(MAX_LEVELS, Math.max(disk, gameSession.maxUnlocked));
}

export function saveProgressToDisk(sim: GameSimulation): void {
  const s = loadLevelSave();
  const next: LevelSaveV1 = {
    version: 1,
    lastPlayedLevel: Math.min(MAX_LEVELS, Math.max(1, sim.level)),
    maxUnlockedLevel: Math.min(
      MAX_LEVELS,
      Math.max(1, s.maxUnlockedLevel, gameSession.maxUnlocked),
    ),
    bestTimeRemainingSec: { ...s.bestTimeRemainingSec },
    lastMapLines: buildDemoMap().slice(),
  };
  for (const [k, v] of Object.entries(gameSession.bests)) {
    next.bestTimeRemainingSec[k] = Math.max(
      next.bestTimeRemainingSec[k] ?? 0,
      v,
    );
  }
  writeLevelSave(next);
}

export function resetProgressOnDisk(): void {
  clearLevelSave();
  gameSession.initFromDisk();
}
