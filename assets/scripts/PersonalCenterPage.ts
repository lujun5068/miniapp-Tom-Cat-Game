import {
  _decorator,
  BlockInputEvents,
  Button,
  Color,
  Component,
  director,
  Graphics,
  Label,
  Layout,
  Mask,
  Node,
  ScrollView,
  UITransform,
  view,
  Widget,
} from 'cc';
import { ScoreManager } from './game/ScoreManager';
import { catSkins, type CatSkin } from './game/skinConfig';
import { UiTheme } from './ui/UiTheme';

const { ccclass } = _decorator;

const GAME_SCENE = 'scene-001';
const PAGE_MAX_WIDTH = 1080;
const PAGE_H_PAD = 36;
const HEADER_TOP = 22;
const SCORE_CARD_TOP = 82;
const BODY_TOP = 210;
const BODY_HEIGHT = 390;
const SKIN_LIST_WIDTH = 640;
const HISTORY_WIDTH = 340;

type LabelButtonOpts = {
  fill?: Color;
  fontSize?: number;
  cornerRadius?: number;
  width?: number;
  height?: number;
};

function solidColor(color: Color, alpha = 255): Color {
  return new Color(color.r, color.g, color.b, alpha);
}

function defaultBtnCornerRadius(w: number, h: number): number {
  return Math.min(14, Math.max(7, Math.floor(Math.min(w, h) * 0.25)));
}

function paintRoundRect(
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

function addNode(parent: Node, name: string, w: number, h: number): Node {
  const n = new Node(name);
  n.layer = parent.layer;
  n.addComponent(UITransform).setContentSize(w, h);
  parent.addChild(n);
  return n;
}

function addLabel(
  parent: Node,
  name: string,
  text: string,
  fontSize: number,
  color: Color,
  w: number,
  h: number,
): Label {
  const n = addNode(parent, name, w, h);
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

function makeLabelButton(text: string, opts?: LabelButtonOpts): Node {
  const w = opts?.width ?? 112;
  const h = opts?.height ?? 44;
  const n = new Node(text);
  n.addComponent(UITransform).setContentSize(w, h);

  const bg = addNode(n, 'BtnBg', w, h);
  paintRoundRect(
    bg.addComponent(Graphics),
    w,
    h,
    opts?.fill ?? solidColor(UiTheme.modalActionBtnFill),
    opts?.cornerRadius ?? defaultBtnCornerRadius(w, h),
    { color: UiTheme.modalBtnStroke, width: UiTheme.modalBtnStrokeWidth },
  );

  const label = addLabel(
    n,
    'Lbl',
    text,
    opts?.fontSize ?? 18,
    UiTheme.cream,
    w,
    h,
  );
  label.overflow = Label.Overflow.CLAMP;

  const btn = n.addComponent(Button);
  btn.target = n;
  btn.transition = Button.Transition.SCALE;
  btn.zoomScale = 0.94;
  btn.duration = 0.08;
  return n;
}

@ccclass('PersonalCenterPage')
export class PersonalCenterPage extends Component {
  private readonly scoreManager = ScoreManager.getInstance();
  private bgNode: Node | null = null;
  private contentRoot: Node | null = null;

  onLoad(): void {
    console.log('[PersonalCenterPage] onLoad');
    this.node.addComponent(BlockInputEvents);
    this.buildPage();
    view.on('canvas-resize', this.rebuildPage, this);
  }

  onDestroy(): void {
    view.off('canvas-resize', this.rebuildPage, this);
  }

  private rebuildPage(): void {
    this.buildPage();
  }

  private buildPage(): void {
    this.clearPageChildren();
    const vs = view.getVisibleSize();
    this.node.getComponent(UITransform)?.setContentSize(vs);

    this.bgNode = addNode(this.node, 'PageBg', vs.width, vs.height);
    this.pinFullScreen(this.bgNode);
    this.paintBackground();

    const contentW = Math.min(PAGE_MAX_WIDTH, Math.max(760, vs.width - PAGE_H_PAD * 2));
    const content = addNode(this.node, 'Content', contentW, vs.height);
    this.contentRoot = content;
    const contentWidget = content.addComponent(Widget);
    contentWidget.isAlignTop = true;
    contentWidget.isAlignBottom = true;
    contentWidget.isAlignHorizontalCenter = true;
    contentWidget.top = contentWidget.bottom = 0;

    this.buildHeader(content, contentW);
    this.buildScoreCard(content, contentW);
    this.buildMainPanels(content, contentW);
    this.syncUiLayer(content);
  }

  private clearPageChildren(): void {
    for (let i = this.node.children.length - 1; i >= 0; i--) {
      const child = this.node.children[i];
      if (child.name === 'PageBg' || child.name === 'Content') {
        child.destroy();
      }
    }
    this.bgNode = null;
    this.contentRoot = null;
  }

  private buildHeader(parent: Node, contentW: number): void {
    const back = makeLabelButton('返回', {
      width: 112,
      height: 44,
      fontSize: 18,
      fill: solidColor(UiTheme.modalActionBtnFill),
    });
    const backW = back.addComponent(Widget);
    backW.isAlignTop = true;
    backW.isAlignLeft = true;
    backW.top = HEADER_TOP;
    backW.left = 0;
    parent.addChild(this.wrapBtn(back, () => director.loadScene(GAME_SCENE)));

    const title = this.addAnchoredLabel(
      parent,
      'Title',
      '个人中心',
      32,
      UiTheme.cream,
      contentW,
      56,
      HEADER_TOP - 2,
    );
    title.lineHeight = 38;
  }

  private buildScoreCard(parent: Node, contentW: number): void {
    const availableScore = this.scoreManager.getTotalScore();
    const totalEarned = this.scoreManager.getTotalEarnedScore();
    const unlockedCount = this.scoreManager.getUnlockedSkins().length;

    const card = this.addPanel(parent, 'ScoreCard', contentW, 104, SCORE_CARD_TOP, 18);
    const title = addLabel(card, 'ScoreTitle', '当前积分', 20, UiTheme.creamSoft, 180, 28);
    title.horizontalAlign = Label.HorizontalAlign.LEFT;
    title.node.setPosition(-contentW * 0.5 + 32 + 90, 22, 0);

    const score = addLabel(card, 'ScoreValue', String(availableScore), 42, UiTheme.honey, 180, 48);
    score.horizontalAlign = Label.HorizontalAlign.LEFT;
    score.node.setPosition(-contentW * 0.5 + 32 + 90, -16, 0);

    this.addStatPill(card, `累计获得 ${totalEarned}`, -20);
    this.addStatPill(card, `已解锁皮肤 ${unlockedCount}/${catSkins.length}`, 220);
  }

  private buildMainPanels(parent: Node, contentW: number): void {
    const gap = 24;
    const maxSkinW = Math.max(500, contentW - HISTORY_WIDTH - gap);
    const skinW = Math.min(SKIN_LIST_WIDTH, maxSkinW);
    const historyW = Math.max(280, contentW - skinW - gap);
    const leftX = -contentW * 0.5 + skinW * 0.5;
    const rightX = contentW * 0.5 - historyW * 0.5;

    const skinPanel = this.addPanel(parent, 'SkinPanel', skinW, BODY_HEIGHT, BODY_TOP, 18);
    skinPanel.setPosition(leftX, skinPanel.position.y, 0);
    this.buildSkinList(skinPanel, skinW);

    const historyPanel = this.addPanel(parent, 'HistoryPanel', historyW, BODY_HEIGHT, BODY_TOP, 18);
    historyPanel.setPosition(rightX, historyPanel.position.y, 0);
    this.buildHistoryList(historyPanel, historyW);
  }

  private buildSkinList(panel: Node, panelW: number): void {
    this.addSectionTitle(panel, '皮肤商店', '兑换后可在游戏内立即生效');

    const viewportW = panelW - 40;
    const viewportH = BODY_HEIGHT - 94;
    const { content } = this.addScrollArea(panel, 'SkinScroll', viewportW, viewportH, -28);
    const rowH = 76;
    content.getComponent(UITransform)!.setContentSize(
      viewportW,
      Math.max(viewportH, catSkins.length * rowH),
    );

    const score = this.scoreManager.getTotalScore();
    const unlockedSkins = this.scoreManager.getUnlockedSkins();
    const currentSkin = this.scoreManager.getCurrentSkin();

    for (let i = 0; i < catSkins.length; i++) {
      const row = this.createSkinRow(
        content,
        catSkins[i],
        viewportW - 4,
        rowH - 10,
        score,
        unlockedSkins,
        currentSkin,
      );
      row.setPosition(0, -i * rowH - rowH * 0.5, 0);
    }
  }

  private createSkinRow(
    parent: Node,
    skin: CatSkin,
    w: number,
    h: number,
    score: number,
    unlockedSkins: string[],
    currentSkin: string,
  ): Node {
    const isUnlocked = unlockedSkins.includes(skin.id);
    const isCurrent = skin.id === currentSkin;
    const row = addNode(parent, `Skin_${skin.id}`, w, h);
    const rowBg = addNode(row, 'Bg', w, h);
    paintRoundRect(
      rowBg.addComponent(Graphics),
      w,
      h,
      isUnlocked ? solidColor(UiTheme.mossPanel, 210) : new Color(45, 48, 42, 180),
      14,
      isCurrent ? { color: UiTheme.honey, width: 2 } : undefined,
    );

    const tint = addNode(row, 'TintPreview', 42, 42);
    tint.setPosition(-w * 0.5 + 34, 0, 0);
    const tintG = tint.addComponent(Graphics);
    tintG.fillColor = new Color(skin.visualTint.r, skin.visualTint.g, skin.visualTint.b, 255);
    tintG.circle(0, 0, 18);
    tintG.fill();
    tintG.lineWidth = 2;
    tintG.strokeColor = UiTheme.modalBtnStroke;
    tintG.circle(0, 0, 18);
    tintG.stroke();

    const name = addLabel(row, 'Name', skin.name, 19, UiTheme.cream, 210, 26);
    name.horizontalAlign = Label.HorizontalAlign.LEFT;
    name.node.setPosition(-w * 0.5 + 150, 13, 0);

    const desc = addLabel(row, 'Desc', skin.description, 14, UiTheme.creamSoft, 260, 24);
    desc.horizontalAlign = Label.HorizontalAlign.LEFT;
    desc.node.setPosition(-w * 0.5 + 175, -14, 0);

    const status = isUnlocked
      ? isCurrent
        ? '当前使用'
        : '已解锁'
      : `${skin.price} 积分`;
    const statusLabel = addLabel(row, 'Status', status, 15, isCurrent ? UiTheme.honey : UiTheme.creamSoft, 110, 28);
    statusLabel.node.setPosition(w * 0.5 - 158, 0, 0);

    if (!isUnlocked && skin.price <= score) {
      const btn = makeLabelButton('兑换', {
        width: 92,
        height: 40,
        fontSize: 16,
        fill: solidColor(UiTheme.modalActionBtnFill),
      });
      btn.setPosition(w * 0.5 - 58, 0, 0);
      row.addChild(
        this.wrapBtn(btn, () => {
          if (this.scoreManager.unlockSkin(skin.id)) {
            this.rebuildPage();
          }
        }),
      );
    } else if (isUnlocked && !isCurrent) {
      const btn = makeLabelButton('使用', {
        width: 92,
        height: 40,
        fontSize: 16,
        fill: solidColor(UiTheme.mossBtn2),
      });
      btn.setPosition(w * 0.5 - 58, 0, 0);
      row.addChild(
        this.wrapBtn(btn, () => {
          this.scoreManager.setCurrentSkin(skin.id);
          this.rebuildPage();
        }),
      );
    }

    return row;
  }

  private buildHistoryList(panel: Node, panelW: number): void {
    this.addSectionTitle(panel, '积分流水', '最近 50 条记录');

    const history = this.scoreManager.getScoreHistory();
    const viewportW = panelW - 40;
    const viewportH = BODY_HEIGHT - 94;
    const { content } = this.addScrollArea(panel, 'HistoryScroll', viewportW, viewportH, -28);

    if (history.length === 0) {
      content.getComponent(UITransform)!.setContentSize(viewportW, viewportH);
      const empty = addLabel(content, 'Empty', '暂无积分记录', 18, UiTheme.creamSoft, viewportW, 44);
      empty.node.setPosition(0, -40, 0);
      return;
    }

    const rowH = 58;
    content.getComponent(UITransform)!.setContentSize(
      viewportW,
      Math.max(viewportH, history.length * rowH),
    );
    for (let i = 0; i < history.length; i++) {
      const entry = history[i];
      const row = addNode(content, `History_${entry.id}`, viewportW - 4, rowH - 8);
      row.setPosition(0, -i * rowH - rowH * 0.5, 0);

      const rowBg = addNode(row, 'Bg', viewportW - 4, rowH - 8);
      paintRoundRect(rowBg.addComponent(Graphics), viewportW - 4, rowH - 8, new Color(24, 36, 20, 170), 12);

      const sign = entry.type === 'earn' ? '+' : '-';
      const amountColor = entry.type === 'earn' ? UiTheme.honey : new Color(255, 145, 130, 255);
      const amount = addLabel(row, 'Amount', `${sign}${entry.amount}`, 20, amountColor, 86, 34);
      amount.horizontalAlign = Label.HorizontalAlign.LEFT;
      amount.node.setPosition(-viewportW * 0.5 + 56, 0, 0);

      const reason = addLabel(row, 'Reason', entry.reason, 15, UiTheme.cream, viewportW - 120, 34);
      reason.horizontalAlign = Label.HorizontalAlign.LEFT;
      reason.node.setPosition(58, 0, 0);
    }
  }

  private addPanel(
    parent: Node,
    name: string,
    w: number,
    h: number,
    top: number,
    cornerRadius: number,
  ): Node {
    const panel = addNode(parent, name, w, h);
    const widget = panel.addComponent(Widget);
    widget.isAlignTop = true;
    widget.isAlignHorizontalCenter = true;
    widget.top = top;

    const bg = addNode(panel, 'PanelBg', w, h);
    paintRoundRect(
      bg.addComponent(Graphics),
      w,
      h,
      solidColor(UiTheme.modalPanelBg),
      cornerRadius,
      { color: UiTheme.modalPanelBorder, width: UiTheme.modalPanelBorderWidth },
    );
    return panel;
  }

  private addSectionTitle(panel: Node, titleText: string, subText: string): void {
    const title = addLabel(panel, 'SectionTitle', titleText, 22, UiTheme.cream, 220, 34);
    title.horizontalAlign = Label.HorizontalAlign.LEFT;
    title.node.setPosition(-panel.getComponent(UITransform)!.width * 0.5 + 130, panel.getComponent(UITransform)!.height * 0.5 - 34, 0);

    const sub = addLabel(panel, 'SectionSub', subText, 14, UiTheme.creamSoft, 260, 24);
    sub.horizontalAlign = Label.HorizontalAlign.LEFT;
    sub.node.setPosition(-panel.getComponent(UITransform)!.width * 0.5 + 150, panel.getComponent(UITransform)!.height * 0.5 - 62, 0);
  }

  private addScrollArea(
    parent: Node,
    name: string,
    w: number,
    h: number,
    y: number,
  ): { root: Node; content: Node } {
    const root = addNode(parent, name, w, h);
    root.setPosition(0, y, 0);

    const viewNode = addNode(root, 'View', w, h);
    viewNode.addComponent(Mask);

    const content = addNode(viewNode, 'Content', w, h);
    content.getComponent(UITransform)!.setAnchorPoint(0.5, 1);
    content.setPosition(0, h * 0.5, 0);

    const layout = content.addComponent(Layout);
    layout.type = Layout.Type.VERTICAL;
    layout.resizeMode = Layout.ResizeMode.NONE;
    layout.verticalDirection = Layout.VerticalDirection.TOP_TO_BOTTOM;
    layout.spacingY = 0;

    const scrollView = root.addComponent(ScrollView);
    scrollView.content = content;
    scrollView.vertical = true;
    scrollView.horizontal = false;
    scrollView.inertia = true;
    scrollView.brake = 0.75;

    const barTrack = addNode(root, 'ScrollBarTrack', 4, h - 12);
    barTrack.setPosition(w * 0.5 - 8, 0, 0);
    const trackG = barTrack.addComponent(Graphics);
    trackG.fillColor = new Color(UiTheme.cream.r, UiTheme.cream.g, UiTheme.cream.b, 40);
    trackG.roundRect(-2, -(h - 12) * 0.5, 4, h - 12, 2);
    trackG.fill();

    return { root, content };
  }

  private addStatPill(parent: Node, text: string, x: number): void {
    const pill = addNode(parent, `Pill_${text}`, 210, 46);
    pill.setPosition(x, -4, 0);
    paintRoundRect(pill.addComponent(Graphics), 210, 46, new Color(255, 255, 255, 24), 23);
    addLabel(pill, 'Text', text, 17, UiTheme.cream, 190, 34);
  }

  private addAnchoredLabel(
    parent: Node,
    name: string,
    text: string,
    fontSize: number,
    color: Color,
    w: number,
    h: number,
    top: number,
  ): Label {
    const label = addLabel(parent, name, text, fontSize, color, w, h);
    const widget = label.node.addComponent(Widget);
    widget.isAlignTop = true;
    widget.isAlignHorizontalCenter = true;
    widget.top = top;
    return label;
  }

  private pinFullScreen(node: Node): void {
    const widget = node.addComponent(Widget);
    widget.isAlignTop =
      widget.isAlignBottom =
      widget.isAlignLeft =
      widget.isAlignRight =
        true;
    widget.top = widget.bottom = widget.left = widget.right = 0;
  }

  private wrapBtn(n: Node, cb: () => void): Node {
    n.on(Button.EventType.CLICK, cb, this);
    return n;
  }

  private syncUiLayer(node: Node): void {
    node.layer = this.node.layer;
    for (const child of node.children) {
      this.syncUiLayer(child);
    }
  }

  private paintBackground(): void {
    if (!this.bgNode) return;
    const vs = view.getVisibleSize();
    this.bgNode.getComponent(UITransform)?.setContentSize(vs.width, vs.height);
    const g = this.bgNode.getComponent(Graphics) ?? this.bgNode.addComponent(Graphics);
    g.clear();
    g.fillColor = UiTheme.bgFallback;
    g.rect(-vs.width * 0.5, -vs.height * 0.5, vs.width, vs.height);
    g.fill();

    g.fillColor = new Color(UiTheme.mossPanel.r, UiTheme.mossPanel.g, UiTheme.mossPanel.b, 85);
    g.circle(-vs.width * 0.36, vs.height * 0.32, 160);
    g.fill();
    g.fillColor = new Color(UiTheme.honey.r, UiTheme.honey.g, UiTheme.honey.b, 36);
    g.circle(vs.width * 0.34, -vs.height * 0.28, 210);
    g.fill();
  }
}
