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

/** 与网页版 `gameAudio.ts` 资源一一对应；在 Inspector 中拖入 AudioClip（支持 ogg/mp3 等导入后生成的 Clip） */
export type GameAudioClipBundle = {
  bgmMain: AudioClip | null;
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
  /**
   * 当前皮肤特化音覆盖层：`start / jump / attack / stun` 优先于 `clips.levelStart / sfxJump / sfxAttack / sfxStun`。
   * 由 `GameController.applyCurrentCatSkin → catAudioLoader.loadCatSkinAudio` 异步注入；
   * 对应 action 缺失时（值为 null/undefined）回退到 Inspector 配置的通用 clip。
   */
  private skinClips: Partial<CatSkinAudioPack> = {};

  constructor(host: Node, clips: GameAudioClipBundle) {
    this.clips = clips;
    this.settings = loadAudioSettings();

    const bgmNode = new Node('BgmAudio');
    host.addChild(bgmNode);
    this.bgm = bgmNode.addComponent(AudioSource);
    if (clips.bgmMain) {
      this.bgm.clip = clips.bgmMain;
    }
    this.bgm.loop = true;
    this.bgm.playOnAwake = false;
    this.bgm.volume = 0.35;

    const sfxNode = new Node('SfxAudio');
    host.addChild(sfxNode);
    this.sfx = sfxNode.addComponent(AudioSource);
    this.sfx.playOnAwake = false;
    this.sfx.volume = 1;
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
    if (!this.clips.bgmMain) return;
    if (this.unlocked) {
      void Promise.resolve(this.bgm.play()).catch(() => {});
    }
  }

  private tryPlayBgm(): void {
    if (!this.settings.bgmEnabled || !this.clips.bgmMain) return;
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
