# 猫捕鼠冠军Tom · 设计文档

> 描述项目"是什么 / 怎么组织"，长期稳定，与代码同步。  
> 路线图与待办见 [`PROJECT_STATUS.md`](./PROJECT_STATUS.md)；积分 / 皮肤 / 微信能力专题见 [`SCORE_AND_SKIN.md`](./SCORE_AND_SKIN.md)；变更历史见 [`CHANGELOG.md`](./CHANGELOG.md)。

---

## 1. 项目概述

`猫捕鼠冠军Tom` 是一个基于 Cocos Creator 的横屏休闲小游戏。玩家控制小猫在网格地图上移动、跳跃、攻击，限时抓住所有老鼠通关；通关 / 失败 / 破纪录都会发放积分，可在个人中心兑换皮肤。

### 1.1 核心玩法
- 网格移动 + 跳跃 + 攻击；老鼠 AI 以 BFS 距离场远离小猫。
- 每关默认限时 30 秒，关卡上限 30 关；关卡越高老鼠越多、步进越快。
- 通关条件：在剩余时间归零前抓完所有老鼠。

### 1.2 技术栈
- Cocos Creator **3.8.8** + TypeScript
- Cocos 组件 / 场景编辑器 / `Graphics` 动态绘制
- 跨端存储：微信小游戏走 `wx.*StorageSync`，其他平台走 `sys.localStorage`
- 微信小游戏能力：分享菜单 + Bundle / subpackage 分包

---

## 2. 项目结构

详细的目录树以仓库 `README.md` 为准（仅含面向运行预览 / 构建发布的视角）。本文从架构视角描述各目录的职责：

```text
assets/
  scene-001.scene              主游戏场景（启动场景，settings/v2/packages/scene.json 中固定）
  personal-center/             独立 Bundle 目录（wechatgame subpackage）
    PersonalCenterPage.scene
  scripts/
    GameController.ts          游戏主控制器：UI 搭建、输入、关卡流程、结算 / 弹窗、音频绑定
    PersonalCenterPage.ts      个人中心页面：积分卡片 / 皮肤商店 / 积分流水弹窗
    BoardView.ts               棋盘渲染（地图、角色、对象池）
    game/                      纯游戏逻辑（GameSimulation / Grid / mice / 关卡）+ ScoreManager + skinConfig + sceneRoutes
    audio/                     CocosGameAudio：BGM / SFX 双 AudioSource 封装
    render/                    地图贴图配置
    storage/                   levelSave / audioSettings / platformKv 跨端存储 + wechatShare 分享封装
    ui/                        UiTheme 色板与弹窗常量、safeArea 安全区适配、widgets 共享 UI 原子
    visual/                    CatMotionAnimator 猫位移补间
```

---

## 3. 核心模块

### 3.1 GameController
- 单一 `Component`，作为整个主场景的入口。
- 负责：UI 节点动态搭建（侧栏 / HUD / 摇杆 / 动作按钮 / 弹窗）、键盘 + 触摸输入解析、关卡状态机、与 `GameSimulation` 的 hooks 绑定、结算文案与 `ScoreManager` 入账。
- `onLoad` 中显式调用 `scoreManager.claimDailyLoginRewardIfNeeded()` 与 `setupWechatShare`，避免被动副作用。

### 3.2 GameSimulation 与游戏数据
- `game/` 下纯逻辑层，不依赖任何 Cocos 节点：地图 `Grid`、角色 `Cat` / `Mouse`、步进、跳跃 / 攻击规则、胜负判定、`mouseCountForLevel` 等关卡梯度。
- 通过 `setSoundHooks` 回调把"开始关卡 / 眩晕 / 跳跃成功 / 攻击成功 / 抓到老鼠"暴露给 `GameController`，由后者驱动音频与视觉反馈。

### 3.3 BoardView
- 承担棋盘 + 角色的渲染：地图四张贴图齐时按 `SpriteFrame` 铺格，缺贴图则 `Graphics` 色块兜底。
- 内置 `spritePool` / `mousePool` 对象池，关卡切换时复用而不重新创建节点。

### 3.4 ScoreManager 与皮肤
- 单例：`ScoreManager.getInstance()` 只做存档加载。
- 提供每日登录、胜负 / 破纪录积分入账、失败积分每日次数频控、分享 +10 / 每日 1 次、皮肤解锁与切换、积分流水。
- 详见 [`SCORE_AND_SKIN.md`](./SCORE_AND_SKIN.md)。

### 3.5 PersonalCenterPage
- 独立场景 + 独立 Bundle（`personal-center`，wechatgame subpackage），通过 `sceneRoutes.loadPersonalCenterScene()` 按需加载。
- 页面布局：返回按钮 + 标题、积分卡片（可用积分 / 累计 / 已解锁皮肤 / 积分详情 / 分享提示）、皮肤商店（自适应网格，最多 4 列）、积分流水详情弹窗。
- 详见 [`SCORE_AND_SKIN.md`](./SCORE_AND_SKIN.md) §3。

### 3.6 跨端存储
- `storage/platformKv.ts` 屏蔽 `wx.*StorageSync` 与 `sys.localStorage` 差异；所有上层（`levelSave` / `audioSettings` / `ScoreManager`）只依赖它的 string 接口。
- `decodeWxValue` 严格要求字符串，避免被 `JSON.stringify` 二次编码。

### 3.7 微信能力
- `storage/wechatShare.ts` 封装 `showShareMenu` / `updateShareMenu` / `onShareAppMessage` / `onShareTimeline`，并暴露 `onShareSuccess(channel)` 回调供业务接入（如分享积分）。
- 仅在 `cc/env` 的 `WECHAT` 为真且全局 `wx` 存在时生效；其他平台无副作用。

### 3.8 UI 原子组件
- `ui/widgets.ts`：`makeLabelButton` / `paintRoundRect` / `paintModalBackdrop` / `paintModalPanelBg` / `paintModalPanelBorder` / `addUiNode` / `addUiLabel` / `solidColor` / `defaultBtnCornerRadius` / `paintLabelButtonBg`。
- `ui/UiTheme.ts`：色板、弹窗常量（`MODAL_PANEL_CORNER_RADIUS` / `MODAL_PANEL_WIDTH` 等）、`styleBarButton` / `styleRoundActionButton` 等共享样式函数。
- `ui/safeArea.ts`：`getSafeAreaInsets()` 用于侧栏 / HUD / 操作区与全屏底图的边距。

### 3.9 路由
- `game/sceneRoutes.ts` 集中维护：
  - `MAIN_GAME_SCENE = 'scene-001'`
  - `PERSONAL_CENTER_SCENE = 'PersonalCenterPage'`
  - `PERSONAL_CENTER_BUNDLE = 'personal-center'`
  - `loadMainGameScene()` / `loadPersonalCenterScene()`：屏蔽 Bundle 加载细节，并在 Bundle 失败时仅在非微信预览环境回退。

---

## 4. 界面与流程规范

### 4.1 主界面
- **左侧栏**：音乐 / 音效开关、个人中心入口。
- **右侧栏**：开始 / 暂停、下一关、全部关卡。
- **中央**：游戏棋盘（`BoardView` 渲染）。
- **底部**：左下虚拟摇杆、右下圆形跳跃 + 攻击按钮。
- **HUD**：当前关卡、剩余时间、本关最佳、眩晕提示；攻击捕获时在「本关最佳」下方实时追加 `+n 完美命中！` 行（结算弹窗关闭后清空）。
- 弹窗（结算 / 关卡列表 / 登录奖励）全部用 `paintModalPanelBg` + `paintModalPanelBorder` + `MODAL_PANEL_CORNER_RADIUS` 共享样式。

### 4.2 结算弹窗
- 标题（`UiTheme.honey`）+ 正文区（关卡结果说明 + 多行积分明细）；正文区顶底 `Widget` 锚定，避免与标题 / 底栏按钮重叠；面板高度见 `MODAL_END_PANEL_HEIGHT`（当前 320）。
- 本局积分明细示例：`本局共 +12` + 分项（通关 +5、破纪录 +10、失败奖励 +2 / +0（已达今日上限）、完美命中 +15 等）。
  - 胜利：通关 +5；破纪录再 +10。
  - 失败：+2（每日最多 10 次入账）；达上限时分项显示 +0 说明。
  - **完美命中**：攻击冲撞路径捕获 `n` 只老鼠 → +`n×5`，胜负均发放。
- 胜利提供"重玩 / 下一关"，失败仅"重玩"且按钮居中。

### 4.3 个人中心
- 见 [`SCORE_AND_SKIN.md`](./SCORE_AND_SKIN.md) §3，本节不再重复。

---

## 5. 跨平台与兼容

- **微信小游戏**：横屏（`game.json` 的 `deviceOrientation = landscape`）；个人中心通过 subpackage 分包；分享菜单 / 分享朋友圈；存储走 `wx.*StorageSync`。最低基础库建议 ≥ 3.1.x。
- **浏览器 / 编辑器预览**：自动回退到 `sys.localStorage`；分享相关 API 静默忽略；个人中心 Bundle 加载失败时回退 `director.loadScene`，方便编辑器预览。
- **其他原生平台**：未单独打包验证，预期借助 Cocos 默认行为可用，但需要补回归测试。
