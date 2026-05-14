import { sys, view } from 'cc';

/** 设计分辨率下的安全区内边距（pt），取不到或异常时全 0 */
export function getSafeAreaInsets(): {
  top: number;
  right: number;
  bottom: number;
  left: number;
} {
  const z = { top: 0, right: 0, bottom: 0, left: 0 };
  try {
    const fn = (
      sys as unknown as {
        getSafeAreaRect?: () => {
          x: number;
          y: number;
          width: number;
          height: number;
        };
      }
    ).getSafeAreaRect;
    if (typeof fn !== 'function') return z;
    const safe = fn.call(sys);
    const vis = view.getVisibleSize();
    if (!safe || !vis || vis.width < 1 || vis.height < 1) return z;
    const left = Math.max(0, safe.x);
    const bottom = Math.max(0, safe.y);
    const right = Math.max(0, vis.width - safe.x - safe.width);
    const top = Math.max(0, vis.height - safe.y - safe.height);
    return { left, right, top, bottom };
  } catch {
    return z;
  }
}
