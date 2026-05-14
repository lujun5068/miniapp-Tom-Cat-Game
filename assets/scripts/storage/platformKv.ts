import { sys } from 'cc';
import { WECHAT } from 'cc/env';

/**
 * 跨端键值存储：微信小游戏走 `wx.*StorageSync`，其余走 `sys.localStorage`。
 * 关卡存档与音频设置等统一经此读写，便于 3.3 发布对齐。
 */
interface WxStorage {
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, data: unknown): void;
  removeStorageSync(key: string): void;
}

function getWx(): WxStorage | null {
  if (!WECHAT || typeof globalThis === 'undefined') return null;
  const wx = (globalThis as { wx?: WxStorage }).wx;
  if (!wx || typeof wx.getStorageSync !== 'function') return null;
  return wx;
}

function decodeWxValue(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (raw === '') return null;
  if (typeof raw === 'string') return raw;
  try {
    return JSON.stringify(raw);
  } catch {
    return null;
  }
}

export function storageGetItem(key: string): string | null {
  const wx = getWx();
  if (wx) {
    try {
      return decodeWxValue(wx.getStorageSync(key));
    } catch {
      return null;
    }
  }
  return sys.localStorage.getItem(key);
}

export function storageSetItem(key: string, value: string): void {
  const wx = getWx();
  if (wx) {
    try {
      wx.setStorageSync(key, value);
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    sys.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function storageRemoveItem(key: string): void {
  const wx = getWx();
  if (wx) {
    try {
      wx.removeStorageSync(key);
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    sys.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
