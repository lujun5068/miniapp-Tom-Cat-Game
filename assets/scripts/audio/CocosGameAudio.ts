import { AudioClip, AudioSource, Node } from 'cc';
import {
  loadAudioSettings,
  saveAudioSettings,
  type AudioSettingsV1,
} from '../storage/audioSettings';
import type {
  CatAudioAction,
  CatSkinAudioPack,
} from '../game/catAudioLoader';

/**
 * 与网页版 `gameAudio.ts` 资源一一对应。`bgmMain` 不在此处提供：
 * BGM (490KB) 已迁出主场景依赖图、改为通过 `assetManager.loadBundle('audio-stream')`
 * 异步加载，加载完再调用 `setBgmClip` 注入；首屏包体可省去这部分大小。
 * 其余 sfx/start 体积小（<30KB），仍保留 Inspector 拖入。
 */
export type GameAudioClipBundle = {
  levelStart: AudioClip | null;
  sfxJump: AudioClip | null;
  sfxAttack: AudioClip | null;
  sfxCatch: AudioClip | null;
  sfxStun: AudioClip | null;
  sfxWin: AudioClip | null;
  sfxLose: AudioClip | null;
  sfxUi: AudioClip | null;
};

export class CocosGameAudio {
  private settings: AudioSettingsV1;
  private unlocked = false;
  private readonly bgm: AudioSource;
  private readonly sfx: AudioSource;
  private readonly clips: GameAudioClipBundle;
  // BGM 通过 setBgmClip 运行时注入（来自 audio-stream 分包），未注入前为 null。
  private bgmClip: AudioClip | null = null;
  /**
   * 当前皮肤特化音覆盖层：`start / jump / attack / stun` 优先于 `clips.levelStart / sfxJump / sfxAttack / sfxStun`。
   * 由 `GameController.applyCurrentCatSkin → catAudioLoader.loadCatSkinAudio` 异步注入；
   * 对应 action 缺失时（值为 null/undefined）回退到 Inspector 配置的通用 clip。
   */
  private skinClips: Partial<CatSkinAudioPack> = {};
  /** 当前皮肤击杀包：1kill…8kill（下标 0 = 1kill），由 `killAudio` 字段决定包路径。 */
  private killClips: (AudioClip | null)[] = [];

  constructor(host: Node, clips: GameAudioClipBundle) {
    this.clips = clips;
    this.settings = loadAudioSettings();

    const bgmNode = new Node('BgmAudio');
    host.addChild(bgmNode);
    this.bgm = bgmNode.addComponent(AudioSource);
    // bgm clip 由 setBgmClip 后续注入。
    this.bgm.loop = true;
    this.bgm.playOnAwake = false;
    this.bgm.volume = 0.35;

    const sfxNode = new Node('SfxAudio');
    host.addChild(sfxNode);
    this.sfx = sfxNode.addComponent(AudioSource);
    this.sfx.playOnAwake = false;
    this.sfx.volume = 1;
  }

  /**
   * 注入主循环 BGM clip（通常由 `audio-stream` 分包异步加载完成后调用）。
   * 传 null 可清空。注入后若 `settings.bgmEnabled && unlocked` 自动尝试播放，
   * 兼容"clip 加载比首次用户手势更晚"的场景。
   */
  setBgmClip(clip: AudioClip | null): void {
    this.bgmClip = clip;
    this.bgm.clip = clip;
    if (clip) this.tryPlayBgm();
  }

  unlockFromUserGesture(): void {
    if (this.unlocked) return;
    this.unlocked = true;
  }

  getSettings(): AudioSettingsV1 {
    return { ...this.settings };
  }

  setBgmEnabled(on: boolean): void {
    this.settings.bgmEnabled = on;
    saveAudioSettings(this.settings);
    if (on) {
      void this.tryPlayBgm();
    } else {
      this.bgm.stop();
    }
  }

  setSfxEnabled(on: boolean): void {
    this.settings.sfxEnabled = on;
    saveAudioSettings(this.settings);
  }

  pauseBgm(): void {
    this.bgm.pause();
  }

  syncBgmPlayback(): void {
    if (!this.settings.bgmEnabled) {
      this.bgm.pause();
      return;
    }
    if (!this.bgmClip) return;
    if (this.unlocked) {
      void Promise.resolve(this.bgm.play()).catch(() => {});
    }
  }

  private tryPlayBgm(): void {
    if (!this.settings.bgmEnabled || !this.bgmClip) return;
    if (this.unlocked) {
      void Promise.resolve(this.bgm.play()).catch(() => {});
    }
  }

  private playOneShot(clip: AudioClip | null | undefined, volumeScale: number): void {
    /* 与网页版一致：任意音效播放都算作用户已激活音频（Button 点击常不冒泡到 Canvas 的 touch） */
    this.unlockFromUserGesture();
    if (!this.settings.sfxEnabled || !clip) return;
    this.sfx.playOneShot(clip, volumeScale);
  }

  /**
   * 注入当前皮肤的 4 个特征音（start / jump / attack / stun）；传 null 清空覆盖回退到 Inspector 通用 clip。
   * 调用方在皮肤切换时按需重复调用即可，不需要先 clear 再 set。
   */
  setSkinAudio(pack: Partial<CatSkinAudioPack> | null): void {
    this.skinClips = pack ?? {};
  }

  setKillClips(clips: (AudioClip | null)[]): void {
    this.killClips = clips;
  }

  /**
   * 攻击冲撞击杀：按本关累计攻击击杀数播放 1kill…8kill（超过 8 仍播 8kill）。
   * 非攻击击杀走 `playCatch`，不在此处理。
   */
  playAttackKill(cumulativeAttackKills: number): void {
    if (cumulativeAttackKills <= 0) return;
    const idx = Math.min(cumulativeAttackKills, 8) - 1;
    this.playOneShot(this.killClips[idx], 0.55);
  }

  /** 取该 action 当前应播放的 clip：先用皮肤覆盖层、再回退到 Inspector 配置。 */
  private resolveSkinClip(
    action: CatAudioAction,
    fallback: AudioClip | null,
  ): AudioClip | null {
    const override = this.skinClips[action];
    return override ?? fallback;
  }

  playLevelStart(): void {
    this.playOneShot(
      this.resolveSkinClip('start', this.clips.levelStart),
      0.5,
    );
  }

  playJump(): void {
    this.playOneShot(
      this.resolveSkinClip('jump', this.clips.sfxJump),
      0.55,
    );
  }

  playAttack(): void {
    this.playOneShot(
      this.resolveSkinClip('attack', this.clips.sfxAttack),
      0.55,
    );
  }

  playCatch(): void {
    this.playOneShot(this.clips.sfxCatch, 0.55);
  }

  playStun(): void {
    this.playOneShot(
      this.resolveSkinClip('stun', this.clips.sfxStun),
      0.6,
    );
    const wx = (globalThis as unknown as { wx?: { vibrateShort?: (o: object) => void } }).wx;
    try {
      wx?.vibrateShort?.({});
    } catch {
      /* ignore */
    }
  }

  playWin(): void {
    this.playOneShot(this.clips.sfxWin, 0.55);
  }

  playLose(): void {
    this.playOneShot(this.clips.sfxLose, 0.55);
  }

  playUi(): void {
    this.playOneShot(this.clips.sfxUi, 0.45);
  }

  playCountdownTick(): void {
    this.playOneShot(this.clips.sfxUi, 0.28);
  }
}
