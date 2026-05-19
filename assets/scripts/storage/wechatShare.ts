import { WECHAT } from 'cc/env';

type SharePayload = {
  title: string;
  imageUrl?: string;
  query?: string;
};

export type ShareChannel = 'message' | 'timeline';

export type SetupWechatShareOptions = SharePayload & {
  /**
   * 分享回调被微信触发时调用一次，用于发奖等业务副作用。
   * 注意 onShareAppMessage / onShareTimeline 都会触发，可能在同一次操作中调用多次；
   * 上层（如 ScoreManager.addShareReward）需要自行做幂等 / 频控。
   */
  onShareSuccess?: (channel: ShareChannel) => void;
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

export function setupWechatShare(opts: SetupWechatShareOptions): void {
  const wx = getWx();
  if (!wx) return;

  const { onShareSuccess, ...payload } = opts;

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
    wx.onShareAppMessage?.(() => {
      safeInvokeShareCallback(onShareSuccess, 'message');
      return payload;
    });
  } catch {
    /* ignore */
  }

  try {
    wx.onShareTimeline?.(() => {
      safeInvokeShareCallback(onShareSuccess, 'timeline');
      return payload;
    });
  } catch {
    /* ignore */
  }
}

function safeInvokeShareCallback(
  cb: ((channel: ShareChannel) => void) | undefined,
  channel: ShareChannel,
): void {
  if (!cb) return;
  try {
    cb(channel);
  } catch (error) {
    console.warn('[wechatShare] onShareSuccess callback threw', error);
  }
}
