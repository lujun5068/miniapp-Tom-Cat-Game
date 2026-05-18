import { WECHAT } from 'cc/env';

interface WxVibration {
  vibrateShort?(opts?: { type?: 'heavy' | 'medium' | 'light' }): void;
  vibrateLong?(): void;
}

function getWx(): WxVibration | null {
  if (!WECHAT || typeof globalThis === 'undefined') return null;
  const wx = (globalThis as { wx?: WxVibration }).wx;
  if (!wx) return null;
  return wx;
}

export function vibrateShort(): void {
  const wx = getWx();
  if (!wx || typeof wx.vibrateShort !== 'function') return;
  try {
    wx.vibrateShort({ type: 'medium' });
  } catch {
    /* ignore */
  }
}

export function vibrateLong(): void {
  const wx = getWx();
  if (!wx || typeof wx.vibrateLong !== 'function') return;
  try {
    wx.vibrateLong();
  } catch {
    /* ignore */
  }
}
