import { Button, Color } from 'cc';

/** 与 `Tom-cat-game/src/style.css` :root 及顶栏按钮色板对齐（线性渐变用近似纯色） */
export const UiTheme = {
  bgFallback: new Color(36, 50, 32, 255),
  bark: new Color(74, 64, 52, 255),
  barkDeep: new Color(46, 40, 32, 255),
  mossPanel: new Color(56, 78, 52, 235),
  mossBtn: new Color(62, 86, 58, 230),
  mossBtn2: new Color(72, 98, 66, 224),
  mossPress: new Color(48, 66, 46, 245),
  leafLine: new Color(118, 150, 102, 140),
  cream: new Color(244, 242, 232, 255),
  creamSoft: new Color(220, 232, 212, 255),
  muted: new Color(154, 170, 146, 255),
  honey: new Color(212, 168, 74, 255),
  shadow: new Color(12, 22, 10, 102),
  backdrop: new Color(0, 0, 0, 140),
  /** 全屏弹窗遮罩（偏深，提高与面板对比） */
  modalBackdrop: new Color(0, 0, 0, 220),
  /** 弹窗主面板底色（不透明深绿） */
  modalPanelBg: new Color(16, 26, 12, 255),
  /** 弹窗面板描边（浅色高对比） */
  modalPanelBorder: new Color(255, 238, 210, 255),
  /** 弹窗面板外框线宽（与结算 / 关卡列表等共用） */
  modalPanelBorderWidth: 3,
  /** 弹窗内主按钮底色 */
  modalActionBtnFill: new Color(44, 100, 38, 255),
  /** 弹窗内按钮描边 */
  modalBtnStroke: new Color(255, 252, 240, 220),
  /** 与弹窗主按钮一致的 UI 按钮描边线宽（侧栏、关卡格、圆形操作钮等） */
  modalBtnStrokeWidth: 3,
  panelTop: new Color(42, 56, 40, 255),
  panelBot: new Color(30, 42, 28, 255),
  locked: new Color(32, 40, 30, 210),
} as const;

/** 弹窗圆角半径（结算 / 关卡列表等统一） */
export const MODAL_PANEL_CORNER_RADIUS = 16;

/** 与结算弹窗主面板同宽，关卡列表弹窗外框与之对齐 */
export const MODAL_PANEL_WIDTH = 420;

/** 结算弹窗面板高度 */
export const MODAL_END_PANEL_HEIGHT = 280;

/** 全部关卡弹窗面板高度（与结算同宽、同色与描边体系） */
export const MODAL_LEVELS_PANEL_HEIGHT = 420;

/** 顶栏 / 普通圆角按钮（对应 `#top-bar button`） */
export function styleBarButton(btn: Button): void {
  btn.normalColor = UiTheme.mossPanel;
  btn.hoverColor = UiTheme.mossBtn2;
  btn.pressedColor = UiTheme.mossPress;
  btn.disabledColor = new Color(90, 90, 90, 160);
}

/** 圆形大按钮（跳跃 / 攻击，对应 `#touch-actions button`） */
export function styleRoundActionButton(btn: Button): void {
  btn.normalColor = UiTheme.mossBtn2;
  btn.hoverColor = UiTheme.mossBtn;
  btn.pressedColor = UiTheme.mossPress;
  btn.disabledColor = new Color(80, 80, 90, 160);
}
