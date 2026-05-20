import { AudioClip, resources } from 'cc';

/**
 * 皮肤特征音加载器。
 *
 * 资源约定（`assets/resources/cat-audios/`）：
 * ```
 * cat-audios/
 *   <category>/                # 与 skinConfig.CatSkin.category 一致（cat / fox / boar / ...）
 *     start.m4a                # 关卡开始 / 出场喊话，对应 onLevelStart
 *     jump.m4a                 # 跳跃成功，对应 onJumpSuccess
 *     attack.m4a               # 攻击成功，对应 onAttackSuccess
 *     stun.m4a                 # 眩晕，对应 onStun
 * ```
 * - 同一 category 的多个皮肤共用一组音（如 default / ninja / pirate 都用 `cat/`）。
 * - 某 category 缺文件时自动 fallback 到 `cat/` 同名音；都缺则返回 null，
 *   `CocosGameAudio` 再 fallback 到 Inspector 配置的通用 clip。
 *
 * 不在此处管理的音：
 * - 与皮肤无关的反馈音：`sfxCatch / sfxWin / sfxLose / sfxUi` 仍走 Inspector 通用 clip；
 * - 主循环 BGM：由 `audio-stream` 分包异步加载，见 `GameController.applyStreamingBgm`，
 *   `CocosGameAudio.setBgmClip` 注入，与皮肤无关。
 */
export const CAT_AUDIO_ACTIONS = [
  'start',
  'jump',
  'attack',
  'stun',
] as const;
export type CatAudioAction = (typeof CAT_AUDIO_ACTIONS)[number];

export type CatSkinAudioPack = Record<CatAudioAction, AudioClip | null>;

const AUDIO_ROOT = 'cat-audios';

function loadOneClip(
  category: string,
  action: CatAudioAction,
): Promise<AudioClip | null> {
  return new Promise((resolve) => {
    resources.load(
      `${AUDIO_ROOT}/${category}/${action}`,
      AudioClip,
      (err, clip) => {
        if (err) {
          console.warn(
            `[catAudioLoader] load failed: ${AUDIO_ROOT}/${category}/${action}`,
            err,
          );
          resolve(null);
          return;
        }
        resolve(clip ?? null);
      },
    );
  });
}

export async function loadCatSkinAudio(
  category: string,
  fallbackCategory = 'cat',
): Promise<CatSkinAudioPack> {
  const pack: CatSkinAudioPack = {
    start: null,
    jump: null,
    attack: null,
    stun: null,
  };
  for (const action of CAT_AUDIO_ACTIONS) {
    let clip = await loadOneClip(category, action);
    if (!clip && category !== fallbackCategory) {
      clip = await loadOneClip(fallbackCategory, action);
    }
    pack[action] = clip;
  }
  return pack;
}
