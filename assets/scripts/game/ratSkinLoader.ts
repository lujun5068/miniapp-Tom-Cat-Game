import { resources, SpriteFrame } from 'cc';

/**
 * 老鼠皮肤资源加载器。
 *
 * 资源约定（`assets/resources/rat_skins/`）：
 * ```
 * rat_skins/
 *   <skinId>/                # black / brown / dark_brown / white
 *     up/    1.png 2.png 3.png
 *     down/  1.png 2.png 3.png
 *     left/  1.png 2.png 3.png
 *     right/ 1.png 2.png 3.png
 * ```
 * - 帧贴图本身已包含方向，无需在运行时翻转 / 旋转。
 * - 文件名按内部数字段排序（兼容 `1.png` / `frame-01.png` 等格式）。
 * - 加载失败 / 缺失方向时该方向数组为空，渲染层会选择回退（其它方向 → 单帧 → 色块）。
 *
 * 老鼠皮肤是**纯视觉随机**，不与积分 / 玩家拥有皮肤挂钩；详见
 * [`CHANGELOG.md`](../../../docs/CHANGELOG.md) 2026-05-19 "老鼠皮肤随机化"。
 */
export const RAT_SKIN_IDS = ['black', 'brown', 'dark_brown', 'white'] as const;
export type RatSkinId = (typeof RAT_SKIN_IDS)[number];

export type RatDirection = 'up' | 'down' | 'left' | 'right';
export const RAT_DIRECTIONS: ReadonlyArray<RatDirection> = [
  'up',
  'down',
  'left',
  'right',
];

export type RatDirectionFrames = Record<RatDirection, SpriteFrame[]>;
export type RatSkinPack = Record<RatSkinId, RatDirectionFrames>;

const RAT_ROOT = 'rat_skins';

function sortRatFrames(frames: SpriteFrame[]): SpriteFrame[] {
  const idx = (sf: SpriteFrame): number => {
    const name = sf.name ?? '';
    const m = /(\d+)/.exec(name);
    return m ? parseInt(m[1], 10) : 0;
  };
  return [...frames]
    .filter((f) => !!f)
    .sort((a, b) => {
      const d = idx(a) - idx(b);
      return d !== 0 ? d : (a.uuid ?? '').localeCompare(b.uuid ?? '');
    });
}

function loadRatActionFrames(
  skinId: RatSkinId,
  dir: RatDirection,
): Promise<SpriteFrame[]> {
  return new Promise((resolve) => {
    resources.loadDir(
      `${RAT_ROOT}/${skinId}/${dir}`,
      SpriteFrame,
      (err, frames) => {
        if (err) {
          console.warn(
            `[ratSkinLoader] loadDir failed: ${RAT_ROOT}/${skinId}/${dir}`,
            err,
          );
          resolve([]);
          return;
        }
        resolve(sortRatFrames(Array.isArray(frames) ? frames : []));
      },
    );
  });
}

export async function loadAllRatSkinFrames(): Promise<RatSkinPack> {
  const pack = {} as RatSkinPack;
  for (const skin of RAT_SKIN_IDS) {
    const dirs = {} as RatDirectionFrames;
    for (const dir of RAT_DIRECTIONS) {
      dirs[dir] = await loadRatActionFrames(skin, dir);
    }
    pack[skin] = dirs;
  }
  return pack;
}
