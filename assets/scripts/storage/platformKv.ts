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

/**
 * `wx.getStorageSync` 写入字符串时返回字符串，读取到非预期类型时（例如旧数据被外部写成
 * 对象）就当作不存在处理，避免后续 `JSON.stringify` 把对象包成"看起来像 JSON 的字符串"
 * 再次被 `JSON.parse` 解出来，造成数据语义不一致。
 */
function decodeWxValue(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw === '') return null;
  return raw;
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
