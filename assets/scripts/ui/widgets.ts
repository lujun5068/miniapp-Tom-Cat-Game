import { Button, Color, Graphics, Label, Node, UITransform } from 'cc';
import { UiTheme } from './UiTheme';

/**
 * 共享的 UI 原子构建工具：圆角按钮、面板背景、模态遮罩等。
 * 既被主游戏 GameController 使用，也被个人中心 PersonalCenterPage 使用，
 * 避免两侧各自维护一套相似但参数略有差异的实现。
 */

export type LabelButtonOpts = {
  /** 圆角半径；缺省按高度自适应 */
  cornerRadius?: number;
  /** 不透明填充色；缺省为顶栏按钮绿底 */
  fill?: Color;
  /** 文字字号；缺省 18 */
  fontSize?: number;
  /** 文字颜色；缺省 UiTheme.cream */
  textColor?: Color;
  /** 描边色；缺省为弹窗主按钮描边色 */
  strokeColor?: Color;
  /** 描边宽度；缺省与弹窗主按钮一致 */
  strokeWidth?: number;
};

/** 复制颜色并替换 alpha，方便复用 UiTheme 中的色板 */
export function solidColor(color: Color, alpha = 255): Color {
  return new Color(color.r, color.g, color.b, alpha);
}

/** 圆角按钮默认半径（按短边比例） */
export function defaultBtnCornerRadius(w: number, h: number): number {
  return Math.min(12, Math.max(6, Math.floor(Math.min(w, h) * 0.22)));
}

/** 绘制圆角矩形（带可选描边） */
export function paintRoundRect(
  g: Graphics,
  w: number,
  h: number,
  fill: Color,
  cornerRadius: number,
  stroke?: { color: Color; width: number },
): void {
  g.clear();
  g.fillColor = fill;
  g.roundRect(-w * 0.5, -h * 0.5, w, h, cornerRadius);
  g.fill();
  if (stroke) {
    g.lineWidth = stroke.width;
    g.strokeColor = stroke.color;
    g.roundRect(-w * 0.5, -h * 0.5, w, h, cornerRadius);
    g.stroke();
  }
}

/** 圆角按钮底色 + 描边（保持与原 GameController 行为一致） */
export function paintLabelButtonBg(
  g: Graphics,
  w: number,
  h: number,
  cornerRadius: number,
  fill: Color,
  strokeColor?: Color,
  strokeWidth?: number,
): void {
  paintRoundRect(g, w, h, fill, cornerRadius, {
    color: strokeColor ?? UiTheme.modalBtnStroke,
    width: strokeWidth ?? UiTheme.modalBtnStrokeWidth,
  });
}

/** 全屏弹窗遮罩 */
export function paintModalBackdrop(g: Graphics, w: number, h: number): void {
  g.clear();
  g.fillColor = UiTheme.modalBackdrop;
  g.rect(-w * 0.5, -h * 0.5, w, h);
  g.fill();
}

/** 弹窗主面板底色（不带描边） */
export function paintModalPanelBg(
  g: Graphics,
  w: number,
  h: number,
  cornerRadius: number,
): void {
  g.clear();
  g.fillColor = UiTheme.modalPanelBg;
  g.roundRect(-w * 0.5, -h * 0.5, w, h, cornerRadius);
  g.fill();
}

/** 弹窗主面板描边 */
export function paintModalPanelBorder(
  g: Graphics,
  w: number,
  h: number,
  cornerRadius: number,
): void {
  g.clear();
  g.lineWidth = UiTheme.modalPanelBorderWidth;
  g.strokeColor = UiTheme.modalPanelBorder;
  g.roundRect(-w * 0.5, -h * 0.5, w, h, cornerRadius);
  g.stroke();
}

/** 创建带 UITransform 的 UI 子节点，自动继承父节点 layer */
export function addUiNode(
  parent: Node,
  name: string,
  w: number,
  h: number,
): Node {
  const n = new Node(name);
  n.layer = parent.layer;
  n.addComponent(UITransform).setContentSize(w, h);
  parent.addChild(n);
  return n;
}

/** 创建居中文本子节点 */
export function addUiLabel(
  parent: Node,
  name: string,
  text: string,
  fontSize: number,
  color: Color,
  w: number,
  h: number,
): Label {
  const n = addUiNode(parent, name, w, h);
  const label = n.addComponent(Label);
  label.string = text;
  label.fontSize = fontSize;
  label.lineHeight = Math.max(fontSize + 4, 20);
  label.color = color;
  label.horizontalAlign = Label.HorizontalAlign.CENTER;
  label.verticalAlign = Label.VerticalAlign.CENTER;
  label.overflow = Label.Overflow.CLAMP;
  return label;
}

/** 文本按钮：带圆角底、描边、文字、Button 组件（带缩放反馈） */
export function makeLabelButton(
  text: string,
  w: number,
  h: number,
  opts?: LabelButtonOpts,
): Node {
  const corner = opts?.cornerRadius ?? defaultBtnCornerRadius(w, h);
  const fill = opts?.fill ?? solidColor(UiTheme.mossPanel);

  const n = new Node(text);
  n.addComponent(UITransform).setContentSize(w, h);

  const bg = new Node('BtnBg');
  bg.layer = n.layer;
  bg.addComponent(UITransform).setContentSize(w, h);
  const gr = bg.addComponent(Graphics);
  paintLabelButtonBg(
    gr,
    w,
    h,
    corner,
    fill,
    opts?.strokeColor,
    opts?.strokeWidth,
  );
  n.addChild(bg);

  const labNd = new Node('Lbl');
  labNd.layer = n.layer;
  labNd.addComponent(UITransform).setContentSize(w, h);
  const label = labNd.addComponent(Label);
  label.string = text;
  label.fontSize = opts?.fontSize ?? 18;
  label.lineHeight = Math.max(label.fontSize + 4, 20);
  label.color = opts?.textColor ?? UiTheme.cream;
  label.horizontalAlign = Label.HorizontalAlign.CENTER;
  label.verticalAlign = Label.VerticalAlign.CENTER;
  label.overflow = Label.Overflow.CLAMP;
  n.addChild(labNd);

  const btn = n.addComponent(Button);
  btn.target = n;
  btn.transition = Button.Transition.SCALE;
  btn.zoomScale = 0.94;
  btn.duration = 0.08;
  return n;
}
