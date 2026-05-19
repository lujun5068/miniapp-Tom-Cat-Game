/**
 * 猫皮肤帧加载器：从 `assets/resources/cat-skins/<skinId>/<action>` 下批量加载序列帧。
 *
 * - 资源位于 Cocos `resources` 内置 Bundle 下，路径无须 `.png` 后缀；
 * - 每个皮肤包含 4 个动作子目录：`start`（待机 / 起始）、`walk1`（水平移动）、
 *   `walk2`（纵向移动）、`xuanyun`（眩晕）；
 * - 任何动作缺失帧时会自动 fallback 到 `fallbackSkinId`（默认 `default`），
 *   保证新增皮肤不必填齐 4 套也能运行；
 * - 返回 `start / walkH / walkV / stun` 字段对齐 `BoardView.configureCatFrameAnimations`。
 */
import { resources, SpriteFrame } from 'cc';

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

function loadActionFrames(
  skinId: string,
  dir: ActionMapping['dir'],
): Promise<SpriteFrame[]> {
  return new Promise((resolve) => {
    resources.loadDir(
      `${SKIN_ROOT}/${skinId}/${dir}`,
      SpriteFrame,
      (err, frames) => {
        if (err) {
          console.warn(
            `[catSkinLoader] loadDir failed: ${SKIN_ROOT}/${skinId}/${dir}`,
            err,
          );
          resolve([]);
          return;
        }
        resolve(Array.isArray(frames) ? frames.filter(Boolean) : []);
      },
    );
  });
}

export async function loadCatSkinFrames(
  skinId: string,
  fallbackSkinId = 'default',
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
 */
export async function loadCatSkinStartFrame(
  skinId: string,
  fallbackSkinId = 'default',
): Promise<SpriteFrame | null> {
  let frames = await loadActionFrames(skinId, 'start');
  if (frames.length === 0 && skinId !== fallbackSkinId) {
    frames = await loadActionFrames(fallbackSkinId, 'start');
  }
  return frames[0] ?? null;
}
