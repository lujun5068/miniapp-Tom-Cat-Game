import {
  _decorator,
  BlockInputEvents,
  Button,
  Color,
  Component,
  Graphics,
  Label,
  Mask,
  Node,
  ScrollView,
  Sprite,
  SpriteFrame,
  UITransform,
  view,
  Widget,
} from 'cc';
import { ScoreManager } from './game/ScoreManager';
import type { ScoreHistoryEntry } from './game/ScoreManager';
import { loadCatSkinStartFrame } from './game/catSkinLoader';
import { loadMainGameScene } from './game/sceneRoutes';
import { catSkins, type CatSkin } from './game/skinConfig';
import { setupWechatShare } from './storage/wechatShare';
import { UiTheme } from './ui/UiTheme';
import {
  addUiLabel as addLabel,
  addUiNode as addNode,
  makeLabelButton,
  paintRoundRect,
  solidColor,
} from './ui/widgets';

const { ccclass } = _decorator;

const PAGE_MAX_WIDTH = 1080;
const PAGE_H_PAD = 36;
const HEADER_TOP = 22;
const SCORE_CARD_TOP = 82;
/** 积分卡片高度；包含底部"分享获额外积分"提示一行 */
const SCORE_CARD_HEIGHT = 144;
/**
 * 积分卡片主行（分数 / 详情按钮 / stat pill）的纵向锚点。
 * 卡片高度从 104 升到 144 后向上让出底部 40px 用于放分享提示文案；
 * 主行整体相对新中心上抬 20，使原本"看起来在卡片顶部 + 中部"的元素视觉位置不变。
 */
const SCORE_CARD_MAIN_ROW_Y = 16;
const SCORE_CARD_TITLE_Y = 42;
const SCORE_CARD_VALUE_Y = 4;
/** 分享提示文案 y 坐标（卡片中心向下偏移），距卡片底部约 14px */
const SCORE_CARD_HINT_Y = -50;
const BODY_TOP = SCORE_CARD_TOP + SCORE_CARD_HEIGHT + 24;
const MIN_CONTENT_WIDTH = 760;
const SKIN_GRID_MAX_COLUMNS = 4;
const SKIN_GRID_MIN_CARD_W = 172;
const SKIN_CARD_PREVIEW_H = 46;
const SKIN_CARD_NAME_H = 24;
const SKIN_CARD_DESC_H = 38;
const SKIN_CARD_PRICE_H = 22;
const SKIN_CARD_STATUS_H = 22;
const SKIN_CARD_BTN_H = 36;
const SKIN_CARD_V_PAD = 14;
const SKIN_CARD_SECTION_GAP = 6;
const SKIN_CARD_HEIGHT =
  SKIN_CARD_V_PAD * 2 +
  SKIN_CARD_PREVIEW_H +
  SKIN_CARD_NAME_H +
  SKIN_CARD_DESC_H +
  SKIN_CARD_PRICE_H +
  SKIN_CARD_STATUS_H +
  SKIN_CARD_BTN_H +
  SKIN_CARD_SECTION_GAP * 5;
const SKIN_CARD_GAP = 16;
const SKIN_PANEL_HEADER_HEIGHT = 86;
const SKIN_PANEL_BOTTOM_PAD = 24;

type SkinRowState = {
  node: Node;
  nameLabel: Label;
  descLabel: Label;
  priceLabel: Label;
  statusLabel: Label;
  actionBtn: Node | null;
  bg: Node;
  bgGraphics: Graphics;
  preview: Node;
  previewGraphics: Graphics;
  previewSprite: Sprite;
  previewSpriteNode: Node;
};

type HistoryRowState = {
  node: Node;
  amountLabel: Label;
  reasonLabel: Label;
  timeLabel: Label;
};

type ScrollAreaState = {
  scrollView: ScrollView;
  content: Node;
  viewportHeight: number;
  track: Node;
  thumb: Node;
  thumbGraphics: Graphics;
};

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  if (!Number.isFinite(date.getTime())) {
    return '刚刚';
  }
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.max(0, Math.floor(diffMs / 60000));
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) {
    return `${diffMins}分钟前`;
  } else if (diffHours < 24) {
    return `${diffHours}小时前`;
  } else if (diffDays < 7) {
    return `${diffDays}天前`;
  } else {
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  }
}

@ccclass('PersonalCenterPage')
export class PersonalCenterPage extends Component {
  private readonly scoreManager = ScoreManager.getInstance();
  private bgNode: Node | null = null;
  private mainScrollView: ScrollView | null = null;
  private contentRoot: Node | null = null;
  private skinPanel: Node | null = null;
  private skinContent: Node | null = null;
  private skinRows: Map<string, SkinRowState> = new Map();
  /** start 帧贴图缓存：同一皮肤的预览图只加载一次，刷新卡片时直接拿现成的 SpriteFrame。 */
  private skinPreviewCache: Map<string, SpriteFrame | null> = new Map();
  private historyScrollView: ScrollView | null = null;
  private historyContent: Node | null = null;
  private historyRows: Map<string, HistoryRowState> = new Map();
  private scrollAreas: ScrollAreaState[] = [];
  private scoreCard: Node | null = null;
  private scoreValueLabel: Label | null = null;
  private scoreDetailBtn: Node | null = null;
  private scoreShareHintLabel: Label | null = null;
  private statPills: Node[] = [];
  private confirmPopup: Node | null = null;
  private historyPopup: Node | null = null;

  onLoad(): void {
    console.log('[PersonalCenterPage] onLoad');
    this.node.addComponent(BlockInputEvents);
    this.setupShare();
    this.buildPage();
    view.on('canvas-resize', this.layoutScreen, this);
  }

  onDestroy(): void {
    view.off('canvas-resize', this.layoutScreen, this);
  }

  private layoutScreen(): void {
    this.buildPage();
  }

  lateUpdate(): void {
    if (this.scrollAreas.length === 0) return;
    let needCompact = false;
    for (const area of this.scrollAreas) {
      if (!this.isScrollAreaAlive(area)) {
        needCompact = true;
        continue;
      }
      this.updateScrollThumb(area);
    }
    if (needCompact) {
      this.scrollAreas = this.scrollAreas.filter((area) =>
        this.isScrollAreaAlive(area),
      );
    }
  }

  private isScrollAreaAlive(area: ScrollAreaState): boolean {
    return (
      !!area.scrollView &&
      area.scrollView.isValid &&
      !!area.content &&
      area.content.isValid &&
      !!area.track &&
      area.track.isValid &&
      !!area.thumb &&
      area.thumb.isValid
    );
  }

  private destroyOverlay(overlay: Node | null): void {
    if (!overlay) return;
    if (overlay.isValid) {
      this.scrollAreas = this.scrollAreas.filter(
        (area) => !this.isDescendantOf(area.scrollView?.node ?? null, overlay),
      );
      overlay.destroy();
    } else {
      this.scrollAreas = this.scrollAreas.filter((area) =>
        this.isScrollAreaAlive(area),
      );
    }
  }

  private isDescendantOf(node: Node | null, ancestor: Node): boolean {
    let cur: Node | null = node;
    while (cur) {
      if (cur === ancestor) return true;
      cur = cur.parent;
    }
    return false;
  }

  private buildPage(): void {
    this.clearPageChildren();
    const vs = view.getVisibleSize();
    this.node.getComponent(UITransform)?.setContentSize(vs);

    this.bgNode = addNode(this.node, 'PageBg', vs.width, vs.height);
    this.pinFullScreen(this.bgNode);
    this.paintBackground();

    const contentW = this.calculateContentWidth(vs.width);
    const mainScroll = this.addMainScrollArea(contentW, vs.height);
    this.mainScrollView = mainScroll.scrollView;
    const content = mainScroll.content;
    this.contentRoot = content;

    this.buildHeader(content, contentW);
    this.buildScoreCard(content, contentW);
    const pageHeight = this.buildSkinPanel(content, contentW);
    content
      .getComponent(UITransform)!
      .setContentSize(contentW, Math.max(vs.height, pageHeight));
    // content 锚点为 (0.5, 1)，position.y 表示内容顶端在父节点中的位置。
    // 父节点（view）锚点 (0.5, 0.5)、高度 = vs.height，其顶端在父空间为 vs.height / 2。
    // 因此内容顶端始终对齐视口顶端，与内容总高度无关。
    content.setPosition(0, vs.height * 0.5, 0);
    this.syncUiLayer(content);
  }

  private setupShare(): void {
    const score = this.scoreManager.getTotalScore();
    const unlockedCount = this.scoreManager.getUnlockedSkins().length;
    setupWechatShare({
      title: `我在 Tom Cat 已有 ${score} 积分，解锁了 ${unlockedCount} 个皮肤！`,
      query: 'from=personal-center',
      onShareSuccess: (channel) => {
        // 分享 +10 积分，每日仅 1 次。无论主游戏还是个人中心入口，
        // 用同一份 ScoreManager 存档判定；入账成功后立即刷新积分卡片。
        const got = this.scoreManager.addShareReward(
          channel === 'timeline'
            ? '分享朋友圈 · 个人中心'
            : '分享游戏 · 个人中心',
        );
        if (got > 0) {
          this.refreshScoreCard();
        }
      },
    });
  }

  private calculateContentWidth(screenWidth: number): number {
    const availableWidth = screenWidth - PAGE_H_PAD * 2;
    return Math.min(
      PAGE_MAX_WIDTH,
      Math.max(MIN_CONTENT_WIDTH, availableWidth),
    );
  }

  private addMainScrollArea(
    contentW: number,
    screenH: number,
  ): { content: Node; scrollView: ScrollView } {
    const root = addNode(this.node, 'Content', contentW, screenH);
    const rootWidget = root.addComponent(Widget);
    rootWidget.isAlignTop = true;
    rootWidget.isAlignBottom = true;
    rootWidget.isAlignHorizontalCenter = true;
    rootWidget.top = rootWidget.bottom = 0;

    const viewNode = addNode(root, 'view', contentW, screenH);
    viewNode.addComponent(Mask);

    const content = addNode(viewNode, 'ContentInner', contentW, screenH);
    content.getComponent(UITransform)!.setAnchorPoint(0.5, 1);
    content.setPosition(0, screenH * 0.5, 0);

    const scrollView = root.addComponent(ScrollView);
    scrollView.content = content;
    scrollView.vertical = true;
    scrollView.horizontal = false;
    scrollView.inertia = true;
    scrollView.brake = 0.75;
    return { content, scrollView };
  }

  private clearPageChildren(): void {
    for (let i = this.node.children.length - 1; i >= 0; i--) {
      const child = this.node.children[i];
      if (child.name === 'Camera') continue;
      child.destroy();
    }
    this.bgNode = null;
    this.mainScrollView = null;
    this.contentRoot = null;
    this.skinPanel = null;
    this.skinContent = null;
    this.skinRows.clear();
    this.historyScrollView = null;
    this.historyContent = null;
    this.historyRows.clear();
    this.scrollAreas = [];
    this.scoreCard = null;
    this.scoreValueLabel = null;
    this.scoreDetailBtn = null;
    this.scoreShareHintLabel = null;
    this.statPills = [];
    this.confirmPopup = null;
    this.historyPopup = null;
  }

  private buildHeader(parent: Node, contentW: number): void {
    const back = makeLabelButton('返回', 112, 44, {
      fontSize: 18,
      fill: solidColor(UiTheme.modalActionBtnFill),
    });
    const backW = back.addComponent(Widget);
    backW.isAlignTop = true;
    backW.isAlignLeft = true;
    backW.top = HEADER_TOP;
    backW.left = 0;
    parent.addChild(this.wrapBtn(back, () => loadMainGameScene()));

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
    this.scoreCard = this.addPanel(
      parent,
      'ScoreCard',
      contentW,
      SCORE_CARD_HEIGHT,
      SCORE_CARD_TOP,
      18,
    );
    const title = addLabel(
      this.scoreCard,
      'ScoreTitle',
      '当前积分',
      20,
      UiTheme.creamSoft,
      180,
      28,
    );
    title.horizontalAlign = Label.HorizontalAlign.LEFT;
    title.node.setPosition(-contentW * 0.5 + 32 + 90, SCORE_CARD_TITLE_Y, 0);

    this.scoreValueLabel = addLabel(
      this.scoreCard,
      'ScoreValue',
      '0',
      42,
      UiTheme.honey,
      180,
      48,
    );
    this.scoreValueLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
    this.scoreValueLabel.node.setPosition(
      -contentW * 0.5 + 32 + 90,
      SCORE_CARD_VALUE_Y,
      0,
    );

    this.scoreDetailBtn = makeLabelButton('积分详情', 116, 42, {
      fontSize: 17,
      fill: solidColor(UiTheme.mossBtn2),
    });
    this.scoreDetailBtn.setPosition(
      contentW * 0.5 - 82,
      SCORE_CARD_MAIN_ROW_Y,
      0,
    );
    this.scoreCard.addChild(
      this.wrapBtn(this.scoreDetailBtn, () => this.showHistoryPopup()),
    );

    // 底部一行分享提示。文案随当日是否已领取分享奖励切换：
    // 未领取 → 引导分享；已领取 → 告知次日可再次领取。
    this.scoreShareHintLabel = addLabel(
      this.scoreCard,
      'ScoreShareHint',
      '',
      14,
      UiTheme.muted,
      Math.max(240, contentW - 64),
      22,
    );
    this.scoreShareHintLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    this.scoreShareHintLabel.overflow = Label.Overflow.SHRINK;
    this.scoreShareHintLabel.node.setPosition(0, SCORE_CARD_HINT_Y, 0);

    this.refreshScoreCard();
  }

  private refreshScoreCard(): void {
    if (!this.scoreValueLabel || !this.scoreCard) return;
    const availableScore = this.scoreManager.getTotalScore();
    const totalEarned = this.scoreManager.getTotalEarnedScore();
    const unlockedCount = this.scoreManager.getUnlockedSkins().length;

    this.scoreValueLabel.string = String(availableScore);

    for (const pill of this.statPills) {
      pill.destroy();
    }
    this.statPills = [];

    // 基于卡片实际宽度计算 pill 可用区间，避免窄屏下与右侧"积分详情"按钮重叠。
    // 左侧分数标签右沿 ≈ -W/2 + 212；右侧详情按钮左沿 ≈ W/2 - 140。
    const cardW = this.scoreCard.getComponent(UITransform)!.width;
    const zoneLeft = -cardW * 0.5 + 212 + 16;
    const zoneRight = cardW * 0.5 - 140 - 16;
    const zoneWidth = Math.max(0, zoneRight - zoneLeft);
    const pillGap = 14;
    const pillWidth = Math.max(
      120,
      Math.min(220, (zoneWidth - pillGap) / 2),
    );
    const pill1X = zoneLeft + pillWidth * 0.5;
    const pill2X = zoneRight - pillWidth * 0.5;

    const pill1 = this.addStatPill(
      this.scoreCard,
      `累计获得 ${totalEarned}`,
      pill1X,
      pillWidth,
    );
    const pill2 = this.addStatPill(
      this.scoreCard,
      `已解锁皮肤 ${unlockedCount}/${catSkins.length}`,
      pill2X,
      pillWidth,
    );
    this.statPills.push(pill1, pill2);

    if (this.scoreShareHintLabel) {
      this.scoreShareHintLabel.string = this.scoreManager.canClaimShareRewardToday()
        ? '每日将游戏分享给微信好友或群聊可获得额外积分奖励！'
        : '今日分享奖励已领取，明天再来分享可继续获得 +10';
    }

    // 分数 / 已解锁皮肤数变化后同步刷新微信分享卡片文案，
    // 避免兑换皮肤后还沿用进入页面那一刻的旧数据。
    this.setupShare();
  }

  private buildSkinPanel(parent: Node, contentW: number): number {
    const columns = this.skinGridColumns(contentW - 40);
    const rowCount = Math.ceil(catSkins.length / columns);
    const panelH =
      SKIN_PANEL_HEADER_HEIGHT +
      rowCount * SKIN_CARD_HEIGHT +
      Math.max(0, rowCount - 1) * SKIN_CARD_GAP +
      SKIN_PANEL_BOTTOM_PAD;
    this.skinPanel = this.addPanel(
      parent,
      'SkinPanel',
      contentW,
      panelH,
      BODY_TOP,
      18,
    );
    this.buildSkinList(this.skinPanel, contentW);
    return BODY_TOP + panelH + PAGE_H_PAD;
  }

  private buildSkinList(panel: Node, panelW: number): void {
    this.addSectionTitle(panel, '皮肤商店', '兑换后可在游戏内立即生效');

    const viewportW = panelW - 40;
    const gridH = panel.getComponent(UITransform)!.height - SKIN_PANEL_HEADER_HEIGHT - SKIN_PANEL_BOTTOM_PAD;
    const content = addNode(
      panel,
      'SkinGrid',
      viewportW,
      gridH,
    );
    content.getComponent(UITransform)!.setAnchorPoint(0.5, 1);
    content.setPosition(0, panel.getComponent(UITransform)!.height * 0.5 - SKIN_PANEL_HEADER_HEIGHT, 0);
    this.skinContent = content;
    this.skinRows = new Map();

    const columns = this.skinGridColumns(viewportW);
    const rowCount = Math.ceil(catSkins.length / columns);
    this.skinContent
      .getComponent(UITransform)!
      .setContentSize(
        viewportW,
        rowCount * SKIN_CARD_HEIGHT +
          Math.max(0, rowCount - 1) * SKIN_CARD_GAP,
      );

    this.refreshSkinList();
  }

  private skinGridColumns(viewportW: number): number {
    const possible = Math.floor(
      (viewportW + SKIN_CARD_GAP) / (SKIN_GRID_MIN_CARD_W + SKIN_CARD_GAP),
    );
    return Math.max(1, Math.min(SKIN_GRID_MAX_COLUMNS, possible));
  }

  private refreshSkinList(): void {
    if (!this.skinContent) return;
    const score = this.scoreManager.getTotalScore();
    const unlockedSkins = this.scoreManager.getUnlockedSkins();
    const currentSkin = this.scoreManager.getCurrentSkin();
    const viewportW = this.skinContent.getComponent(UITransform)!.width;
    const columns = this.skinGridColumns(viewportW);
    const cardW = Math.floor(
      (viewportW - SKIN_CARD_GAP * (columns - 1) - 8) / columns,
    );
    const cardH = SKIN_CARD_HEIGHT;
    const rowH = cardH + SKIN_CARD_GAP;

    this.skinContent.removeAllChildren();
    this.skinRows.clear();

    for (let i = 0; i < catSkins.length; i++) {
      const skin = catSkins[i];
      const skinId = skin.id;
      const isUnlocked = skin.isDefault || unlockedSkins.indexOf(skinId) >= 0;
      const isCurrent = skinId === currentSkin;
      const col = i % columns;
      const row = Math.floor(i / columns);
      const x = -viewportW * 0.5 + 4 + cardW * 0.5 + col * (cardW + SKIN_CARD_GAP);
      const y = -row * rowH - cardH * 0.5;

      const rowState = this.createSkinRow(
        this.skinContent,
        skin,
        cardW,
        cardH,
      );
      this.skinRows.set(skinId, rowState);
      rowState.node.setPosition(x, y, 0);

      this.refreshSkinRow(rowState, skin, score, isUnlocked, isCurrent);
    }
  }

  private createSkinRow(
    parent: Node,
    skin: CatSkin,
    w: number,
    h: number,
  ): SkinRowState {
    const row = addNode(parent, `Skin_${skin.id}`, w, h);
    const rowBg = addNode(row, 'Bg', w, h);
    const rowBgGraphics = rowBg.addComponent(Graphics);
    const tint = addNode(row, 'Preview', 48, 48);
    const tintGraphics = tint.addComponent(Graphics);
    // 预览贴图节点叠在 Graphics 之上，加载完 start 帧后展示；占位时为空，由 Graphics 圆形兜底。
    const previewSpriteNode = addNode(tint, 'PreviewSprite', 44, 44);
    const previewSprite = previewSpriteNode.addComponent(Sprite);
    previewSprite.sizeMode = Sprite.SizeMode.CUSTOM;
    previewSprite.spriteFrame = null;
    const top = h * 0.5 - SKIN_CARD_V_PAD;
    let cursorY = top - SKIN_CARD_PREVIEW_H * 0.5;
    tint.setPosition(0, cursorY, 0);

    cursorY -= SKIN_CARD_PREVIEW_H * 0.5 + SKIN_CARD_SECTION_GAP + SKIN_CARD_NAME_H * 0.5;
    const name = addLabel(row, 'Name', skin.name, 18, UiTheme.cream, w - 18, SKIN_CARD_NAME_H);
    name.horizontalAlign = Label.HorizontalAlign.CENTER;
    name.node.setPosition(0, cursorY, 0);

    cursorY -= SKIN_CARD_NAME_H * 0.5 + SKIN_CARD_SECTION_GAP + SKIN_CARD_DESC_H * 0.5;
    const desc = addLabel(
      row,
      'Desc',
      skin.description,
      13,
      UiTheme.creamSoft,
      w - 18,
      SKIN_CARD_DESC_H,
    );
    desc.horizontalAlign = Label.HorizontalAlign.CENTER;
    desc.verticalAlign = Label.VerticalAlign.TOP;
    desc.node.setPosition(0, cursorY, 0);

    cursorY -= SKIN_CARD_DESC_H * 0.5 + SKIN_CARD_SECTION_GAP + SKIN_CARD_PRICE_H * 0.5;
    const priceLabel = addLabel(
      row,
      'Price',
      '',
      13,
      UiTheme.creamSoft,
      w - 18,
      SKIN_CARD_PRICE_H,
    );
    priceLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    priceLabel.node.setPosition(0, cursorY, 0);

    cursorY -= SKIN_CARD_PRICE_H * 0.5 + SKIN_CARD_SECTION_GAP + SKIN_CARD_STATUS_H * 0.5;
    const statusLabel = addLabel(
      row,
      'Status',
      '',
      14,
      UiTheme.creamSoft,
      w - 18,
      SKIN_CARD_STATUS_H,
    );
    statusLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    statusLabel.node.setPosition(0, cursorY, 0);

    return {
      node: row,
      nameLabel: name,
      descLabel: desc,
      priceLabel,
      statusLabel: statusLabel,
      actionBtn: null,
      bg: rowBg,
      bgGraphics: rowBgGraphics,
      preview: tint,
      previewGraphics: tintGraphics,
      previewSprite,
      previewSpriteNode,
    };
  }

  private refreshSkinRow(
    state: SkinRowState,
    skin: CatSkin,
    score: number,
    isUnlocked: boolean,
    isCurrent: boolean,
  ): void {
    const w = state.bg.getComponent(UITransform)!.width;
    const h = state.bg.getComponent(UITransform)!.height;

    this.refreshSkinRowBackground(state, isUnlocked, isCurrent);
    this.refreshSkinPreview(state, skin, isUnlocked, isCurrent);
    state.nameLabel.string = skin.name;
    state.descLabel.string = skin.description;
    state.priceLabel.string = skin.isDefault
      ? '价格：免费'
      : `价格：${skin.price} 积分`;

    let statusText: string;
    let statusColor: Color;
    if (isUnlocked) {
      statusText = isCurrent ? '当前使用' : '已解锁';
      statusColor = isCurrent ? UiTheme.honey : UiTheme.creamSoft;
    } else {
      statusText = `${skin.price} 积分`;
      statusColor = UiTheme.creamSoft;
    }
    state.statusLabel.string = statusText;
    state.statusLabel.color = statusColor;

    if (state.actionBtn) {
      state.actionBtn.destroy();
      state.actionBtn = null;
    }

    if (isUnlocked && !isCurrent) {
      state.actionBtn = this.createActionBtn(
        state.node,
        '使用',
        UiTheme.mossBtn2,
        w,
        -h * 0.5 + SKIN_CARD_V_PAD + SKIN_CARD_BTN_H * 0.5,
        () => {
          if (this.scoreManager.setCurrentSkin(skin.id)) {
            this.refreshSkinList();
            this.refreshScoreCard();
          }
        },
      );
    } else if (!isUnlocked && skin.price <= score) {
      state.actionBtn = this.createActionBtn(
        state.node,
        '兑换',
        UiTheme.modalActionBtnFill,
        w,
        -h * 0.5 + SKIN_CARD_V_PAD + SKIN_CARD_BTN_H * 0.5,
        () => {
          this.showConfirmUnlock(skin);
        },
      );
    } else if (!isUnlocked && skin.price > score) {
      state.statusLabel.string = '积分不足';
      state.statusLabel.color = new Color(255, 145, 130, 255);
    }
  }

  private refreshSkinRowBackground(
    state: SkinRowState,
    isUnlocked: boolean,
    isCurrent: boolean,
  ): void {
    const w = state.bg.getComponent(UITransform)!.width;
    const h = state.bg.getComponent(UITransform)!.height;
    paintRoundRect(
      state.bgGraphics,
      w,
      h,
      isUnlocked
        ? solidColor(UiTheme.mossPanel, 210)
        : new Color(45, 48, 42, 180),
      14,
      isCurrent ? { color: UiTheme.honey, width: 2 } : undefined,
    );
  }

  private refreshSkinPreview(
    state: SkinRowState,
    skin: CatSkin,
    isUnlocked: boolean,
    isCurrent: boolean,
  ): void {
    // Graphics 仅负责画背景圆 + 状态边框；猫贴图由 PreviewSprite 子节点叠加显示。
    const g = state.previewGraphics;
    g.clear();
    const radius = isCurrent ? 21 : isUnlocked ? 19 : 17;
    g.fillColor = isUnlocked
      ? new Color(48, 60, 50, 220)
      : new Color(45, 48, 42, 200);
    g.circle(0, 0, radius);
    g.fill();
    if (isCurrent) {
      g.lineWidth = 3;
      g.strokeColor = UiTheme.honey;
    } else if (isUnlocked) {
      g.lineWidth = 2;
      g.strokeColor = UiTheme.modalBtnStroke;
    } else {
      g.lineWidth = 2;
      g.strokeColor = new Color(100, 100, 100, 160);
    }
    g.circle(0, 0, radius);
    g.stroke();

    // 已解锁皮肤使用纯白避免与帧贴图自带颜色二次相乘失真；未解锁灰色 + 半透明做"未拥有"提示。
    const sprite = state.previewSprite;
    sprite.color = isUnlocked
      ? new Color(255, 255, 255, 255)
      : new Color(110, 110, 110, 180);

    // 先用缓存的 SpriteFrame；缓存里没有则触发异步加载并在回调里设入。
    const cached = this.skinPreviewCache.get(skin.id);
    if (cached !== undefined) {
      sprite.spriteFrame = cached;
      return;
    }
    sprite.spriteFrame = null;
    void this.fetchSkinPreviewFrame(skin.id);
  }

  private async fetchSkinPreviewFrame(skinId: string): Promise<void> {
    if (this.skinPreviewCache.has(skinId)) return;
    const frame = await loadCatSkinStartFrame(skinId);
    this.skinPreviewCache.set(skinId, frame);
    // 加载完成时组件可能已被销毁（用户已离开个人中心），需要 isValid 防御。
    if (!this.node || !this.node.isValid) return;
    const state = this.skinRows.get(skinId);
    if (!state || !state.previewSprite.isValid) return;
    state.previewSprite.spriteFrame = frame;
  }

  private createActionBtn(
    parent: Node,
    text: string,
    fillColor: Color,
    parentW: number,
    y: number,
    cb: () => void,
  ): Node {
    const btn = makeLabelButton(text, 92, SKIN_CARD_BTN_H, {
      fontSize: 16,
      fill: solidColor(fillColor),
    });
    btn.setPosition(0, y, 0);
    parent.addChild(this.wrapBtn(btn, cb));
    // makeLabelButton 内部 `new Node()` 的 layer 默认是 Default，与 PersonalCenterPage Canvas
    // 所在的 UI_2D layer 可能不一致；显式同步整棵子树，确保按钮被 UI Camera 渲染。
    this.syncUiLayer(btn);
    return btn;
  }

  private showConfirmUnlock(skin: CatSkin): void {
    this.destroyOverlay(this.confirmPopup);
    this.confirmPopup = null;

    const overlay = new Node('ConfirmOverlay');
    this.confirmPopup = overlay;
    overlay.addComponent(UITransform).setContentSize(view.getVisibleSize());
    this.pinFullScreen(overlay);
    overlay.addComponent(BlockInputEvents);
    this.node.addChild(overlay);

    const backdrop = addNode(overlay, 'Backdrop', view.getVisibleSize().width, view.getVisibleSize().height);
    this.pinFullScreen(backdrop);
    const backdropG = backdrop.addComponent(Graphics);
    backdropG.fillColor = new Color(0, 0, 0, 170);
    const vs = view.getVisibleSize();
    backdropG.rect(-vs.width * 0.5, -vs.height * 0.5, vs.width, vs.height);
    backdropG.fill();

    const popup = addNode(overlay, 'ConfirmPopup', 400, 200);
    const w = popup.addComponent(Widget);
    w.isAlignHorizontalCenter = w.isAlignVerticalCenter = true;

    const bg = addNode(popup, 'Bg', 400, 200);
    paintRoundRect(
      bg.addComponent(Graphics),
      400,
      200,
      solidColor(UiTheme.modalPanelBg),
      16,
      { color: UiTheme.modalPanelBorder, width: UiTheme.modalPanelBorderWidth },
    );

    const title = addLabel(
      popup,
      'Title',
      '确认兑换',
      24,
      UiTheme.cream,
      360,
      40,
    );
    title.node.setPosition(0, 60, 0);

    const message = addLabel(
      popup,
      'Message',
      `确定花费 ${skin.price} 积分兑换「${skin.name}」吗？`,
      18,
      UiTheme.creamSoft,
      360,
      60,
    );
    message.node.setPosition(0, 10, 0);

    const btnContainer = addNode(popup, 'BtnContainer', 360, 50);
    btnContainer.setPosition(0, -60, 0);

    const cancelBtn = makeLabelButton('取消', 120, 44, {
      fontSize: 18,
      fill: solidColor(new Color(100, 100, 100, 200)),
    });
    cancelBtn.setPosition(-80, 0, 0);
    btnContainer.addChild(
      this.wrapBtn(cancelBtn, () => {
        this.destroyOverlay(overlay);
        if (this.confirmPopup === overlay) this.confirmPopup = null;
      }),
    );

    const confirmBtn = makeLabelButton('确认', 120, 44, {
      fontSize: 18,
      fill: solidColor(UiTheme.modalActionBtnFill),
    });
    confirmBtn.setPosition(80, 0, 0);
    btnContainer.addChild(
      this.wrapBtn(confirmBtn, () => {
        if (this.scoreManager.unlockSkin(skin.id)) {
          this.refreshSkinList();
          this.refreshScoreCard();
        }
        this.destroyOverlay(overlay);
        if (this.confirmPopup === overlay) this.confirmPopup = null;
      }),
    );
    this.syncUiLayer(overlay);
  }

  private showHistoryPopup(): void {
    this.destroyOverlay(this.historyPopup);
    this.historyPopup = null;

    const overlay = new Node('HistoryOverlay');
    this.historyPopup = overlay;
    overlay.addComponent(UITransform).setContentSize(view.getVisibleSize());
    this.pinFullScreen(overlay);
    overlay.addComponent(BlockInputEvents);
    this.node.addChild(overlay);

    const backdrop = addNode(overlay, 'Backdrop', view.getVisibleSize().width, view.getVisibleSize().height);
    this.pinFullScreen(backdrop);
    const backdropG = backdrop.addComponent(Graphics);
    backdropG.fillColor = new Color(0, 0, 0, 170);
    const vs = view.getVisibleSize();
    backdropG.rect(-vs.width * 0.5, -vs.height * 0.5, vs.width, vs.height);
    backdropG.fill();

    const popupW = Math.min(720, Math.max(520, vs.width - 120));
    const popupH = Math.min(520, Math.max(360, vs.height - 120));
    const panel = this.addPanel(overlay, 'HistoryPopup', popupW, popupH, 0, 18);
    const panelWidget = panel.getComponent(Widget)!;
    panelWidget.isAlignTop = false;
    panelWidget.isAlignVerticalCenter = true;

    const title = addLabel(panel, 'PopupTitle', '积分流水', 24, UiTheme.cream, 220, 38);
    title.horizontalAlign = Label.HorizontalAlign.LEFT;
    title.node.setPosition(-popupW * 0.5 + 130, popupH * 0.5 - 36, 0);

    const closeBtn = makeLabelButton('关闭', 96, 40, {
      fontSize: 16,
      fill: solidColor(UiTheme.modalActionBtnFill),
    });
    closeBtn.setPosition(popupW * 0.5 - 68, popupH * 0.5 - 38, 0);
    panel.addChild(
      this.wrapBtn(closeBtn, () => {
        this.destroyOverlay(overlay);
        if (this.historyPopup === overlay) this.historyPopup = null;
      }),
    );

    this.buildHistoryList(panel, popupW, popupH);
    this.syncUiLayer(overlay);
  }

  private buildHistoryList(panel: Node, panelW: number, panelH: number): void {
    const viewportW = panelW - 40;
    const viewportH = panelH - 94;
    const scrollResult = this.addScrollArea(
      panel,
      'HistoryScroll',
      viewportW,
      viewportH,
      -34,
    );
    this.historyContent = scrollResult.content;
    this.historyScrollView = scrollResult.scrollView;
    this.historyRows = new Map();

    this.refreshHistoryList();
  }

  private refreshHistoryList(): void {
    if (!this.historyContent) return;
    const history = this.scoreManager.getScoreHistory();
    const viewportW = this.historyContent.getComponent(UITransform)!.width;
    const viewportH =
      this.historyScrollView!.node.getComponent(UITransform)!.height;
    const rowH = 58;

    if (history.length === 0) {
      this.historyContent
        .getComponent(UITransform)!
        .setContentSize(viewportW, viewportH);
      const empty = addLabel(
        this.historyContent,
        'Empty',
        '暂无积分记录',
        18,
        UiTheme.creamSoft,
        viewportW,
        44,
      );
      empty.node.setPosition(0, -40, 0);
      return;
    }

    this.historyContent
      .getComponent(UITransform)!
      .setContentSize(viewportW, Math.max(viewportH, history.length * rowH));

    for (let i = 0; i < history.length; i++) {
      const entry = history[i];
      let rowState = this.historyRows.get(entry.id);
      if (!rowState) {
        rowState = this.createHistoryRow(
          this.historyContent,
          entry,
          viewportW - 4,
          rowH - 8,
        );
        this.historyRows.set(entry.id, rowState);
      }
      rowState.node.setPosition(0, -i * rowH - rowH * 0.5, 0);
      this.refreshHistoryRow(rowState, entry);
    }
  }

  private createHistoryRow(
    parent: Node,
    entry: ScoreHistoryEntry,
    w: number,
    h: number,
  ): HistoryRowState {
    const row = addNode(parent, `History_${entry.id}`, w, h);
    const rowBg = addNode(row, 'Bg', w, h);

    const amount = addLabel(row, 'Amount', '', 20, UiTheme.honey, 86, 34);
    amount.horizontalAlign = Label.HorizontalAlign.LEFT;
    amount.node.setPosition(-w * 0.5 + 56, 0, 0);

    const reason = addLabel(
      row,
      'Reason',
      entry.reason,
      15,
      UiTheme.cream,
      w - 180,
      34,
    );
    reason.horizontalAlign = Label.HorizontalAlign.LEFT;
    reason.node.setPosition(58, 0, 0);

    const time = addLabel(
      row,
      'Time',
      formatTimeAgo(entry.createdAt),
      12,
      UiTheme.creamSoft,
      80,
      20,
    );
    time.horizontalAlign = Label.HorizontalAlign.RIGHT;
    time.node.setPosition(w * 0.5 - 40, -15, 0);

    return {
      node: row,
      amountLabel: amount,
      reasonLabel: reason,
      timeLabel: time,
    };
  }

  private refreshHistoryRow(
    state: HistoryRowState,
    entry: ScoreHistoryEntry,
  ): void {
    const sign = entry.type === 'earn' ? '+' : '-';
    const amountColor =
      entry.type === 'earn' ? UiTheme.honey : new Color(255, 145, 130, 255);
    state.amountLabel.string = `${sign}${entry.amount}`;
    state.amountLabel.color = amountColor;
    state.reasonLabel.string = entry.reason;
    state.timeLabel.string = formatTimeAgo(entry.createdAt);
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

  private addSectionTitle(
    panel: Node,
    titleText: string,
    subText: string,
  ): void {
    const title = addLabel(
      panel,
      'SectionTitle',
      titleText,
      22,
      UiTheme.cream,
      220,
      34,
    );
    title.horizontalAlign = Label.HorizontalAlign.LEFT;
    title.node.setPosition(
      -panel.getComponent(UITransform)!.width * 0.5 + 130,
      panel.getComponent(UITransform)!.height * 0.5 - 34,
      0,
    );

    const sub = addLabel(
      panel,
      'SectionSub',
      subText,
      14,
      UiTheme.creamSoft,
      260,
      24,
    );
    sub.horizontalAlign = Label.HorizontalAlign.LEFT;
    sub.node.setPosition(
      -panel.getComponent(UITransform)!.width * 0.5 + 150,
      panel.getComponent(UITransform)!.height * 0.5 - 62,
      0,
    );
  }

  private addScrollArea(
    parent: Node,
    name: string,
    w: number,
    h: number,
    y: number,
  ): { root: Node; content: Node; scrollView: ScrollView } {
    const root = addNode(parent, name, w, h);
    root.setPosition(0, y, 0);

    const viewNode = addNode(root, 'view', w, h);
    viewNode.addComponent(Mask);

    const content = addNode(viewNode, 'Content', w, h);
    content.getComponent(UITransform)!.setAnchorPoint(0.5, 1);
    content.setPosition(0, h * 0.5, 0);

    const scrollView = root.addComponent(ScrollView);
    scrollView.content = content;
    scrollView.vertical = true;
    scrollView.horizontal = false;
    scrollView.inertia = true;
    scrollView.brake = 0.75;

    const track = addNode(root, 'ScrollTrack', 4, h - 14);
    track.setPosition(w * 0.5 - 8, 0, 0);
    const trackG = track.addComponent(Graphics);
    trackG.fillColor = new Color(UiTheme.cream.r, UiTheme.cream.g, UiTheme.cream.b, 40);
    trackG.roundRect(-2, -(h - 14) * 0.5, 4, h - 14, 2);
    trackG.fill();

    const thumb = addNode(root, 'ScrollThumb', 6, 36);
    thumb.setPosition(w * 0.5 - 8, 0, 0);
    const thumbGraphics = thumb.addComponent(Graphics);
    const area: ScrollAreaState = {
      scrollView,
      content,
      viewportHeight: h,
      track,
      thumb,
      thumbGraphics,
    };
    this.scrollAreas.push(area);
    this.updateScrollThumb(area);

    return { root, content, scrollView };
  }

  private updateScrollThumb(area: ScrollAreaState): void {
    const contentH = area.content.getComponent(UITransform)!.height;
    const viewportH = Math.max(1, area.viewportHeight);
    const trackH = Math.max(1, viewportH - 14);
    const overflow = Math.max(0, contentH - viewportH);

    area.thumb.active = overflow > 1;
    area.track.active = overflow > 1;
    if (overflow <= 1) return;

    const offset = (area.scrollView as unknown as {
      getScrollOffset?: () => { x: number; y: number };
    }).getScrollOffset?.();
    const progress = Math.max(0, Math.min(1, (offset?.y ?? 0) / overflow));
    const thumbH = Math.max(28, trackH * (viewportH / contentH));
    const thumbY = trackH * 0.5 - thumbH * 0.5 - progress * (trackH - thumbH);

    area.thumb.getComponent(UITransform)!.setContentSize(6, thumbH);
    area.thumb.setPosition(area.thumb.position.x, thumbY, 0);
    area.thumbGraphics.clear();
    area.thumbGraphics.fillColor = new Color(UiTheme.honey.r, UiTheme.honey.g, UiTheme.honey.b, 170);
    area.thumbGraphics.roundRect(-3, -thumbH * 0.5, 6, thumbH, 3);
    area.thumbGraphics.fill();
  }

  private addStatPill(
    parent: Node,
    text: string,
    x: number,
    width = 210,
  ): Node {
    const h = 46;
    const pill = addNode(parent, `Pill_${text}`, width, h);
    // 与积分卡片主行（详情按钮）共用同一纵向锚点，避免卡片加高后 pill 仍贴在卡片中线。
    pill.setPosition(x, SCORE_CARD_MAIN_ROW_Y, 0);
    paintRoundRect(
      pill.addComponent(Graphics),
      width,
      h,
      new Color(255, 255, 255, 24),
      h * 0.5,
    );
    const labelW = Math.max(80, width - 20);
    const label = addLabel(pill, 'Text', text, 17, UiTheme.cream, labelW, 34);
    label.overflow = Label.Overflow.SHRINK;
    return pill;
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
    const g =
      this.bgNode.getComponent(Graphics) ?? this.bgNode.addComponent(Graphics);
    g.clear();
    g.fillColor = UiTheme.bgFallback;
    g.rect(-vs.width * 0.5, -vs.height * 0.5, vs.width, vs.height);
    g.fill();

    g.fillColor = new Color(
      UiTheme.mossPanel.r,
      UiTheme.mossPanel.g,
      UiTheme.mossPanel.b,
      85,
    );
    g.circle(-vs.width * 0.36, vs.height * 0.32, 160);
    g.fill();
    g.fillColor = new Color(
      UiTheme.honey.r,
      UiTheme.honey.g,
      UiTheme.honey.b,
      36,
    );
    g.circle(vs.width * 0.34, -vs.height * 0.28, 210);
    g.fill();
  }
}
