/**
 * 猫皮肤帧加载器。
 *
 * 资源拆分（首包瘦身策略，见 docs/SCORE_AND_SKIN.md §10）：
 * - `default` 皮肤的帧在 `assets/resources/cat-skins/default/`，随首包加载（兜底保证主游戏永远可用）。
 * - 其余皮肤（`ninja / pirate / golden / fox / boar` 及后续新增）在 `assets/skin-pack/cat-skins/<id>/`，
 *   `skin-pack` Bundle 在微信小游戏构建里配置为 subpackage，运行时通过
 *   `assetManager.loadBundle('skin-pack')` 异步拉取并按需 `bundle.loadDir(...)`。
 *
 * 子目录结构（4 个动作）：
 * ```
 * <skinId>/
 *   start/    待机 / 起始
 *   walk1/    水平移动
 *   walk2/    纵向移动
 *   xuanyun/  眩晕
 * ```
 *
 * 任何动作缺帧时自动 fallback 到 `fallbackSkinId`（默认 `default`），保证新增皮肤不必填齐
 * 4 套也能跑；如果连 default 都缺则返回空数组，由 BoardView 用单帧 `sfCat` 兜底。
 *
 * 整套 `skin-pack` Bundle 加载失败时（极少数情况，如分包还在下载 / 网络异常），所有
 * 非 default 皮肤都会 fallback 到 default，玩家短暂看不到自定义皮肤但游戏不会卡。
 */
import { assetManager, resources, SpriteFrame, type AssetManager } from 'cc';

export type CatSkinFrames = {
  start: SpriteFrame[];
  walkH: SpriteFrame[];
  walkV: SpriteFrame[];
  stun: SpriteFrame[];
};

type ActionMapping = {
  key: keyof CatSkinFrames;
  dir: 'start' | 'walk1' | 'walk2' | 'xuanyun';
};

const ACTIONS: ReadonlyArray<ActionMapping> = [
  { key: 'start', dir: 'start' },
  { key: 'walkH', dir: 'walk1' },
  { key: 'walkV', dir: 'walk2' },
  { key: 'stun', dir: 'xuanyun' },
];

const SKIN_ROOT = 'cat-skins';
const SKIN_PACK_BUNDLE = 'skin-pack';
const DEFAULT_SKIN_ID = 'default';

/**
 * Bundle 句柄缓存：同一会话内 `assetManager.loadBundle` 只会去拉一次。
 * 加载失败时缓存 `null`，避免被反复重试；下次进入主场景或重启游戏会重新尝试。
 */
let skinPackBundlePromise: Promise<AssetManager.Bundle | null> | null = null;

function loadSkinPackBundle(): Promise<AssetManager.Bundle | null> {
  if (skinPackBundlePromise) return skinPackBundlePromise;
  skinPackBundlePromise = new Promise((resolve) => {
    assetManager.loadBundle(SKIN_PACK_BUNDLE, (err, bundle) => {
      if (err || !bundle) {
        console.warn(`[catSkinLoader] loadBundle '${SKIN_PACK_BUNDLE}' failed`, err);
        resolve(null);
        return;
      }
      resolve(bundle);
    });
  });
  return skinPackBundlePromise;
}

function loadDirFromBundle(
  bundle: AssetManager.Bundle | typeof resources,
  path: string,
): Promise<SpriteFrame[]> {
  return new Promise((resolve) => {
    bundle.loadDir(path, SpriteFrame, (err, frames) => {
      if (err) {
        console.warn(`[catSkinLoader] loadDir failed: ${path}`, err);
        resolve([]);
        return;
      }
      resolve(Array.isArray(frames) ? frames.filter(Boolean) : []);
    });
  });
}

async function loadActionFrames(
  skinId: string,
  dir: ActionMapping['dir'],
): Promise<SpriteFrame[]> {
  const path = `${SKIN_ROOT}/${skinId}/${dir}`;
  if (skinId === DEFAULT_SKIN_ID) {
    return loadDirFromBundle(resources, path);
  }
  const bundle = await loadSkinPackBundle();
  if (!bundle) return [];
  return loadDirFromBundle(bundle, path);
}

export async function loadCatSkinFrames(
  skinId: string,
  fallbackSkinId = DEFAULT_SKIN_ID,
): Promise<CatSkinFrames> {
  const result: CatSkinFrames = {
    start: [],
    walkH: [],
    walkV: [],
    stun: [],
  };
  for (const { key, dir } of ACTIONS) {
    let frames = await loadActionFrames(skinId, dir);
    if (frames.length === 0 && skinId !== fallbackSkinId) {
      frames = await loadActionFrames(fallbackSkinId, dir);
    }
    result[key] = frames;
  }
  return result;
}

/**
 * 仅加载某皮肤 `start/` 目录下第一帧，用作个人中心皮肤卡片预览。
 * 加载失败 / 目录为空时尝试 fallback（默认皮肤）；都没有则返回 null，调用方再决定占位策略。
 *
 * 注意：个人中心通常会一次性预览全部皮肤（5+ 个非默认皮肤），加载第一个时会触发
 * `skin-pack` Bundle 整体下载（微信平台首次访问），后续皮肤的 `loadDir` 直接命中缓存
 * 不再产生网络请求。
 */
export async function loadCatSkinStartFrame(
  skinId: string,
  fallbackSkinId = DEFAULT_SKIN_ID,
): Promise<SpriteFrame | null> {
  let frames = await loadActionFrames(skinId, 'start');
  if (frames.length === 0 && skinId !== fallbackSkinId) {
    frames = await loadActionFrames(fallbackSkinId, 'start');
  }
  return frames[0] ?? null;
}
