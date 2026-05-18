import { WECHAT } from 'cc/env';

type SharePayload = {
  title: string;
  imageUrl?: string;
  query?: string;
};

type WxShareApi = {
  showShareMenu?(opts?: {
    withShareTicket?: boolean;
    menus?: string[];
  }): void;
  updateShareMenu?(opts?: {
    withShareTicket?: boolean;
    isUpdatableMessage?: boolean;
  }): void;
  onShareAppMessage?(cb: () => SharePayload): void;
  onShareTimeline?(cb: () => SharePayload): void;
};

function getWx(): WxShareApi | null {
  if (!WECHAT || typeof globalThis === 'undefined') return null;
  const wx = (globalThis as { wx?: WxShareApi }).wx;
  if (!wx) return null;
  return wx;
}

export function setupWechatShare(payload: SharePayload): void {
  const wx = getWx();
  if (!wx) return;

  try {
    wx.showShareMenu?.({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline'],
    });
  } catch {
    /* ignore */
  }

  try {
    wx.updateShareMenu?.({
      withShareTicket: true,
      isUpdatableMessage: false,
    });
  } catch {
    /* ignore */
  }

  try {
    wx.onShareAppMessage?.(() => payload);
  } catch {
    /* ignore */
  }

  try {
    wx.onShareTimeline?.(() => payload);
  } catch {
    /* ignore */
  }
}
