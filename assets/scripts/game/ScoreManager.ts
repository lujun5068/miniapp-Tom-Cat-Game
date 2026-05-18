import { storageGetItem, storageSetItem } from '../storage/platformKv';
import { catSkins } from './skinConfig';

export type ScoreHistoryEntry = {
  id: string;
  type: 'earn' | 'spend';
  amount: number;
  reason: string;
  createdAt: string;
};

type ScoreSaveLegacyV1 = {
  version: 1;
  totalScore?: number;
  lastLoginDate?: string;
  lastLoginPopupShown?: boolean;
  unlockedSkins?: string[];
  currentSkin?: string;
};

type ScoreSaveV2 = {
  version: 2;
  availableScore: number;
  totalEarnedScore: number;
  lastLoginDate: string;
  lastLoginPopupDate: string;
  unlockedSkins: string[];
  currentSkin: string;
  history: ScoreHistoryEntry[];
};

const KEY = 'cat-game-score-v1';
const HISTORY_LIMIT = 50;
const DEFAULT_SKIN_ID = 'default';
const DAILY_LOGIN_REWARD = 10;

const defaultSave = (): ScoreSaveV2 => ({
  version: 2,
  availableScore: 0,
  totalEarnedScore: 0,
  lastLoginDate: '',
  lastLoginPopupDate: '',
  unlockedSkins: [DEFAULT_SKIN_ID],
  currentSkin: DEFAULT_SKIN_ID,
  history: [],
});

export class ScoreManager {
  private static instance: ScoreManager;
  private saveData!: ScoreSaveV2;

  private constructor() {
    this.loadFromDisk();
    this.checkDailyLogin();
  }

  public static getInstance(): ScoreManager {
    if (!ScoreManager.instance) {
      ScoreManager.instance = new ScoreManager();
    }
    return ScoreManager.instance;
  }

  private loadFromDisk(): void {
    try {
      const raw = storageGetItem(KEY);
      if (!raw) {
        this.saveData = defaultSave();
        this.saveToDisk();
        return;
      }
      const o = JSON.parse(raw) as Partial<ScoreSaveV2 | ScoreSaveLegacyV1>;
      if (o.version === 1) {
        this.saveData = this.migrateFromV1(o as ScoreSaveLegacyV1);
        this.saveToDisk();
        return;
      }
      if (o.version !== 2) {
        this.saveData = defaultSave();
        this.saveToDisk();
        return;
      }
      const saved = o as Partial<ScoreSaveV2>;
      this.saveData = {
        version: 2,
        availableScore: this.sanitizeScore(saved.availableScore),
        totalEarnedScore: this.sanitizeScore(saved.totalEarnedScore),
        lastLoginDate: this.sanitizeDate(saved.lastLoginDate),
        lastLoginPopupDate: this.sanitizeDate(saved.lastLoginPopupDate),
        unlockedSkins: this.sanitizeUnlockedSkins(saved.unlockedSkins),
        currentSkin: this.sanitizeCurrentSkin(
          saved.currentSkin,
          saved.unlockedSkins,
        ),
        history: this.sanitizeHistory(saved.history),
      };
      if (this.saveData.totalEarnedScore < this.saveData.availableScore) {
        this.saveData.totalEarnedScore = this.saveData.availableScore;
      }
    } catch {
      this.saveData = defaultSave();
      this.saveToDisk();
    }
  }

  private migrateFromV1(o: ScoreSaveLegacyV1): ScoreSaveV2 {
    const availableScore = this.sanitizeScore(o.totalScore);
    const lastLoginDate = this.sanitizeDate(o.lastLoginDate);
    const unlockedSkins = this.sanitizeUnlockedSkins(o.unlockedSkins);
    const currentSkin = this.sanitizeCurrentSkin(o.currentSkin, unlockedSkins);
    const shouldTreatLegacyPopupAsShown =
      o.lastLoginPopupShown ||
      (typeof o.lastLoginPopupShown !== 'boolean' &&
        lastLoginDate === this.localDateString());
    const lastLoginPopupDate = shouldTreatLegacyPopupAsShown
      ? lastLoginDate
      : '';
    return {
      version: 2,
      availableScore,
      totalEarnedScore: availableScore,
      lastLoginDate,
      lastLoginPopupDate,
      unlockedSkins,
      currentSkin,
      history: [],
    };
  }

  private saveToDisk(): void {
    try {
      storageSetItem(KEY, JSON.stringify(this.saveData));
    } catch {
      /* ignore */
    }
  }

  private checkDailyLogin(): void {
    const today = this.localDateString();
    if (this.saveData.lastLoginDate !== today) {
      this.addScore(DAILY_LOGIN_REWARD, '每日登录奖励');
      this.saveData.lastLoginDate = today;
      this.saveToDisk();
    }
  }

  public shouldShowLoginPopup(): boolean {
    const today = this.localDateString();
    return (
      this.saveData.lastLoginDate === today &&
      this.saveData.lastLoginPopupDate !== today
    );
  }

  public markLoginPopupShown(): void {
    this.saveData.lastLoginPopupDate = this.localDateString();
    this.saveToDisk();
  }

  public addScore(amount: number, reason: string): void {
    const score = this.sanitizeScore(amount);
    if (score <= 0) return;
    this.saveData.availableScore += score;
    this.saveData.totalEarnedScore += score;
    this.pushHistory('earn', score, reason);
    this.saveToDisk();
    console.log(`获得 ${score} 积分: ${reason}`);
  }

  public getTotalScore(): number {
    return this.saveData.availableScore;
  }

  public getTotalEarnedScore(): number {
    return this.saveData.totalEarnedScore;
  }

  public getScoreHistory(): ScoreHistoryEntry[] {
    return [...this.saveData.history];
  }

  public unlockSkin(skinId: string): boolean {
    const skin = catSkins.find((s) => s.id === skinId);
    if (!skin || skin.isDefault) return false;

    if (
      this.saveData.availableScore >= skin.price &&
      !this.saveData.unlockedSkins.includes(skinId)
    ) {
      this.saveData.availableScore -= skin.price;
      this.saveData.unlockedSkins.push(skinId);
      this.pushHistory('spend', skin.price, `兑换皮肤：${skin.name}`);
      this.saveToDisk();
      return true;
    }
    return false;
  }

  public setCurrentSkin(skinId: string): boolean {
    if (this.saveData.unlockedSkins.includes(skinId)) {
      this.saveData.currentSkin = skinId;
      this.saveToDisk();
      return true;
    }
    return false;
  }

  public getCurrentSkin(): string {
    return this.saveData.currentSkin;
  }

  public getUnlockedSkins(): string[] {
    return [...this.saveData.unlockedSkins];
  }

  private pushHistory(
    type: ScoreHistoryEntry['type'],
    amount: number,
    reason: string,
  ): void {
    this.saveData.history.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      amount,
      reason,
      createdAt: new Date().toISOString(),
    });
    this.saveData.history = this.saveData.history.slice(0, HISTORY_LIMIT);
  }

  private sanitizeScore(value: unknown): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.floor(n));
  }

  private sanitizeDate(value: unknown): string {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? value
      : '';
  }

  private sanitizeUnlockedSkins(value: unknown): string[] {
    const knownSkinIds = new Set(catSkins.map((skin) => skin.id));
    const input = Array.isArray(value) ? value : [DEFAULT_SKIN_ID];
    const ids = input.filter(
      (id): id is string => typeof id === 'string' && knownSkinIds.has(id),
    );
    return [...new Set([DEFAULT_SKIN_ID, ...ids])];
  }

  private sanitizeCurrentSkin(
    value: unknown,
    unlockedSkins: unknown,
  ): string {
    const unlocked = this.sanitizeUnlockedSkins(unlockedSkins);
    return typeof value === 'string' && unlocked.includes(value)
      ? value
      : DEFAULT_SKIN_ID;
  }

  private sanitizeHistory(value: unknown): ScoreHistoryEntry[] {
    if (!Array.isArray(value)) return [];
    return value
      .filter((entry): entry is ScoreHistoryEntry => {
        const e = entry as Partial<ScoreHistoryEntry>;
        return (
          typeof e.id === 'string' &&
          (e.type === 'earn' || e.type === 'spend') &&
          this.sanitizeScore(e.amount) > 0 &&
          typeof e.reason === 'string' &&
          typeof e.createdAt === 'string'
        );
      })
      .slice(0, HISTORY_LIMIT);
  }

  private localDateString(date = new Date()): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
