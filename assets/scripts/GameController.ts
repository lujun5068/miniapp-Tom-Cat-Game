/**
 * 使用方式：在 Creator 中打开/新建场景 → 选中 Canvas 节点 → 添加组件「GameController」→ 保存场景 → 运行预览。
 * 音频：在 Inspector 中为 `clipBgmMain` / `clipLevelStart` / `clipSfx*` 指定 **AudioClip**（可由 **`.m4a`**、`.mp3` 等导入；与网页版 `gameAudio.ts` 语义一一对应即可）。顶栏音乐/音效开关与关卡存档经 `storage/platformKv` 写入：微信小游戏构建下走 **`wx.setStorageSync`**，其余平台走 **`sys.localStorage`**（键名与网页版一致）。上微信真机前请确认目标机型对 `.m4a` 的解码支持，必要时改用 **mp3** 等再绑定。
 * 贴图（可选）：`sfMapFloor` 有值即可用精灵铺地板；`sfMapEdge` / `sfMapStone1` / `sfMapStone2` 可逐项补全，未绑定的障碍格仍用 `BoardView` 色块叠在地板上。四张齐全时与网页 `mapTileTextures` 一致为纯精灵。`mapTileScaleFloor` / `Edge` / `Stone` 控制各层贴图相对单格缩放（默认 1 与格等大）。`sfCat` / `sfMouse` 为单帧占位；`sfMouseVertical` 为纵向移动时老鼠贴图（可空则与横向共用并沿用翻转）；`mouseSpriteScale` 控制老鼠精灵相对默认显示尺寸（如 1.5）。`sfUiBg` 为全屏底图，缺省用 `UiTheme.bgFallback` 色块。
 */
import {
  _decorator,
  AudioClip,
  BlockInputEvents,
  Button,
  Color,
  Component,
  EventKeyboard,
  EventTouch,
  Graphics,
  Input,
  KeyCode,
  Label,
  Layout,
  Node,
  Sprite,
  SpriteFrame,
  UITransform,
  Vec3,
  Widget,
  input,
  view,
} from 'cc';
import { CocosGameAudio } from './audio/CocosGameAudio';
import { BoardView } from './BoardView';
import { BASE_TILE_PX } from './GameConstants';
import { MAX_LEVELS } from './game/levelMeta';
import {
  getEffectiveMaxUnlockedLevel,
  saveProgressToDisk,
} from './game/progress';
import { GameSimulation, DEFAULT_LEVEL_TIME_SEC } from './game/simulation';
import { gameSession } from './game/sessionState';
import { loadLevelSave } from './storage/levelSave';
import type { MapTileSpriteFrames } from './render/MapTileSpriteFrames';
import { CatMotionAnimator } from './visual/CatMotionAnimator';
import {
  MODAL_END_PANEL_HEIGHT,
  MODAL_LEVELS_PANEL_HEIGHT,
  MODAL_LEVELS_PANEL_WIDTH,
  MODAL_PANEL_CORNER_RADIUS,
  MODAL_PANEL_WIDTH,
  UiTheme,
} from './ui/UiTheme';
import { getSafeAreaInsets } from './ui/safeArea';

const { ccclass, property } = _decorator;

const JOY_SCALE = 1.5;
const JOY_PANEL_SIZE = Math.round(140 * JOY_SCALE);
const JOY_KNOB_SIZE = Math.round(56 * JOY_SCALE);
const JOY_RETURN_DEAD_PX = Math.round(16 * JOY_SCALE);
const JOY_DELTA_THRESH_PX = 5.7 * JOY_SCALE;

/** 跳跃 / 攻击圆形按钮相对原 72px 的缩放 */
const ACTION_BTN_SCALE = 2;

/** 左右侧栏宽度（音乐/音效 | 开始/下一关等） */
const SIDE_RAIL_W = 128;
/** 中间列顶部边距（其下为棋盘区；原顶部双行 HUD 已移至棋盘左右） */
const CENTER_TOP_MARGIN = 10;
/** 原操作提示行高度，现作为棋盘挂载区底边距，避免贴底控件与棋盘重叠 */
const BOARD_AREA_BOTTOM_PAD = 10;

/** 摇杆、触摸操作区与屏幕角（再与安全区叠加） */
const UI_EDGE_PAD = 18;
/** 弹窗等与屏幕左右的留白（与侧栏独立） */
const LAYOUT_H_PAD = 24;

type MoveIntent = { x: number; y: number };

type LabelButtonOpts = {
  /** 圆角半径；缺省按高度自适应 */
  cornerRadius?: number;
  /** 不透明填充色；缺省为顶栏按钮绿底 */
  fill?: Color;
  /** 文字字号；缺省 18 */
  fontSize?: number;
  /** 描边色；缺省为弹窗主按钮描边色 */
  strokeColor?: Color;
  /** 描边宽度；缺省与弹窗主按钮一致 */
  strokeWidth?: number;
};

function paintLabelButtonBg(
  g: Graphics,
  w: number,
  h: number,
  cornerRadius: number,
  fill: Color,
  strokeColor?: Color,
  strokeWidth?: number,
): void {
  g.clear();
  g.fillColor = fill;
  g.roundRect(-w * 0.5, -h * 0.5, w, h, cornerRadius);
  g.fill();
  g.lineWidth = strokeWidth ?? UiTheme.modalBtnStrokeWidth;
  g.strokeColor = strokeColor ?? UiTheme.modalBtnStroke;
  g.roundRect(-w * 0.5, -h * 0.5, w, h, cornerRadius);
  g.stroke();
}

function defaultBtnCornerRadius(w: number, h: number): number {
  return Math.min(12, Math.max(6, Math.floor(Math.min(w, h) * 0.22)));
}

function paintModalBackdrop(g: Graphics, w: number, h: number): void {
  g.clear();
  g.fillColor = UiTheme.modalBackdrop;
  g.rect(-w * 0.5, -h * 0.5, w, h);
  g.fill();
}

function paintModalPanelBg(
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

function paintModalPanelBorder(
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

function mapLinesForPlay(): string[] | null {
  const s = loadLevelSave();
  return s.lastMapLines && s.lastMapLines.length > 0 ? s.lastMapLines : null;
}

function resolveMoveIntent(
  keys: Set<KeyCode>,
  intent: MoveIntent,
): { dx: number; dy: number } {
  const mag = Math.hypot(intent.x, intent.y);
  if (mag > 1e-4) {
    /* Cocos UI 本地坐标 Y 轴向上；网页版曾对 intent.y 取反以适配屏幕坐标 Y 向下 */
    const a = Math.atan2(intent.y, intent.x);
    if (a >= -Math.PI / 4 && a < Math.PI / 4) {
      return { dx: 1, dy: 0 };
    }
    if (a >= Math.PI / 4 && a < (3 * Math.PI) / 4) {
      return { dx: 0, dy: -1 };
    }
    if (a >= (3 * Math.PI) / 4 || a < (-3 * Math.PI) / 4) {
      return { dx: -1, dy: 0 };
    }
    return { dx: 0, dy: 1 };
  }
  let dx = 0;
  let dy = 0;
  if (keys.has(KeyCode.KEY_A) || keys.has(KeyCode.ARROW_LEFT)) dx -= 1;
  if (keys.has(KeyCode.KEY_D) || keys.has(KeyCode.ARROW_RIGHT)) dx += 1;
  if (keys.has(KeyCode.KEY_W) || keys.has(KeyCode.ARROW_UP)) dy -= 1;
  if (keys.has(KeyCode.KEY_S) || keys.has(KeyCode.ARROW_DOWN)) dy += 1;
  if (dx !== 0 && dy !== 0) {
    if (Math.abs(dx) > Math.abs(dy)) dy = 0;
    else dx = 0;
  }
  return { dx, dy };
}

function makeLabelButton(
  text: string,
  w: number,
  h: number,
  opts?: LabelButtonOpts,
): Node {
  const corner = opts?.cornerRadius ?? defaultBtnCornerRadius(w, h);
  const fill =
    opts?.fill ??
    new Color(
      UiTheme.mossPanel.r,
      UiTheme.mossPanel.g,
      UiTheme.mossPanel.b,
      255,
    );

  const n = new Node(text);
  const ut = n.addComponent(UITransform);
  ut.setContentSize(w, h);

  const bg = new Node('BtnBg');
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
  labNd.addComponent(UITransform).setContentSize(w, h);
  const label = labNd.addComponent(Label);
  label.string = text;
  label.fontSize = opts?.fontSize ?? 18;
  label.lineHeight = 20;
  label.color = UiTheme.cream;
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

@ccclass('GameController')
export class GameController extends Component {
  @property({ type: AudioClip, tooltip: '主循环 BGM' })
  clipBgmMain: AudioClip | null = null;

  @property({ type: AudioClip, tooltip: '关卡开始' })
  clipLevelStart: AudioClip | null = null;

  @property({ type: AudioClip, tooltip: '跳跃' })
  clipSfxJump: AudioClip | null = null;

  @property({ type: AudioClip, tooltip: '扑击' })
  clipSfxAttack: AudioClip | null = null;

  @property({ type: AudioClip, tooltip: '抓到老鼠' })
  clipSfxCatch: AudioClip | null = null;

  @property({ type: AudioClip, tooltip: '眩晕' })
  clipSfxStun: AudioClip | null = null;

  @property({ type: AudioClip, tooltip: '胜利' })
  clipSfxWin: AudioClip | null = null;

  @property({ type: AudioClip, tooltip: '失败' })
  clipSfxLose: AudioClip | null = null;

  @property({ type: AudioClip, tooltip: 'UI 按钮 / 倒计时滴答' })
  clipSfxUi: AudioClip | null = null;

  @property({
    type: SpriteFrame,
    tooltip:
      '地图地板（与网页 grass2 一致）；有值即用精灵铺格，未绑 edge/石头时障碍仍用色块',
  })
  sfMapFloor: SpriteFrame | null = null;

  @property({
    type: SpriteFrame,
    tooltip: '地图外圈障碍贴图（可空则外圈障碍用色块）',
  })
  sfMapEdge: SpriteFrame | null = null;

  @property({ type: SpriteFrame, tooltip: '内障碍石纹 1（可空）' })
  sfMapStone1: SpriteFrame | null = null;

  @property({ type: SpriteFrame, tooltip: '内障碍石纹 2（可空）' })
  sfMapStone2: SpriteFrame | null = null;

  @property({ type: SpriteFrame, tooltip: '猫单帧（可空则圆点）' })
  sfCat: SpriteFrame | null = null;

  @property({ type: SpriteFrame, tooltip: '老鼠单帧（可空则小圆）' })
  sfMouse: SpriteFrame | null = null;

  @property({
    type: SpriteFrame,
    tooltip: '老鼠纵向移动贴图（可空则与 sfMouse 共用，仍按位移做 Y 翻转）',
  })
  sfMouseVertical: SpriteFrame | null = null;

  @property({
    tooltip: '老鼠精灵显示相对默认尺寸的缩放（如 1.5 即放大 1.5 倍）',
  })
  mouseSpriteScale = 1.5;

  @property({ type: SpriteFrame, tooltip: '全屏 UI 底图（可空则用主题色块）' })
  sfUiBg: SpriteFrame | null = null;

  @property({
    tooltip:
      '地图地板贴图相对单格边长的缩放，1=与格等大；>1 以格心放大（见 BoardView.configureMapTileScales）',
  })
  mapTileScaleFloor = 1;

  @property({
    tooltip: '外圈障碍贴图相对单格边长的缩放，1=与格等大',
  })
  mapTileScaleEdge = 1;

  @property({
    tooltip: '内圈石头贴图相对单格边长的缩放，1=与格等大',
  })
  mapTileScaleStone = 1;

  private gameAudio!: CocosGameAudio;
  private anim!: CatMotionAnimator;
  private boardView!: BoardView;
  private boardRoot!: Node;

  private levelStripLabel!: Label;
  private countdownStripLabel!: Label;
  private hudTimeStrip!: Node;
  private hudLevelStrip!: Node;
  private runBtn!: Button;
  private runBtnLabel!: Label;
  private nextBtn!: Button;
  private nextBtnLabel!: Label;

  private bgmTopLabel!: Label;
  private sfxTopLabel!: Label;

  private modalRoot!: Node;
  private modalTitle!: Label;
  private modalSub!: Label;
  private modalBtnNext!: Button;
  private modalBtnReplay!: Button;

  private levelsModalRoot!: Node;
  private levelPickNodes: Node[] = [];

  private joyPanel!: Node;
  private joyKnob!: Node;

  private gameRunning = false;
  private endModalShown = false;
  private intent: MoveIntent = { x: 0, y: 0 };
  private readonly keys = new Set<KeyCode>();
  private joyActive = false;
  private joyPrevLx = 0;
  private joyPrevLy = 0;
  private joySpillLx = 0;
  private joySpillLy = 0;
  private screenBgNode: Node | null = null;
  private gameRoot!: Node;
  private touchUiRoot!: Node;
  private leftRailWidget!: Widget;
  private rightRailWidget!: Widget;
  private centerColumnWidget!: Widget;
  private boardMount!: Node;
  private joyWidget!: Widget;
  private touchActionsWidget!: Widget;
  private hudDiskBestForLevel = 0;
  private lastLevelHudLine = '';
  private lastCountdownHudLine = '';
  private pendingLevelStartSfx = false;
  private countdownLastCeil = Math.ceil(DEFAULT_LEVEL_TIME_SEC);
  private prevWantBgm = false;

  private sim!: GameSimulation;

  onLoad(): void {
    gameSession.initFromDisk();
    this.sim = new GameSimulation();
    const s = loadLevelSave();
    const startLv = Math.min(
      MAX_LEVELS,
      Math.max(1, Math.min(s.lastPlayedLevel, gameSession.maxUnlocked)),
    );
    this.resetLevelWithPolicy(startLv, mapLinesForPlay(), true);
    this.anim = new CatMotionAnimator(
      this.sim.catX,
      this.sim.catY,
      this.sim.grid.width,
      this.sim.grid.height,
      BASE_TILE_PX,
    );

    const audioHost = new Node('AudioHost');
    this.node.addChild(audioHost);
    this.gameAudio = new CocosGameAudio(audioHost, {
      bgmMain: this.clipBgmMain,
      levelStart: this.clipLevelStart,
      sfxJump: this.clipSfxJump,
      sfxAttack: this.clipSfxAttack,
      sfxCatch: this.clipSfxCatch,
      sfxStun: this.clipSfxStun,
      sfxWin: this.clipSfxWin,
      sfxLose: this.clipSfxLose,
      sfxUi: this.clipSfxUi,
    });
    this.sim.setSoundHooks({
      onLevelStart: () => this.gameAudio.playLevelStart(),
      onStun: () => this.gameAudio.playStun(),
      onJumpSuccess: () => this.gameAudio.playJump(),
      onAttackSuccess: () => this.gameAudio.playAttack(),
      onCatch: () => this.gameAudio.playCatch(),
    });
    this.prevWantBgm = this.gameRunning && this.sim.gameEnd === 'none';
    this.node.once(Node.EventType.TOUCH_END, this.onFirstUserAudio, this);
    input.once(Input.EventType.KEY_DOWN, this.onFirstUserAudio, this);

    this.buildUi();
    this.syncAudioTopLabels();
    this.layoutScreen();
    view.on('canvas-resize', this.layoutScreen, this);
    input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    input.on(Input.EventType.KEY_UP, this.onKeyUp, this);
  }

  onDestroy(): void {
    view.off('canvas-resize', this.layoutScreen, this);
    input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    input.off(Input.EventType.KEY_UP, this.onKeyUp, this);
  }

  private buildUi(): void {
    const root = this.node;

    const gameRoot = new Node('GameRoot');
    this.gameRoot = gameRoot;
    const grUt = gameRoot.addComponent(UITransform);
    grUt.setContentSize(view.getVisibleSize());
    const grW = gameRoot.addComponent(Widget);
    grW.isAlignTop =
      grW.isAlignBottom =
      grW.isAlignLeft =
      grW.isAlignRight =
        true;
    grW.top = grW.bottom = grW.left = grW.right = 0;
    root.addChild(gameRoot);

    this.buildScreenBackground(gameRoot);

    const leftRail = new Node('LeftRail');
    const lrUt = leftRail.addComponent(UITransform);
    lrUt.setContentSize(SIDE_RAIL_W, view.getVisibleSize().height);
    const lrWg = leftRail.addComponent(Widget);
    lrWg.isAlignLeft = lrWg.isAlignTop = lrWg.isAlignBottom = true;
    lrWg.left = 0;
    lrWg.top = CENTER_TOP_MARGIN;
    lrWg.bottom = 0;
    this.leftRailWidget = lrWg;
    const lrLay = leftRail.addComponent(Layout);
    lrLay.type = Layout.Type.VERTICAL;
    lrLay.resizeMode = Layout.ResizeMode.NONE;
    lrLay.verticalDirection = Layout.VerticalDirection.TOP_TO_BOTTOM;
    lrLay.spacingY = 8;
    lrLay.paddingTop = lrLay.paddingBottom = 10;
    lrLay.paddingLeft = 8;
    gameRoot.addChild(leftRail);

    leftRail.addChild(
      this.wrapBtn(makeLabelButton('音乐·开', 100, 44), () => {
        this.gameAudio.playUi();
        this.toggleBgm();
      }),
    );
    const bgmN = leftRail.children[0];
    this.bgmTopLabel = bgmN.getComponentInChildren(Label)!;

    leftRail.addChild(
      this.wrapBtn(makeLabelButton('音效·开', 100, 44), () => {
        this.gameAudio.playUi();
        this.toggleSfx();
      }),
    );
    const sfxN = leftRail.children[1];
    this.sfxTopLabel = sfxN.getComponentInChildren(Label)!;

    const rightRail = new Node('RightRail');
    const rrUt = rightRail.addComponent(UITransform);
    rrUt.setContentSize(SIDE_RAIL_W, view.getVisibleSize().height);
    const rrWg = rightRail.addComponent(Widget);
    rrWg.isAlignRight = rrWg.isAlignTop = rrWg.isAlignBottom = true;
    rrWg.right = 0;
    rrWg.top = CENTER_TOP_MARGIN;
    rrWg.bottom = 0;
    this.rightRailWidget = rrWg;
    const rrLay = rightRail.addComponent(Layout);
    rrLay.type = Layout.Type.VERTICAL;
    rrLay.resizeMode = Layout.ResizeMode.NONE;
    rrLay.verticalDirection = Layout.VerticalDirection.TOP_TO_BOTTOM;
    rrLay.spacingY = 8;
    rrLay.paddingTop = rrLay.paddingBottom = 10;
    rrLay.paddingRight = 8;
    gameRoot.addChild(rightRail);

    rightRail.addChild(
      this.wrapBtn(makeLabelButton('开始', 100, 44), () => this.toggleRun()),
    );
    const runN = rightRail.children[0];
    this.runBtn = runN.getComponent(Button)!;
    this.runBtnLabel = runN.getComponentInChildren(Label)!;

    rightRail.addChild(
      this.wrapBtn(makeLabelButton('下一关', 100, 44), () =>
        this.onClickNextLevel(),
      ),
    );
    const nextN = rightRail.children[1];
    this.nextBtn = nextN.getComponent(Button)!;
    this.nextBtnLabel = nextN.getComponentInChildren(Label)!;

    rightRail.addChild(
      this.wrapBtn(makeLabelButton('全部关卡', 120, 44), () =>
        this.openLevelsModal(),
      ),
    );

    const centerCol = new Node('CenterColumn');
    const ccUt = centerCol.addComponent(UITransform);
    ccUt.setContentSize(
      Math.max(1, view.getVisibleSize().width - SIDE_RAIL_W * 2),
      view.getVisibleSize().height,
    );
    const ccWg = centerCol.addComponent(Widget);
    ccWg.isAlignTop = ccWg.isAlignBottom = true;
    ccWg.isAlignHorizontalCenter = true;
    ccWg.left = ccWg.right = SIDE_RAIL_W;
    ccWg.top = ccWg.bottom = 0;
    this.centerColumnWidget = ccWg;
    gameRoot.addChild(centerCol);

    this.boardMount = new Node('BoardMount');
    const bmUt = this.boardMount.addComponent(UITransform);
    bmUt.setContentSize(
      ccUt.width,
      Math.max(1, ccUt.height - CENTER_TOP_MARGIN - BOARD_AREA_BOTTOM_PAD),
    );
    const bmWg = this.boardMount.addComponent(Widget);
    bmWg.isAlignTop =
      bmWg.isAlignBottom =
      bmWg.isAlignLeft =
      bmWg.isAlignRight =
        true;
    bmWg.top = CENTER_TOP_MARGIN;
    bmWg.left = bmWg.right = 0;
    bmWg.bottom = BOARD_AREA_BOTTOM_PAD;
    centerCol.addChild(this.boardMount);

    this.boardRoot = new Node('BoardRoot');
    const brUt = this.boardRoot.addComponent(UITransform);
    brUt.setAnchorPoint(0.5, 0.5);
    this.boardMount.addChild(this.boardRoot);
    this.boardView = this.boardRoot.addComponent(BoardView);
    this.boardView.tileSize = BASE_TILE_PX;
    const mapFrames: Partial<MapTileSpriteFrames> = {};
    if (this.sfMapFloor) mapFrames.floor = this.sfMapFloor;
    if (this.sfMapEdge) mapFrames.edge = this.sfMapEdge;
    if (this.sfMapStone1) mapFrames.stone1 = this.sfMapStone1;
    if (this.sfMapStone2) mapFrames.stone2 = this.sfMapStone2;
    this.boardView.configureSprites(
      Object.keys(mapFrames).length > 0 ? mapFrames : {},
      this.sfCat,
      this.sfMouse,
    );
    this.boardView.setMouseVisualOptions({
      verticalFrame: this.sfMouseVertical,
      displayScale: this.mouseSpriteScale,
    });
    this.boardView.configureMapTileScales({
      floor: this.mapTileScaleFloor,
      edge: this.mapTileScaleEdge,
      stone: this.mapTileScaleStone,
    });

    const hudStripW = this.hudStripWidthFor(ccUt.width);
    const hudStripH = 160;
    this.hudTimeStrip = new Node('HudTime');
    const htUt = this.hudTimeStrip.addComponent(UITransform);
    htUt.setAnchorPoint(0, 0.5);
    htUt.setContentSize(hudStripW, hudStripH);
    const htWg = this.hudTimeStrip.addComponent(Widget);
    htWg.isAlignLeft = true;
    htWg.isAlignVerticalCenter = true;
    htWg.left = 8;
    this.countdownStripLabel = this.hudTimeStrip.addComponent(Label);
    this.countdownStripLabel.string = '';
    this.countdownStripLabel.fontSize = 20;
    this.countdownStripLabel.lineHeight = 24;
    this.countdownStripLabel.color = UiTheme.honey;
    this.countdownStripLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
    this.countdownStripLabel.verticalAlign = Label.VerticalAlign.CENTER;
    this.countdownStripLabel.overflow = Label.Overflow.RESIZE_HEIGHT;
    this.boardMount.addChild(this.hudTimeStrip);

    this.hudLevelStrip = new Node('HudLevel');
    const hlUt = this.hudLevelStrip.addComponent(UITransform);
    hlUt.setAnchorPoint(1, 0.5);
    hlUt.setContentSize(hudStripW, hudStripH);
    const hlWg = this.hudLevelStrip.addComponent(Widget);
    hlWg.isAlignRight = true;
    hlWg.isAlignVerticalCenter = true;
    hlWg.right = 8;
    this.levelStripLabel = this.hudLevelStrip.addComponent(Label);
    this.levelStripLabel.string = '';
    this.levelStripLabel.fontSize = 18;
    this.levelStripLabel.lineHeight = 22;
    this.levelStripLabel.color = UiTheme.cream;
    this.levelStripLabel.horizontalAlign = Label.HorizontalAlign.RIGHT;
    this.levelStripLabel.verticalAlign = Label.VerticalAlign.CENTER;
    this.levelStripLabel.overflow = Label.Overflow.RESIZE_HEIGHT;
    this.boardMount.addChild(this.hudLevelStrip);

    centerCol.removeFromParent();
    leftRail.removeFromParent();
    rightRail.removeFromParent();
    gameRoot.insertChild(centerCol, 1);
    gameRoot.addChild(leftRail);
    gameRoot.addChild(rightRail);

    this.buildTouchUi(gameRoot);
    this.buildEndModal(gameRoot);
    this.buildLevelsModal(gameRoot);

    this.refreshHudDiskBest();
    this.syncRunBtn();
    this.syncNextLevelUi();
    this.drawJoyChrome();
  }

  private wrapBtn(n: Node, cb: () => void): Node {
    const btn = n.getComponent(Button)!;
    n.on(Button.EventType.CLICK, cb, this);
    return n;
  }

  private buildTouchUi(parent: Node): void {
    const touchRoot = new Node('TouchUi');
    this.touchUiRoot = touchRoot;
    const trUt = touchRoot.addComponent(UITransform);
    trUt.setContentSize(view.getVisibleSize());
    const trW = touchRoot.addComponent(Widget);
    trW.isAlignTop =
      trW.isAlignBottom =
      trW.isAlignLeft =
      trW.isAlignRight =
        true;
    trW.top = trW.bottom = trW.left = trW.right = 0;
    parent.addChild(touchRoot);

    this.joyPanel = new Node('Joystick');
    const jpUt = this.joyPanel.addComponent(UITransform);
    jpUt.setContentSize(JOY_PANEL_SIZE, JOY_PANEL_SIZE);
    const jpW = this.joyPanel.addComponent(Widget);
    jpW.isAlignLeft = true;
    jpW.isAlignBottom = true;
    jpW.left = UI_EDGE_PAD;
    jpW.bottom = BOARD_AREA_BOTTOM_PAD;
    this.joyWidget = jpW;
    touchRoot.addChild(this.joyPanel);

    this.joyKnob = new Node('Knob');
    const knUt = this.joyKnob.addComponent(UITransform);
    knUt.setContentSize(JOY_KNOB_SIZE, JOY_KNOB_SIZE);
    this.joyPanel.addChild(this.joyKnob);

    this.joyPanel.on(Node.EventType.TOUCH_START, this.onJoyStart, this);
    this.joyPanel.on(Node.EventType.TOUCH_MOVE, this.onJoyMove, this);
    this.joyPanel.on(Node.EventType.TOUCH_END, this.onJoyEnd, this);
    this.joyPanel.on(Node.EventType.TOUCH_CANCEL, this.onJoyEnd, this);

    const circleD = Math.round(72 * ACTION_BTN_SCALE);
    const actionSpacing = Math.round(14 * ACTION_BTN_SCALE);
    const acWpx = Math.ceil(circleD * 1.05);
    const acHpx = circleD * 2 + actionSpacing;
    const actions = new Node('TouchActions');
    const acUt = actions.addComponent(UITransform);
    acUt.setContentSize(acWpx, acHpx);
    const acW = actions.addComponent(Widget);
    acW.isAlignRight = true;
    acW.isAlignBottom = true;
    acW.right = UI_EDGE_PAD;
    acW.bottom = BOARD_AREA_BOTTOM_PAD;
    this.touchActionsWidget = acW;
    const acLay = actions.addComponent(Layout);
    acLay.type = Layout.Type.VERTICAL;
    acLay.spacingY = actionSpacing;
    touchRoot.addChild(actions);

    const actionFill = new Color(
      UiTheme.mossBtn2.r,
      UiTheme.mossBtn2.g,
      UiTheme.mossBtn2.b,
      255,
    );
    const circleR = circleD * 0.5;
    const actionFont = Math.min(30, Math.round(15 * ACTION_BTN_SCALE));
    const jump = makeLabelButton('跳跃', circleD, circleD, {
      fill: actionFill,
      cornerRadius: circleR,
      fontSize: actionFont,
    });
    actions.addChild(this.wrapBtn(jump, () => this.onJump()));
    const atk = makeLabelButton('攻击', circleD, circleD, {
      fill: actionFill,
      cornerRadius: circleR,
      fontSize: actionFont,
    });
    actions.addChild(this.wrapBtn(atk, () => this.onAttack()));
  }

  private buildScreenBackground(gameRoot: Node): void {
    const bg = new Node('ScreenBg');
    const vs = view.getVisibleSize();
    const ut = bg.addComponent(UITransform);
    ut.setContentSize(vs.width, vs.height);
    const w = bg.addComponent(Widget);
    w.isAlignTop = w.isAlignBottom = w.isAlignLeft = w.isAlignRight = true;
    w.top = w.bottom = w.left = w.right = 0;
    if (this.sfUiBg) {
      const sp = bg.addComponent(Sprite);
      sp.spriteFrame = this.sfUiBg;
      sp.sizeMode = Sprite.SizeMode.CUSTOM;
    } else {
      const g = bg.addComponent(Graphics);
      g.fillColor = UiTheme.bgFallback;
      g.rect(-vs.width * 0.5, -vs.height * 0.5, vs.width, vs.height);
      g.fill();
    }
    gameRoot.insertChild(bg, 0);
    this.screenBgNode = bg;
  }

  private applySafeAreaInsets(): void {
    const sa = getSafeAreaInsets();
    this.leftRailWidget.left = sa.left;
    this.leftRailWidget.top = sa.top + CENTER_TOP_MARGIN;
    this.leftRailWidget.bottom = sa.bottom;
    this.rightRailWidget.right = sa.right;
    this.rightRailWidget.top = sa.top + CENTER_TOP_MARGIN;
    this.rightRailWidget.bottom = sa.bottom;
    this.centerColumnWidget.left = SIDE_RAIL_W + sa.left;
    this.centerColumnWidget.right = SIDE_RAIL_W + sa.right;
    this.centerColumnWidget.top = sa.top;
    this.centerColumnWidget.bottom = sa.bottom;
    this.joyWidget.left = UI_EDGE_PAD + sa.left;
    this.joyWidget.bottom = BOARD_AREA_BOTTOM_PAD + sa.bottom;
    this.touchActionsWidget.right = UI_EDGE_PAD + sa.right;
    this.touchActionsWidget.bottom = BOARD_AREA_BOTTOM_PAD + sa.bottom;
  }

  private layoutScreen(): void {
    const vs = view.getVisibleSize();
    this.gameRoot.getComponent(UITransform)!.setContentSize(vs);
    this.touchUiRoot.getComponent(UITransform)!.setContentSize(vs);
    if (this.modalRoot) {
      this.modalRoot.getComponent(UITransform)!.setContentSize(vs);
      const bd = this.modalRoot.getChildByName('Backdrop');
      if (bd) {
        bd.getComponent(UITransform)!.setContentSize(vs.width, vs.height);
        const bdG = bd.getComponent(Graphics);
        if (bdG) {
          paintModalBackdrop(bdG, vs.width, vs.height);
        }
      }
    }
    if (this.levelsModalRoot) {
      this.levelsModalRoot.getComponent(UITransform)!.setContentSize(vs);
      const lbd = this.levelsModalRoot.getChildByName('Backdrop');
      if (lbd) {
        lbd.getComponent(UITransform)!.setContentSize(vs.width, vs.height);
        const lbdG = lbd.getComponent(Graphics);
        if (lbdG) {
          paintModalBackdrop(lbdG, vs.width, vs.height);
        }
      }
    }
    if (this.screenBgNode) {
      const ut = this.screenBgNode.getComponent(UITransform)!;
      ut.setContentSize(vs.width, vs.height);
      if (this.screenBgNode.getComponent(Sprite)) {
        ut.setContentSize(vs.width, vs.height);
      }
      const g = this.screenBgNode.getComponent(Graphics);
      if (g) {
        g.clear();
        g.fillColor = UiTheme.bgFallback;
        g.rect(-vs.width * 0.5, -vs.height * 0.5, vs.width, vs.height);
        g.fill();
      }
    }
    this.applySafeAreaInsets();
    this.layoutBoard();
    const lrLayComp = this.leftRailWidget.node.getComponent(Layout);
    lrLayComp?.updateLayout(true);
    const rrLayComp = this.rightRailWidget.node.getComponent(Layout);
    rrLayComp?.updateLayout(true);
  }

  private buildEndModal(parent: Node): void {
    this.modalRoot = new Node('EndModal');
    this.modalRoot.active = false;
    const mrUt = this.modalRoot.addComponent(UITransform);
    mrUt.setContentSize(view.getVisibleSize());
    const mrW = this.modalRoot.addComponent(Widget);
    mrW.isAlignTop =
      mrW.isAlignBottom =
      mrW.isAlignLeft =
      mrW.isAlignRight =
        true;
    mrW.top = mrW.bottom = mrW.left = mrW.right = 0;
    this.modalRoot.addComponent(BlockInputEvents);
    parent.addChild(this.modalRoot);

    const backdrop = new Node('Backdrop');
    const bdUt = backdrop.addComponent(UITransform);
    bdUt.setContentSize(view.getVisibleSize());
    const bdW = backdrop.addComponent(Widget);
    bdW.isAlignTop =
      bdW.isAlignBottom =
      bdW.isAlignLeft =
      bdW.isAlignRight =
        true;
    bdW.top = bdW.bottom = bdW.left = bdW.right = 0;
    const bdG = backdrop.addComponent(Graphics);
    const vs0 = view.getVisibleSize();
    paintModalBackdrop(bdG, vs0.width, vs0.height);
    this.modalRoot.addChild(backdrop);

    const panel = new Node('Panel');
    const pUt = panel.addComponent(UITransform);
    pUt.setContentSize(MODAL_PANEL_WIDTH, MODAL_END_PANEL_HEIGHT);
    const pW = panel.addComponent(Widget);
    pW.isAlignHorizontalCenter = true;
    pW.isAlignVerticalCenter = true;
    this.modalRoot.addChild(panel);

    const panelBgNode = new Node('PanelBg');
    const pbgUt = panelBgNode.addComponent(UITransform);
    pbgUt.setContentSize(MODAL_PANEL_WIDTH, MODAL_END_PANEL_HEIGHT);
    const pbgG = panelBgNode.addComponent(Graphics);
    paintModalPanelBg(
      pbgG,
      MODAL_PANEL_WIDTH,
      MODAL_END_PANEL_HEIGHT,
      MODAL_PANEL_CORNER_RADIUS,
    );
    panel.addChild(panelBgNode);

    const panelBorderNode = new Node('PanelBorder');
    panelBorderNode
      .addComponent(UITransform)
      .setContentSize(MODAL_PANEL_WIDTH, MODAL_END_PANEL_HEIGHT);
    const pbdG = panelBorderNode.addComponent(Graphics);
    paintModalPanelBorder(
      pbdG,
      MODAL_PANEL_WIDTH,
      MODAL_END_PANEL_HEIGHT,
      MODAL_PANEL_CORNER_RADIUS,
    );
    panel.addChild(panelBorderNode);

    this.modalTitle = this.addCenterLabel(
      panel,
      'Title',
      26,
      UiTheme.cream,
      28,
    );
    this.modalSub = this.addCenterLabel(
      panel,
      'Sub',
      18,
      UiTheme.creamSoft,
      76,
    );

    const modalFill = new Color(
      UiTheme.modalActionBtnFill.r,
      UiTheme.modalActionBtnFill.g,
      UiTheme.modalActionBtnFill.b,
      255,
    );
    const row = new Node('Actions');
    const rUt = row.addComponent(UITransform);
    rUt.setContentSize(360, 52);
    const rLay = row.addComponent(Layout);
    rLay.type = Layout.Type.HORIZONTAL;
    rLay.spacingX = 16;
    const rw = row.addComponent(Widget);
    rw.isAlignBottom = true;
    rw.isAlignHorizontalCenter = true;
    rw.bottom = 24;
    panel.addChild(row);

    const replay = makeLabelButton('重玩', 160, 48, {
      fill: modalFill,
      fontSize: 20,
    });
    row.addChild(this.wrapBtn(replay, () => this.onModalReplay()));
    const next = makeLabelButton('下一关', 160, 48, {
      fill: modalFill,
      fontSize: 20,
    });
    row.addChild(this.wrapBtn(next, () => this.onModalNext()));
    this.modalBtnReplay = replay.getComponent(Button)!;
    this.modalBtnNext = next.getComponent(Button)!;

    const close = makeLabelButton('×', 48, 48, {
      fill: modalFill,
      cornerRadius: 24,
      fontSize: 22,
    });
    const cW = close.addComponent(Widget);
    cW.isAlignTop = true;
    cW.isAlignRight = true;
    cW.top = 10;
    cW.right = 10;
    panel.addChild(close);
    close.on(Button.EventType.CLICK, () => this.onResultModalCloseX(), this);
  }

  private buildLevelsModal(parent: Node): void {
    this.levelsModalRoot = new Node('LevelsModal');
    this.levelsModalRoot.active = false;
    const vs = view.getVisibleSize();
    const lrUt = this.levelsModalRoot.addComponent(UITransform);
    lrUt.setContentSize(vs);
    const lrW = this.levelsModalRoot.addComponent(Widget);
    lrW.isAlignTop =
      lrW.isAlignBottom =
      lrW.isAlignLeft =
      lrW.isAlignRight =
        true;
    lrW.top = lrW.bottom = lrW.left = lrW.right = 0;
    this.levelsModalRoot.addComponent(BlockInputEvents);
    parent.addChild(this.levelsModalRoot);

    const backdrop = new Node('Backdrop');
    backdrop.addComponent(UITransform).setContentSize(vs.width, vs.height);
    const bdWg = backdrop.addComponent(Widget);
    bdWg.isAlignTop =
      bdWg.isAlignBottom =
      bdWg.isAlignLeft =
      bdWg.isAlignRight =
        true;
    bdWg.top = bdWg.bottom = bdWg.left = bdWg.right = 0;
    const bdG = backdrop.addComponent(Graphics);
    paintModalBackdrop(bdG, vs.width, vs.height);
    this.levelsModalRoot.addChild(backdrop);

    const pw = Math.min(
      MODAL_LEVELS_PANEL_WIDTH,
      Math.max(300, vs.width - LAYOUT_H_PAD * 2),
    );
    const ph = MODAL_LEVELS_PANEL_HEIGHT;

    const panel = new Node('LevelsPanel');
    const pUt = panel.addComponent(UITransform);
    pUt.setContentSize(pw, ph);
    const pW = panel.addComponent(Widget);
    pW.isAlignHorizontalCenter = true;
    pW.isAlignVerticalCenter = true;
    this.levelsModalRoot.addChild(panel);

    const panelBgNode = new Node('PanelBg');
    panelBgNode.addComponent(UITransform).setContentSize(pw, ph);
    const pbgG = panelBgNode.addComponent(Graphics);
    paintModalPanelBg(pbgG, pw, ph, MODAL_PANEL_CORNER_RADIUS);
    panel.addChild(panelBgNode);

    const panelBorderNode = new Node('PanelBorder');
    panelBorderNode.addComponent(UITransform).setContentSize(pw, ph);
    const pbdG = panelBorderNode.addComponent(Graphics);
    paintModalPanelBorder(pbdG, pw, ph, MODAL_PANEL_CORNER_RADIUS);
    panel.addChild(panelBorderNode);

    const levelsTitle = this.addCenterLabel(
      panel,
      'LevelsTitle',
      24,
      UiTheme.cream,
      18,
    );
    levelsTitle.string = '全部关卡';

    const padX = 20;
    const gridInnerW = Math.max(200, pw - padX * 2);
    const cols = 6;
    const gap = 8;
    const cellW = Math.max(
      44,
      Math.floor((gridInnerW - gap * (cols - 1)) / cols),
    );
    const cellH = 44;

    const grid = new Node('LevelsGrid');
    const gUt = grid.addComponent(UITransform);
    gUt.setContentSize(gridInnerW, 300);
    const gLay = grid.addComponent(Layout);
    gLay.type = Layout.Type.GRID;
    gLay.resizeMode = Layout.ResizeMode.CONTAINER;
    gLay.spacingX = gap;
    gLay.spacingY = gap;
    gLay.constraint = Layout.Constraint.FIXED_COL;
    gLay.constraintNum = cols;
    const gw = grid.addComponent(Widget);
    gw.isAlignTop = true;
    gw.isAlignHorizontalCenter = true;
    gw.top = 58;
    panel.addChild(grid);

    const lvPickFill = new Color(
      UiTheme.modalActionBtnFill.r,
      UiTheme.modalActionBtnFill.g,
      UiTheme.modalActionBtnFill.b,
      255,
    );
    const cellFont = Math.min(18, Math.max(14, Math.floor(cellW * 0.28)));
    for (let i = 1; i <= MAX_LEVELS; i++) {
      const b = makeLabelButton(String(i), cellW, cellH, {
        fill: lvPickFill,
        fontSize: cellFont,
      });
      grid.addChild(b);
      b.on(
        Button.EventType.CLICK,
        () => {
          this.onPickLevel(i);
        },
        this,
      );
      this.levelPickNodes.push(b);
    }

    const closeFill = new Color(
      UiTheme.modalActionBtnFill.r,
      UiTheme.modalActionBtnFill.g,
      UiTheme.modalActionBtnFill.b,
      255,
    );
    const close = makeLabelButton('关闭', 132, 48, {
      fill: closeFill,
      fontSize: 20,
    });
    const cw = close.addComponent(Widget);
    cw.isAlignBottom = true;
    cw.isAlignHorizontalCenter = true;
    cw.bottom = 14;
    panel.addChild(this.wrapBtn(close, () => this.closeLevelsModal()));
  }

  private addCenterLabel(
    parent: Node,
    name: string,
    fontSize: number,
    color: Color,
    top: number,
  ): Label {
    const n = new Node(name);
    const ut = n.addComponent(UITransform);
    ut.setContentSize(400, 56);
    const w = n.addComponent(Widget);
    w.isAlignHorizontalCenter = true;
    w.isAlignTop = true;
    w.top = top;
    const lb = n.addComponent(Label);
    lb.string = '';
    lb.fontSize = fontSize;
    lb.color = color;
    lb.horizontalAlign = Label.HorizontalAlign.CENTER;
    lb.overflow = Label.Overflow.RESIZE_HEIGHT;
    parent.addChild(n);
    return lb;
  }

  private drawJoyChrome(): void {
    const half = JOY_PANEL_SIZE * 0.5;
    const ring = new Node('JoyRing');
    const rut = ring.addComponent(UITransform);
    rut.setContentSize(JOY_PANEL_SIZE, JOY_PANEL_SIZE);
    const rg = ring.addComponent(Graphics);
    rg.fillColor = new Color(
      UiTheme.mossPanel.r,
      UiTheme.mossPanel.g,
      UiTheme.mossPanel.b,
      140,
    );
    rg.roundRect(-half, -half, JOY_PANEL_SIZE, JOY_PANEL_SIZE, half);
    rg.fill();
    rg.strokeColor = new Color(
      UiTheme.leafLine.r,
      UiTheme.leafLine.g,
      UiTheme.leafLine.b,
      200,
    );
    rg.lineWidth = 2;
    rg.roundRect(-half, -half, JOY_PANEL_SIZE, JOY_PANEL_SIZE, half);
    rg.stroke();
    this.joyPanel.insertChild(ring, 0);

    const knobR = 26 * JOY_SCALE;
    const knobG = this.joyKnob.addComponent(Graphics);
    knobG.fillColor = new Color(
      UiTheme.cream.r,
      UiTheme.cream.g,
      UiTheme.cream.b,
      230,
    );
    knobG.circle(0, 0, knobR);
    knobG.fill();
  }

  private keyRepeat(e: EventKeyboard): boolean {
    return !!(e as unknown as { repeat?: boolean }).repeat;
  }

  private openLevelsModal(): void {
    this.gameAudio.playUi();
    this.syncLevelsModalButtons();
    this.levelsModalRoot.active = true;
  }

  private closeLevelsModal(): void {
    this.levelsModalRoot.active = false;
  }

  private onPickLevel(lv: number): void {
    const maxU = getEffectiveMaxUnlockedLevel();
    if (lv > maxU) return;
    this.gameAudio.playUi();
    this.gameRunning = false;
    this.gameAudio.pauseBgm();
    this.endModalShown = false;
    this.hideResultModal();
    gameSession.initFromDisk();
    this.resetLevelWithPolicy(lv, mapLinesForPlay(), true);
    this.anim.snapToGrid(this.sim.catX, this.sim.catY);
    this.syncRunBtn();
    this.syncNextLevelUi();
    this.layoutScreen();
    this.closeLevelsModal();
  }

  private syncLevelsModalButtons(): void {
    const maxU = getEffectiveMaxUnlockedLevel();
    const cur = Math.min(
      MAX_LEVELS,
      Math.max(1, Math.floor(this.sim.level) || 1),
    );
    const unlockedFill = new Color(
      UiTheme.modalActionBtnFill.r,
      UiTheme.modalActionBtnFill.g,
      UiTheme.modalActionBtnFill.b,
      255,
    );
    const lockedFill = new Color(
      UiTheme.levelPickLockedFill.r,
      UiTheme.levelPickLockedFill.g,
      UiTheme.levelPickLockedFill.b,
      255,
    );
    for (let i = 0; i < this.levelPickNodes.length; i++) {
      const n = this.levelPickNodes[i];
      const lv = i + 1;
      const btn = n.getComponent(Button)!;
      const unlocked = lv <= maxU;
      btn.interactable = unlocked;
      const ut = n.getComponent(UITransform);
      const lw = ut?.width ?? 64;
      const lh = ut?.height ?? 44;
      const corner = defaultBtnCornerRadius(lw, lh);
      const bg = n.getChildByName('BtnBg')?.getComponent(Graphics);
      if (bg) {
        if (unlocked) {
          paintLabelButtonBg(
            bg,
            lw,
            lh,
            corner,
            unlockedFill,
            UiTheme.modalBtnStroke,
            UiTheme.modalBtnStrokeWidth,
          );
        } else {
          paintLabelButtonBg(
            bg,
            lw,
            lh,
            corner,
            lockedFill,
            UiTheme.modalBtnStroke,
            UiTheme.modalBtnStrokeWidth,
          );
        }
      }
      const lab = n.getComponentInChildren(Label)!;
      lab.string = String(lv);
      if (unlocked) {
        lab.color = lv === cur ? UiTheme.honey : UiTheme.cream;
      } else {
        lab.color = new Color(
          UiTheme.levelPickLockedDigit.r,
          UiTheme.levelPickLockedDigit.g,
          UiTheme.levelPickLockedDigit.b,
          255,
        );
      }
    }
  }

  private resetLevelWithPolicy(
    level: number,
    mapLines: string[] | null | undefined,
    silent: boolean,
  ): void {
    this.sim.resetLevel(level, mapLines, { playLevelStartSfx: !silent });
    this.pendingLevelStartSfx = silent;
    this.refreshHudDiskBest();
    this.syncCountdownAfterLevel();
    this.boardView?.markMapDirty();
  }

  private syncCountdownAfterLevel(): void {
    this.countdownLastCeil = Math.ceil(Math.max(0, this.sim.timeLeft));
  }

  private onFirstUserAudio(): void {
    this.gameAudio.unlockFromUserGesture();
  }

  private syncAudioTopLabels(): void {
    const s = this.gameAudio.getSettings();
    this.bgmTopLabel.string = s.bgmEnabled ? '音乐·开' : '音乐·关';
    this.sfxTopLabel.string = s.sfxEnabled ? '音效·开' : '音效·关';
  }

  private toggleBgm(): void {
    const s = this.gameAudio.getSettings();
    this.gameAudio.setBgmEnabled(!s.bgmEnabled);
    this.syncAudioTopLabels();
    const want = this.gameRunning && this.sim.gameEnd === 'none';
    if (want) this.gameAudio.syncBgmPlayback();
    else this.gameAudio.pauseBgm();
  }

  private toggleSfx(): void {
    const s = this.gameAudio.getSettings();
    this.gameAudio.setSfxEnabled(!s.sfxEnabled);
    this.syncAudioTopLabels();
  }

  private refreshHudDiskBest(): void {
    const save = loadLevelSave();
    this.hudDiskBestForLevel =
      save.bestTimeRemainingSec[String(this.sim.level)] ?? 0;
  }

  private layoutBoard(): void {
    const gw = this.sim.grid.width * BASE_TILE_PX;
    const gh = this.sim.grid.height * BASE_TILE_PX;
    const bmut = this.boardMount.getComponent(UITransform)!;
    const vs = view.getVisibleSize();
    const sa = getSafeAreaInsets();
    let availW = bmut.width;
    let availH = bmut.height;
    if (availW < 32 || availH < 32) {
      availW = Math.max(1, vs.width - 2 * SIDE_RAIL_W - sa.left - sa.right);
      availH = Math.max(
        1,
        vs.height -
          sa.top -
          sa.bottom -
          CENTER_TOP_MARGIN -
          BOARD_AREA_BOTTOM_PAD,
      );
    }
    availW = Math.max(1, availW);
    availH = Math.max(1, availH);
    const s = Math.min(availW / gw, availH / gh);
    this.boardRoot.setScale(s, s, 1);
    this.boardRoot.setPosition(0, 0, 0);
    this.anim.setGridTile(
      this.sim.grid.width,
      this.sim.grid.height,
      BASE_TILE_PX,
    );
  }

  private onKeyDown(e: EventKeyboard): void {
    this.onFirstUserAudio();
    this.keys.add(e.keyCode);
    if (e.keyCode === KeyCode.SPACE && !this.keyRepeat(e)) {
      if (this.gameRunning && this.sim.gameEnd === 'none') {
        this.sim.tryJump();
      }
    }
    if (e.keyCode === KeyCode.KEY_J && !this.keyRepeat(e)) {
      if (this.gameRunning && this.sim.gameEnd === 'none') {
        this.sim.tryPounce();
      }
    }
  }

  private onKeyUp(e: EventKeyboard): void {
    this.keys.delete(e.keyCode);
  }

  private toggleRun(): void {
    if (this.sim.gameEnd !== 'none') return;
    this.gameAudio.playUi();
    const willRun = !this.gameRunning;
    this.gameRunning = willRun;
    if (willRun) {
      if (this.pendingLevelStartSfx) {
        this.gameAudio.playLevelStart();
        this.pendingLevelStartSfx = false;
      }
      this.gameAudio.syncBgmPlayback();
    } else {
      this.gameAudio.pauseBgm();
    }
    this.syncRunBtn();
  }

  private syncRunBtn(): void {
    const ended = this.sim.gameEnd !== 'none';
    this.runBtn.interactable = !ended;
    const text = ended ? '开始' : this.gameRunning ? '暂停' : '开始';
    this.runBtnLabel.string = text;
  }

  private syncNextLevelUi(): void {
    const nextLv = this.sim.level + 1;
    const can =
      this.sim.level < MAX_LEVELS && nextLv <= getEffectiveMaxUnlockedLevel();
    this.nextBtn.interactable = can;
    this.nextBtnLabel.color = can ? UiTheme.cream : UiTheme.muted;
  }

  private onClickNextLevel(): void {
    this.gameAudio.playUi();
    const nextLv = this.sim.level + 1;
    if (
      this.sim.level >= MAX_LEVELS ||
      nextLv > getEffectiveMaxUnlockedLevel()
    ) {
      return;
    }
    this.advanceToNextLevel();
  }

  private advanceToNextLevel(): void {
    const nextLv = this.sim.level + 1;
    if (
      this.sim.level >= MAX_LEVELS ||
      nextLv > getEffectiveMaxUnlockedLevel()
    ) {
      return;
    }
    this.endModalShown = false;
    this.hideResultModal();
    this.gameRunning = false;
    this.gameAudio.pauseBgm();
    this.resetLevelWithPolicy(nextLv, mapLinesForPlay(), true);
    this.anim.snapToGrid(this.sim.catX, this.sim.catY);
    saveProgressToDisk(this.sim);
    gameSession.initFromDisk();
    this.syncRunBtn();
    this.syncNextLevelUi();
    this.layoutScreen();
  }

  private onModalReplay(): void {
    this.gameAudio.playUi();
    this.endModalShown = false;
    this.hideResultModal();
    this.gameRunning = true;
    this.resetLevelWithPolicy(this.sim.level, mapLinesForPlay(), false);
    this.anim.snapToGrid(this.sim.catX, this.sim.catY);
    this.syncRunBtn();
    this.syncNextLevelUi();
    this.layoutScreen();
  }

  private onModalNext(): void {
    this.gameAudio.playUi();
    this.advanceToNextLevel();
  }

  private hideResultModal(): void {
    this.modalRoot.active = false;
  }

  /** 与网页版结算弹窗右上角关闭一致：胜利时写盘并重置本关（静默） */
  private onResultModalCloseX(): void {
    this.gameAudio.playUi();
    if (this.sim.gameEnd === 'none') {
      this.hideResultModal();
      return;
    }
    if (this.sim.gameEnd === 'win') {
      saveProgressToDisk(this.sim);
      gameSession.initFromDisk();
    }
    this.endModalShown = false;
    this.gameRunning = false;
    this.gameAudio.pauseBgm();
    this.resetLevelWithPolicy(this.sim.level, mapLinesForPlay(), true);
    this.anim.snapToGrid(this.sim.catX, this.sim.catY);
    this.hideResultModal();
    this.syncRunBtn();
    this.syncNextLevelUi();
    this.layoutScreen();
  }

  private showEndModal(
    kind: 'win' | 'lose',
    level: number,
    timeLeft: number,
    isNewPersonalBest: boolean,
  ): void {
    this.modalRoot.active = true;
    if (kind === 'win') {
      this.modalTitle.string = isNewPersonalBest ? '捕鼠冠军' : '太棒了';
      this.modalSub.string = `第 ${level} 关通关！剩余时间 ${timeLeft.toFixed(1)} 秒`;
      this.modalBtnNext.node.active = level < MAX_LEVELS;
    } else {
      this.modalTitle.string = '别灰心 Tom';
      this.modalSub.string = '这群杰瑞太狡猾了，再来一次吧';
      this.modalBtnNext.node.active = false;
    }
    this.layoutEndModalActionRow();
  }

  /** 仅「重玩」时收窄行动条，使按钮相对弹窗水平居中 */
  private layoutEndModalActionRow(): void {
    const row = this.modalBtnReplay.node.parent;
    if (!row) return;
    const rUt = row.getComponent(UITransform);
    const layout = row.getComponent(Layout);
    if (!rUt || !layout) return;
    const gap = layout.spacingX;
    const showNext = this.modalBtnNext.node.active;
    const replayW = this.modalBtnReplay.node.getComponent(UITransform)!.width;
    const nextW = showNext
      ? this.modalBtnNext.node.getComponent(UITransform)!.width
      : 0;
    const w = showNext ? replayW + gap + nextW : replayW;
    rUt.setContentSize(w, rUt.height);
    layout.updateLayout(true);
  }

  private onJump(): void {
    if (!this.gameRunning || this.sim.gameEnd !== 'none') return;
    this.sim.tryJump();
  }

  private onAttack(): void {
    if (!this.gameRunning || this.sim.gameEnd !== 'none') return;
    this.sim.tryPounce();
  }

  private joyLocalFromEvent(e: EventTouch): Vec3 {
    const ui = e.getUILocation();
    const tr = this.joyPanel.getComponent(UITransform)!;
    return tr.convertToNodeSpaceAR(new Vec3(ui.x, ui.y, 0));
  }

  private onJoyStart(e: EventTouch): void {
    this.onFirstUserAudio();
    this.joyActive = true;
    this.joyPrevLx = 0;
    this.joyPrevLy = 0;
    this.joySpillLx = 0;
    this.joySpillLy = 0;
    const v = this.joyLocalFromEvent(e);
    this.setKnob(v.x, v.y);
  }

  private onJoyMove(e: EventTouch): void {
    if (!this.joyActive) return;
    const v = this.joyLocalFromEvent(e);
    this.setKnob(v.x, v.y);
  }

  private onJoyEnd(): void {
    this.joyActive = false;
    this.intent.x = 0;
    this.intent.y = 0;
    this.joyKnob.setPosition(0, 0, 0);
  }

  private maxKnobTravelPx(): number {
    const jp = this.joyPanel.getComponent(UITransform)!.width;
    const kh = this.joyKnob.getComponent(UITransform)!.width;
    return Math.max(8, jp / 2 - kh / 2 - 2);
  }

  private setKnob(lx: number, ly: number): void {
    const dCenter = Math.hypot(lx, ly);
    if (dCenter < JOY_RETURN_DEAD_PX) {
      this.joyKnob.setPosition(0, 0, 0);
      this.intent.x = 0;
      this.intent.y = 0;
      this.joyPrevLx = lx;
      this.joyPrevLy = ly;
      this.joySpillLx = 0;
      this.joySpillLy = 0;
      return;
    }

    const dlx = lx - this.joyPrevLx;
    const dly = ly - this.joyPrevLy;
    this.joySpillLx += dlx;
    this.joySpillLy += dly;
    const accMag = Math.hypot(this.joySpillLx, this.joySpillLy);
    if (accMag >= JOY_DELTA_THRESH_PX) {
      this.intent.x = this.joySpillLx / accMag;
      this.intent.y = this.joySpillLy / accMag;
      this.joySpillLx = 0;
      this.joySpillLy = 0;
    }

    this.joyPrevLx = lx;
    this.joyPrevLy = ly;

    const maxT = this.maxKnobTravelPx();
    const cap = Math.min(dCenter, maxT);
    const ux = lx / dCenter;
    const uy = ly / dCenter;
    this.joyKnob.setPosition(ux * cap, uy * cap, 0);
  }

  update(dt: number): void {
    const playing = this.gameRunning && this.sim.gameEnd === 'none';

    if (playing) {
      this.sim.update(dt);
      const c = Math.ceil(Math.max(0, this.sim.timeLeft));
      if (c >= 1 && c <= 5 && c < this.countdownLastCeil) {
        this.gameAudio.playCountdownTick();
      }
      this.countdownLastCeil = c;
    }

    while (true) {
      const ev = this.sim.consumeMotionEvent();
      if (!ev) break;
      this.anim.enqueue(ev);
    }
    this.anim.update(dt, this.sim.catX, this.sim.catY);

    const { dx, dy } = resolveMoveIntent(this.keys, this.intent);
    if (playing && (dx !== 0 || dy !== 0)) {
      this.sim.setFacing(dx, dy);
      this.sim.tryMove(dx, dy);
    }

    if (this.sim.gameEnd !== 'none' && !this.endModalShown) {
      this.endModalShown = true;
      this.gameRunning = false;
      this.gameAudio.pauseBgm();
      if (this.sim.gameEnd === 'win') {
        const k = String(this.sim.level);
        const save = loadLevelSave();
        const prevBest = Math.max(
          gameSession.bests[k] ?? 0,
          save.bestTimeRemainingSec[k] ?? 0,
        );
        const isNewPersonalBest = this.sim.timeLeft > prevBest;
        gameSession.recordClearedLevel(this.sim.level, this.sim.timeLeft);
        this.gameAudio.playWin();
        this.showEndModal(
          'win',
          this.sim.level,
          this.sim.timeLeft,
          isNewPersonalBest,
        );
      } else {
        this.gameAudio.playLose();
        this.showEndModal('lose', this.sim.level, this.sim.timeLeft, false);
      }
      this.syncRunBtn();
    }

    this.boardView.redraw(this.sim, this.anim, this.sim.stunnedRemaining > 0);

    const st =
      this.sim.stunnedRemaining > 0
        ? ` 眩晕 ${this.sim.stunnedRemaining.toFixed(1)}s`
        : '';
    const end = this.sim.gameEnd !== 'none' ? ' — 已结束' : '';
    const bestSess = gameSession.bests[String(this.sim.level)];
    const bestVal = Math.max(bestSess ?? 0, this.hudDiskBestForLevel);
    const bestStr = bestVal > 0 ? ` · 本关最佳剩余 ${bestVal.toFixed(1)}s` : '';
    const levelLine = `第 ${this.sim.level} 关${bestStr}`;
    const timeLine = `剩余 ${Math.max(0, this.sim.timeLeft).toFixed(1)}s${st}${end}`;
    if (levelLine !== this.lastLevelHudLine) {
      this.lastLevelHudLine = levelLine;
      this.levelStripLabel.string = levelLine;
    }
    if (timeLine !== this.lastCountdownHudLine) {
      this.lastCountdownHudLine = timeLine;
      this.countdownStripLabel.string = timeLine;
    }

    this.syncNextLevelUi();

    const wantBgm = this.gameRunning && this.sim.gameEnd === 'none';
    if (wantBgm !== this.prevWantBgm) {
      this.prevWantBgm = wantBgm;
      if (wantBgm) {
        this.gameAudio.syncBgmPlayback();
      } else {
        this.gameAudio.pauseBgm();
      }
    }
  }
}
