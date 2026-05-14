/**
 * 地图格贴图显示缩放：以单格边长 `tileSize` 为基准，乘数 1 表示贴图宽高与格子一致；
 * 大于 1 为放大（以格中心为锚），小于 1 为缩小。
 */
export type MapTileDisplayScales = {
  floor: number;
  edge: number;
  stone: number;
};

export const DEFAULT_MAP_TILE_DISPLAY_SCALES: MapTileDisplayScales = {
  floor: 1,
  edge: 1,
  stone: 1,
};

const SCALE_MIN = 0.05;
const SCALE_MAX = 8;

export function clampMapTileScale(v: number): number {
  if (!Number.isFinite(v)) return 1;
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, v));
}

/** 合并局部配置；未传的键沿用 `base` */
export function mergeMapTileDisplayScales(
  base: MapTileDisplayScales,
  partial?: Partial<MapTileDisplayScales>,
): MapTileDisplayScales {
  return {
    floor: clampMapTileScale(partial?.floor ?? base.floor),
    edge: clampMapTileScale(partial?.edge ?? base.edge),
    stone: clampMapTileScale(partial?.stone ?? base.stone),
  };
}
