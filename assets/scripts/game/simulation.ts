import type { Facing, GameEnd, Mouse } from './types';
import { FACINGS } from './types';
import type { Grid } from './grid';
import { Grid as GridClass } from './grid';
import {
  STUN_DURATION_SEC,
  catchMice,
  evalAttack,
  evalJump,
} from './rules';
import { buildDemoMap } from './demoMap';
import { clampLevel, mouseCountForLevel } from './levelMeta';
import { spawnEntities } from './spawn';
import { stepAllMiceAwayFromCat } from './mouseAi';
import type { MotionEvent } from './motionTypes';

export const DEFAULT_LEVEL_TIME_SEC = 30;

/**
 * 持续按住方向键 / 摇杆时，"走一格"逻辑动作之间的最小间隔（秒）。
 *
 * - 仅控制游戏逻辑节奏（多久允许进入下一格），**不**直接控制视觉移动时长；
 *   走路视觉时长固定由 CatMotionAnimator 的原版公式产生（单格 ~40ms，
 *   2 格合并 ~68ms，配合 easeOutQuad 永远保持平滑曲线）。
 * - 数值越大 → 连走越慢，猫会在两格之间静止等待，方便看清走路帧；
 * - 数值越小 → 连走越快，到 0.04 以下视觉时长会超过 cooldown，
 *   后续输入进入合并队列，由 CatMotionAnimator 的 merge 逻辑吸收（视觉仍平滑）；
 * - 60fps 下硬上限约 30 格/秒（受帧率量化制约），再小也不会更快；
 * - 调试时可直接修改这里，或在 GameController Inspector 的
 *   `Walk Repeat Interval Sec` 上微调（Inspector 优先级更高，且不需要重新编译）。
 *
 * 参考档位：
 *   0.045 = 原版手感（约 22 格/秒，**当前默认**）
 *   0.08  = 偏慢，能看清两格之间的步子
 *   0.12  = 明显慢节奏，每格之间约停顿 80ms
 *   0.03  = 比原版略快（视觉走平滑，逻辑节奏更紧凑）
 */
export const WALK_REPEAT_INTERVAL_SEC = 0.045;

/**
 * 走路间隔的安全下限（秒）。皮肤 speedBuff 扣减后不允许低于此值，
 * 用于兜底防止出现 0 / 负值把 simulation 的 actionCooldown 逻辑打穿。
 * 实际 60fps 下硬上限约 30 格/秒，再小也不会更快，所以 0.005 留作上限之上的余量即可。
 */
export const MIN_WALK_REPEAT_INTERVAL_SEC = 0.005;

export type GameSoundHooks = {
  onLevelStart?: () => void;
  onStun?: () => void;
  onJumpSuccess?: () => void;
  onAttackSuccess?: () => void;
  onCatch?: () => void;
};

export const MICE_STEP_BASE_SEC = 0.28;
export const MICE_STEP_MIN_SEC = 0.1;
export const MICE_SPEED_TIER_STEP = 0.022;

export function miceStepIntervalForLevel(level: number): number {
  const lv = Math.max(1, level);
  const tier = Math.floor((lv - 1) / 3);
  return Math.max(
    MICE_STEP_MIN_SEC,
    MICE_STEP_BASE_SEC - tier * MICE_SPEED_TIER_STEP,
  );
}

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizeMove(dx: number, dy: number): Facing | null {
  if (dx === 0 && dy === 0) return null;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? FACINGS.right : FACINGS.left;
  }
  return dy > 0 ? FACINGS.down : FACINGS.up;
}

export class GameSimulation {
  grid: Grid;
  level = 1;
  catX = 0;
  catY = 0;
  facing: Facing = FACINGS.right;
  mice: Mouse[] = [];
  timeLeft = DEFAULT_LEVEL_TIME_SEC;
  stunnedRemaining = 0;
  actionCooldown = 0;
  /**
   * 连走时每格之间的逻辑最小间隔。运行时可由 GameController 从 Inspector 注入覆盖，
   * 默认取 `WALK_REPEAT_INTERVAL_SEC`。
   */
  walkRepeatIntervalSec = WALK_REPEAT_INTERVAL_SEC;
  gameEnd: GameEnd = 'none';
  private pendingMotion: MotionEvent[] = [];
  private rnd: () => number;
  private miceMoveAcc = 0;
  private seed: number;
  private soundHooks: GameSoundHooks = {};

  constructor(seed = Date.now() & 0xffff_ffff) {
    this.seed = seed;
    this.rnd = mulberry32(seed);
    this.grid = GridClass.fromLines(buildDemoMap());
    this.catX = 1;
    this.catY = 1;
    this.mice = [];
  }

  resetLevel(
    level: number,
    mapLines?: string[] | null,
    opts?: { playLevelStartSfx?: boolean },
  ): void {
    this.level = clampLevel(level);
    this.gameEnd = 'none';
    this.pendingMotion = [];
    this.rnd = mulberry32(this.seed ^ (level * 0x9e37_79b9));
    const lines =
      mapLines && mapLines.length > 0 ? mapLines : buildDemoMap();
    this.grid = GridClass.fromLines(lines);
    const n = mouseCountForLevel(this.level);
    const { cat, mice } = spawnEntities(this.grid, n, this.rnd);
    this.catX = cat.x;
    this.catY = cat.y;
    this.mice = mice;
    this.timeLeft = DEFAULT_LEVEL_TIME_SEC;
    this.stunnedRemaining = 0;
    this.actionCooldown = 0;
    this.miceMoveAcc = 0;
    if (opts?.playLevelStartSfx !== false) {
      this.soundHooks.onLevelStart?.();
    }
  }

  setSoundHooks(hooks: GameSoundHooks): void {
    this.soundHooks = hooks;
  }

  consumeMotionEvent(): MotionEvent | null {
    return this.pendingMotion.shift() ?? null;
  }

  update(dt: number): void {
    if (this.gameEnd !== 'none') return;

    this.timeLeft -= dt;
    if (this.stunnedRemaining > 0) {
      this.stunnedRemaining = Math.max(0, this.stunnedRemaining - dt);
    }
    if (this.actionCooldown > 0) {
      this.actionCooldown = Math.max(0, this.actionCooldown - dt);
    }

    const stepSec = miceStepIntervalForLevel(this.level);
    this.miceMoveAcc += dt;
    while (this.miceMoveAcc >= stepSec) {
      this.miceMoveAcc -= stepSec;
      stepAllMiceAwayFromCat(this.grid, this.mice, this.catX, this.catY, this.rnd);
    }

    this.resolveEnd();
  }

  private resolveEnd(): void {
    if (this.mice.length === 0) {
      this.gameEnd = 'win';
      return;
    }
    if (this.timeLeft <= 0) {
      this.gameEnd = 'lose';
    }
  }

  private canAct(): boolean {
    return (
      this.gameEnd === 'none' &&
      this.stunnedRemaining <= 0 &&
      this.actionCooldown <= 0
    );
  }

  tryMove(dx: number, dy: number): void {
    if (!this.canAct()) return;
    const face = normalizeMove(dx, dy);
    if (!face) return;
    this.facing = face;
    const nx = this.catX + face.dx;
    const ny = this.catY + face.dy;
    if (!this.grid.isWalkable(nx, ny)) return;
    const ox = this.catX;
    const oy = this.catY;
    this.catX = nx;
    this.catY = ny;
    this.pendingMotion.push({
      kind: 'walk',
      from: { x: ox, y: oy },
      to: { x: this.catX, y: this.catY },
    });
    const beforeMice = this.mice.length;
    this.mice = catchMice(this.catX, this.catY, this.mice);
    if (this.mice.length < beforeMice) {
      this.soundHooks.onCatch?.();
    }
    this.actionCooldown = this.walkRepeatIntervalSec;
    this.resolveEnd();
  }

  tryJump(): void {
    if (!this.canAct()) return;
    const r = evalJump(this.grid, this.catX, this.catY, this.facing);
    if (!r.ok) {
      this.stunnedRemaining = STUN_DURATION_SEC;
      this.soundHooks.onStun?.();
    } else {
      const ox = this.catX;
      const oy = this.catY;
      this.catX = r.x;
      this.catY = r.y;
      this.pendingMotion.push({
        kind: 'jump',
        from: { x: ox, y: oy },
        to: { x: this.catX, y: this.catY },
      });
      this.soundHooks.onJumpSuccess?.();
      const beforeMice = this.mice.length;
      this.mice = catchMice(this.catX, this.catY, this.mice);
      if (this.mice.length < beforeMice) {
        this.soundHooks.onCatch?.();
      }
    }
    this.actionCooldown = 0.088;
    this.resolveEnd();
  }

  tryAttack(): void {
    this.tryPounce();
  }

  tryPounce(): void {
    if (!this.canAct()) return;
    const r = evalAttack(this.grid, this.catX, this.catY, this.facing);
    if (!r.ok) {
      this.stunnedRemaining = STUN_DURATION_SEC;
      this.soundHooks.onStun?.();
    } else {
      const ox = this.catX;
      const oy = this.catY;
      this.catX = r.x;
      this.catY = r.y;
      this.pendingMotion.push({
        kind: 'attack',
        from: { x: ox, y: oy },
        to: { x: this.catX, y: this.catY },
      });
      this.soundHooks.onAttackSuccess?.();
      // 攻击为前进两格的冲撞，路径上的老鼠都应被吃掉（不只是终点）。
      const beforeMice = this.mice.length;
      for (const p of r.path) {
        this.mice = catchMice(p.x, p.y, this.mice);
      }
      if (this.mice.length < beforeMice) {
        this.soundHooks.onCatch?.();
      }
      // p1 可走但 p2 被挡：冲到第 1 格后撞晕，仍触发 stun 音效与持续时间。
      if (r.stun) {
        this.stunnedRemaining = STUN_DURATION_SEC;
        this.soundHooks.onStun?.();
      }
    }
    // cooldown 略短于攻击视觉时长（CatMotionAnimator attack durSeg×2 = 0.3s），
    // 允许在视觉收尾的最后 ~50ms 缓存下一次输入，体感连贯但不会让游戏状态
    // 远远跑在视觉前面，避免连按攻击时出现的"瞬移"错觉。
    this.actionCooldown = 0.25;
    this.resolveEnd();
  }

  setFacing(dx: number, dy: number): void {
    const face = normalizeMove(dx, dy);
    if (face) this.facing = face;
  }
}
