/**
 * 猫皮肤帧加载器。
 *
 * 资源拆分（首包瘦身策略，见 docs/SCORE_AND_SKIN.md §10）：
 * - `default` 皮肤的帧在 `assets/resources/cat-skins/default/`，随首包加载（兜底保证主游戏永远可用）。
 * - 其余皮肤（`ninja / pirate / fox / boar` 及后续新增）在 `assets/skin-pack/cat-skins/<id>/`，
 *   `skin-pack` Bundle 在微信小游戏构建里配置为 subpackage，运行时通过
 *   `assetManager.loadBundle('skin-pack')` 异步拉取并按需 `bundle.loadDir(...)`。
 *
 * 子目录结构（5 个动作）：
 * ```
 * <skinId>/
 *   start/    待机 / 起始
 *   walk1/    水平移动
 *   walk2/    纵向移动
 *   xuanyun/  眩晕
 *   attack/   攻击（可选，缺失时回退到本皮肤的 walk1）
 * ```
 *
 * **fallback 规则**：
 * - 常规 4 个动作（start / walk1 / walk2 / xuanyun）缺帧时自动 fallback 到
 *   `fallbackSkinId`（默认 `default`）同名目录，保证新增皮肤不必填齐 4 套也能跑；
 *   连 default 都缺则返回空数组，由 BoardView 用单帧 `sfCat` 兜底。
 * - **attack 特殊**：当前皮肤若没有 attack 目录，**直接复用本皮肤的 walk1**
 *   （而不是 default 皮肤的 attack）。原因是 attack 视觉特征与皮肤品种强绑定，
 *   跨皮肤借 attack 会造成"突然换猫"的违和感，复用本皮肤的水平走帧反而更自然。
 *   仅当本皮肤连 walk1 都没有时，才走通用 fallback 路径（最终可能落到 default）。
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
  /**
   * 攻击帧组。当前皮肤若没有 `attack/` 目录则与 `walkH` 共用同一份数组引用
   * （见上方 fallback 规则）；调用方无需做额外判空，按帧组播放即可。
   */
  attack: SpriteFrame[];
};

type ActionDir = 'start' | 'walk1' | 'walk2' | 'xuanyun' | 'attack';
type ActionMapping = {
  key: keyof CatSkinFrames;
  dir: ActionDir;
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
  dir: ActionDir,
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
    attack: [],
  };
  for (const { key, dir } of ACTIONS) {
    let frames = await loadActionFrames(skinId, dir);
    if (frames.length === 0 && skinId !== fallbackSkinId) {
      frames = await loadActionFrames(fallbackSkinId, dir);
    }
    result[key] = frames;
  }
  // attack 单独处理：优先用本皮肤的 attack/；缺则复用本皮肤 walkH（不跨皮肤借用），
  // walkH 也空时才走通用 fallback（拉 fallbackSkinId 的 attack 兜底）；都空就是 []。
  let attack = await loadActionFrames(skinId, 'attack');
  if (attack.length === 0) {
    attack = result.walkH;
  }
  if (attack.length === 0 && skinId !== fallbackSkinId) {
    attack = await loadActionFrames(fallbackSkinId, 'attack');
  }
  result.attack = attack;
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
