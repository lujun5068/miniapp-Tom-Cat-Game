import { AudioClip, assetManager, resources, type AssetManager } from 'cc';

/**
 * 皮肤特征音加载器。
 *
 * 资源拆分（首包瘦身策略，见 docs/SCORE_AND_SKIN.md §10）：
 * - `cat/` category 的 4 个动作音在 `assets/resources/cat-audios/cat/`，随首包加载
 *   （default/ninja/pirate/golden 都用 `cat`，作为兜底永远可用）。
 * - 其余 category（当前 `fox / boar`，未来新增非 `cat` 类）在
 *   `assets/skin-pack/cat-audios/<category>/`，与非默认猫皮肤帧共用 `skin-pack` Bundle
 *   （微信小游戏 subpackage），运行时 `assetManager.loadBundle('skin-pack')` 异步加载。
 *
 * 资源约定（每个 category 4 个文件）：
 * ```
 * <category>/
 *   start.m4a    关卡开始 / 出场喊话，对应 onLevelStart
 *   jump.m4a     跳跃成功，对应 onJumpSuccess
 *   attack.m4a   攻击成功，对应 onAttackSuccess
 *   stun.m4a     眩晕，对应 onStun
 * ```
 *
 * 缺失回退顺序：
 * 1. 指定 category 缺单个文件 → 同 category 下一行；
 * 2. 4 个全缺 → fallback 到 `cat/`（同名音）；
 * 3. `cat/` 也缺 → 返回 null，`CocosGameAudio.resolveSkinClip` 再回退到 Inspector 通用 clip；
 * 4. `skin-pack` Bundle 整体加载失败 → 等价于 fox/boar 4 个全缺，直接走第 2 步走 `cat/`。
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
const SKIN_PACK_BUNDLE = 'skin-pack';
const FALLBACK_CATEGORY = 'cat';

/**
 * 与 `catSkinLoader.loadSkinPackBundle` 共享同一份分包内容，但句柄缓存独立维护
 * （两个 loader 模块解耦；Cocos `assetManager.loadBundle` 内部对同名 bundle 有去重，
 * 重复 loadBundle 会命中同一实例，不会真的下载两次）。
 */
let skinPackBundlePromise: Promise<AssetManager.Bundle | null> | null = null;

function loadSkinPackBundle(): Promise<AssetManager.Bundle | null> {
  if (skinPackBundlePromise) return skinPackBundlePromise;
  skinPackBundlePromise = new Promise((resolve) => {
    assetManager.loadBundle(SKIN_PACK_BUNDLE, (err, bundle) => {
      if (err || !bundle) {
        console.warn(`[catAudioLoader] loadBundle '${SKIN_PACK_BUNDLE}' failed`, err);
        resolve(null);
        return;
      }
      resolve(bundle);
    });
  });
  return skinPackBundlePromise;
}

function loadOneClipFromBundle(
  bundle: AssetManager.Bundle | typeof resources,
  category: string,
  action: CatAudioAction,
): Promise<AudioClip | null> {
  const path = `${AUDIO_ROOT}/${category}/${action}`;
  return new Promise((resolve) => {
    bundle.load(path, AudioClip, (err, clip) => {
      if (err) {
        console.warn(`[catAudioLoader] load failed: ${path}`, err);
        resolve(null);
        return;
      }
      resolve(clip ?? null);
    });
  });
}

async function loadOneClip(
  category: string,
  action: CatAudioAction,
): Promise<AudioClip | null> {
  if (category === FALLBACK_CATEGORY) {
    return loadOneClipFromBundle(resources, category, action);
  }
  const bundle = await loadSkinPackBundle();
  if (!bundle) return null;
  return loadOneClipFromBundle(bundle, category, action);
}

export async function loadCatSkinAudio(
  category: string,
  fallbackCategory = FALLBACK_CATEGORY,
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
