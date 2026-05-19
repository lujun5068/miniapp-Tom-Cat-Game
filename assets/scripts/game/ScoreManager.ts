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
  /** 当日失败积分入账日期（本地 YYYY-MM-DD），用于按天重置计数 */
  failureRewardDate: string;
  /** 当日失败积分入账次数；达到 DAILY_LOSE_CAP_COUNT 后停止发放 */
  failureRewardCount: number;
  /** 当日分享奖励入账日期（本地 YYYY-MM-DD），用于按天判定是否已发放 */
  shareRewardDate: string;
};

const KEY = 'cat-game-score-v1';
const HISTORY_LIMIT = 50;
const DEFAULT_SKIN_ID = 'default';
const DAILY_LOGIN_REWARD = 10;
/** 每日失败积分入账次数上限（按 +2/次 即每日失败最多额外 +20 分） */
const DAILY_LOSE_CAP_COUNT = 10;
/** 分享奖励：每日最多 1 次 +10 积分 */
const DAILY_SHARE_REWARD = 10;

const defaultSave = (): ScoreSaveV2 => ({
  version: 2,
  availableScore: 0,
  totalEarnedScore: 0,
  lastLoginDate: '',
  lastLoginPopupDate: '',
  unlockedSkins: [DEFAULT_SKIN_ID],
  currentSkin: DEFAULT_SKIN_ID,
  history: [],
  failureRewardDate: '',
  failureRewardCount: 0,
  shareRewardDate: '',
});

export type DailyLoginRewardResult = {
  /** 是否本次调用真正发放了奖励（首调用 / 跨日时为 true） */
  granted: boolean;
  /** 实际入账的积分；未发放时为 0 */
  amount: number;
};

export class ScoreManager {
  private static instance: ScoreManager;
  private saveData!: ScoreSaveV2;

  /**
   * 构造函数只做存档加载，不再附带"发放每日登录奖励"等业务副作用。
   * 这样测试脚本 / 工具入口拿到实例时不会被动触发奖励发放或写盘。
   * 主游戏流程应在 `GameController.onLoad` 等场景控制入口显式调用
   * {@link claimDailyLoginRewardIfNeeded}。
   */
  private constructor() {
    this.loadFromDisk();
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
        failureRewardDate: this.sanitizeDate(saved.failureRewardDate),
        failureRewardCount: this.sanitizeScore(saved.failureRewardCount),
        shareRewardDate: this.sanitizeDate(saved.shareRewardDate),
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
      // 注意：v1 存档只记录了当前余额 totalScore，没有"累计获得"信息。
      // 这里只能把当前余额作为累计获得的下界；如果该玩家曾经获得 200 已花掉 100，
      // 迁移后展示的累计获得仍是 100，无法恢复真实历史。属于不可逆的历史数据丢失。
      totalEarnedScore: availableScore,
      lastLoginDate,
      lastLoginPopupDate,
      unlockedSkins,
      currentSkin,
      history: [],
      failureRewardDate: '',
      failureRewardCount: 0,
      shareRewardDate: '',
    };
  }

  private saveToDisk(): void {
    try {
      storageSetItem(KEY, JSON.stringify(this.saveData));
    } catch {
      /* ignore */
    }
  }

  /**
   * 当日首次调用：发放每日登录奖励并写盘；同一日内重复调用是幂等的 no-op。
   * 返回值用于上层（例如登录弹窗）展示实际发放金额，便于未来改成动态金额。
   *
   * 注意：本方法只负责"积分入账 + 写盘"，不会自动弹窗。弹窗的展示状态由
   * {@link shouldShowLoginPopup} / {@link markLoginPopupShown} 控制，便于先入账
   * 后展示，且即使本次没看到弹窗也只会下次再展示一次（不会重复发奖）。
   */
  public claimDailyLoginRewardIfNeeded(): DailyLoginRewardResult {
    const today = this.localDateString();
    if (this.saveData.lastLoginDate === today) {
      return { granted: false, amount: 0 };
    }
    this.addScore(DAILY_LOGIN_REWARD, '每日登录奖励');
    this.saveData.lastLoginDate = today;
    this.saveToDisk();
    return { granted: true, amount: DAILY_LOGIN_REWARD };
  }

  /**
   * 是否还需要展示今日的登录奖励弹窗。仅当 {@link claimDailyLoginRewardIfNeeded}
   * 已把当日积分入账（即 lastLoginDate === 今日）且尚未确认过弹窗时返回 true。
   * 这保证了"入账与弹窗解耦"——即便上次没看到弹窗，下次再开仍会展示，
   * 但不会重复发奖。
   */
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

  /**
   * 失败积分专用入口：每日最多入账 DAILY_LOSE_CAP_COUNT 次，超出后静默忽略。
   * 返回实际入账的积分数；0 表示已达每日上限未入账。
   * 用于防止玩家用秒输刷分（结算后立刻重玩、再秒输）。
   */
  public addLoseReward(amount: number, reason: string): number {
    const score = this.sanitizeScore(amount);
    if (score <= 0) return 0;
    const today = this.localDateString();
    const dayChanged = this.saveData.failureRewardDate !== today;
    if (dayChanged) {
      this.saveData.failureRewardDate = today;
      this.saveData.failureRewardCount = 0;
    }
    if (this.saveData.failureRewardCount >= DAILY_LOSE_CAP_COUNT) {
      // 当日已超额：只在跨日重置时才需要写盘，普通超额命中走 no-op 节省 IO。
      if (dayChanged) this.saveToDisk();
      return 0;
    }
    this.saveData.failureRewardCount += 1;
    this.addScore(score, reason);
    return score;
  }

  /** 当日失败积分剩余可入账次数，便于 UI 展示提示 */
  public getLoseRewardRemainingToday(): number {
    const today = this.localDateString();
    if (this.saveData.failureRewardDate !== today) return DAILY_LOSE_CAP_COUNT;
    return Math.max(
      0,
      DAILY_LOSE_CAP_COUNT - this.saveData.failureRewardCount,
    );
  }

  /**
   * 分享奖励：玩家发起一次微信分享即可获得 DAILY_SHARE_REWARD 积分，
   * 每日仅入账 1 次，跨日自动重置。返回值是实际入账积分（0 表示当日已发放过）。
   *
   * 注意：调用入口（如 `setupWechatShare.onShareSuccess` 回调）每次分享可能触发多次
   * （onShareAppMessage 与 onShareTimeline 都会回调），但本方法是幂等的：
   * 同一天内只会入账一次，重复调用直接返回 0，无需上层去重。
   */
  public addShareReward(reason = '分享游戏'): number {
    const today = this.localDateString();
    if (this.saveData.shareRewardDate === today) {
      return 0;
    }
    this.saveData.shareRewardDate = today;
    this.addScore(DAILY_SHARE_REWARD, reason);
    return DAILY_SHARE_REWARD;
  }

  /** 当日是否还可领取分享奖励，便于 UI 文案区分"分享 +10"或"今日已领取" */
  public canClaimShareRewardToday(): boolean {
    return this.saveData.shareRewardDate !== this.localDateString();
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
