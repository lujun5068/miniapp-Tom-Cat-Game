import type { SpriteFrame } from 'cc';

/** 与网页 `mapTileTextures.ts` 一致；在 Inspector 中绑定后可替换棋盘色块（可只填 floor，其余仍用色块） */
export type MapTileSpriteFrames = {
  floor: SpriteFrame;
  edge: SpriteFrame;
  stone1: SpriteFrame;
  stone2: SpriteFrame;
};

/** 四张齐全时走纯精灵路径（无外圈/内圈色块叠层） */
export function hasCompleteMapFrames(
  f: Partial<MapTileSpriteFrames> | null,
): f is MapTileSpriteFrames {
  return !!(f && f.floor && f.edge && f.stone1 && f.stone2);
}

/** 至少绑定了地板贴图即可启用「精灵地板 + 缺省处色块」混合渲染 */
export function hasFloorSprite(
  f: Partial<MapTileSpriteFrames> | null | undefined,
): boolean {
  return !!f?.floor;
}
