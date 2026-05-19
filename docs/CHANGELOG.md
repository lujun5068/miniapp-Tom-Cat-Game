# 变更日志

按日期倒序记录工程层面的可见改动。本文整合了原 `PROJECT_STATUS.md §五 变更记录` 与原 `INTEGRATION_SYSTEM_DESIGN.md §8.2 已修复问题` 两处历史日志，并去掉了重复项。

格式约定：每条改动尽量贴出相关文件 / 接口路径；同一天的多条按主题分组。

---

## 2026-05-19

### 美术 / 资源
- 皮肤帧组接入：`default / golden / ninja / pirate` 四套猫帧从临时目录迁移到 `assets/resources/cat-skins/<skinId>/{start,walk1,walk2,xuanyun}/`；新增 `assets/scripts/game/catSkinLoader.ts` 通过 `resources.loadDir` 按当前皮肤运行时加载；`GameController` 移除原 `catAnimFramesStart / WalkHorizontal / WalkVertical / Stun` 四个 Inspector `SpriteFrame[]` 字段，改由 `applyCurrentCatSkin` → `applyCatSkinFrames(skinId)` 异步装配；`BoardView.sortCatSpriteFrames` 兼容 `frame-NN` / `frame_NN` / `startN` 等命名。
- 旧散帧 `assets/images/cat/{start,walk1,walk2,xuanyun}/` 与 `start1.png` 一并删除（已被新 `default` 皮肤帧组替代）。

### UI / 体验
- 抽出 `assets/scripts/ui/widgets.ts`：`makeLabelButton` / `paintRoundRect` / `paintModalBackdrop` / `paintModalPanelBg` / `paintModalPanelBorder` / `addUiNode` / `addUiLabel` / `solidColor` 等原子，`GameController` 与 `PersonalCenterPage` 共用一份，删除两边重复实现。
- 登录奖励弹窗改用统一 `UiTheme.modalPanelBg / modalPanelBorder + MODAL_PANEL_CORNER_RADIUS`，与结算 / 关卡列表弹窗共用底色 + 描边。
- 个人中心主滚动 `content` 锚点 `(0.5, 1)` 时定位修正为恒定 `vs.height * 0.5`，修复短内容首屏被下移、长内容滚动末段错位。
- 积分卡片 stat pill 改为基于卡片宽度动态计算位置 + 宽度（120~220 范围），`Label.Overflow.SHRINK` 兜底；窄屏不再与"积分详情"按钮重叠。
- 积分卡片底部新增"每日分享获得额外积分"小字提示（fontSize=14、`UiTheme.muted`），文案随 `ScoreManager.canClaimShareRewardToday()` 动态切换。

### 业务规则
- 失败积分增加每日次数频控：`ScoreManager.addLoseReward` 每日最多入账 10 次（即每日失败最多 +20 分），存档新增 `failureRewardDate / failureRewardCount`；结算弹窗在达到上限时改成"已达今日失败积分上限"。
- 微信分享 +10 积分：`ScoreManager.addShareReward(reason?)` 每日仅 1 次、幂等；存档新增 `shareRewardDate`；`wechatShare.setupWechatShare` 扩展出 `onShareSuccess(channel)`，主游戏 / 个人中心均接入；个人中心入账后立即 `refreshScoreCard()` 同步 UI。
- 分享文案随积分刷新：兑换 / 切换皮肤后 `refreshScoreCard` 会重新 `setupWechatShare`，分享卡片不再停留在进入页面那一刻的旧数据。
- `migrateFromV1` 注释明确：v1 只存了余额，`totalEarnedScore` 只能按当前余额作下界，属于历史不可逆数据丢失。

### 架构 / 路由
- 个人中心独立分包：`PersonalCenterPage.scene` 移到 `assets/personal-center/`，`assets/personal-center.meta` 配置 `userData.compressionType.wechatgame = 'subpackage'`；`sceneRoutes.PERSONAL_CENTER_BUNDLE` 改为 `'personal-center'`；构建 profiles 中 `PersonalCenterPage.scene` URL 同步更新。
- `sceneRoutes.ts` 新增 `loadMainGameScene` / `loadPersonalCenterScene`，统一处理"主场景直接 loadScene / 个人中心走 Bundle / Bundle 失败仅在非微信环境回退"，`GameController` 与 `PersonalCenterPage` 不再各自拼装。
- `ScoreManager` 构造副作用拆分：构造函数只做 `loadFromDisk`，每日登录奖励改由公开方法 `claimDailyLoginRewardIfNeeded` 提供，由 `GameController.onLoad` 显式调用；测试 / 工具脚本只读访问不再触发发奖与写盘。

### 稳定性
- `PersonalCenterPage.clearPageChildren` 销毁 Canvas 下除 `Camera` 外的所有动态子节点，修复 `ConfirmOverlay` / `HistoryOverlay` 节点泄漏。
- 新增 `destroyOverlay` 在销毁 overlay 的同时把其内部的 ScrollArea 引用从 `scrollAreas` 中移除。
- `lateUpdate` 中遍历 `scrollAreas` 时跳过 `!isValid` 节点，并周期 compact 数组，避免历史弹窗关闭后访问已销毁组件抛错。
- `storage/platformKv.decodeWxValue` 只接受字符串，遇到非字符串值返回 `null`，避免被 `JSON.stringify` 二次包装再 `JSON.parse` 解出导致语义错乱。

### 代码清理
- 删除遗留场景 `assets/scene.scene` + meta（启动场景始终是 `scene-001.scene`，由 `settings/v2/packages/scene.json` 指定）；同步更新 README 项目结构示意。
- 删除 `PersonalCenterPage.updateScrollAreaSize` / `getScrollViewNode` 死代码、`BoardView.ts` 未使用的 `BatchNode` import。

### 文档
- 重整 `docs/`：`DESIGN_DOC.md` 删 §5 路线图与 §4 空洞段；`INTEGRATION_SYSTEM_DESIGN.md` 重命名为 `SCORE_AND_SKIN.md` 并剔除已迁入 CHANGELOG 的修复列表；新建 `CHANGELOG.md`（即本文）与 `docs/README.md` 索引；删除 `PERFORMANCE_OPTIMIZATION.md`（保留价值并入 `PROJECT_STATUS.md`）与过期 `DESIGN_DOC.html`。

---

## 2026-05-18

- **积分系统初版**：`ScoreManager` v2 本地存档，覆盖每日登录、胜负 / 破纪录奖励、皮肤兑换、最近积分流水。
- **个人中心初版**：拆为独立场景 `PersonalCenterPage.scene` 与脚本 `PersonalCenterPage.ts`，包含积分卡片、皮肤商店、积分流水弹窗；支持通过 `assetManager.loadBundle` 加载。
- **微信分享菜单接入**：`storage/wechatShare.ts` 在主游戏与个人中心注册 `showShareMenu / onShareAppMessage / onShareTimeline`。

---

## 2026-05-14

### 核心
- 工程初版：核心游戏逻辑（`GameSimulation` + `BoardView` + `CatMotionAnimator`）、占位渲染、运行时动态 UI、本地存档（`sys.localStorage`）。
- 关卡数据：`MAX_LEVELS = 30`、`MAX_MICE`、`mouseCountForLevel` 等参数定型。

### 音频
- `audio/CocosGameAudio.ts`：BGM `loop` + SFX `playOneShot` 双 `AudioSource` 封装。
- `storage/audioSettings.ts`：与网页版同 key `cat-game-audio-v1`，跨端读写。
- 顶栏音乐 / 音效开关、首次触摸 / 按键解锁播放、关卡开始 / 倒计时 tick / 胜负音效 / UI 点击音全部接入。
- 资源采用 `.m4a` 入库（微信真机如不兼容再换 mp3）。

### 表现层与 UI
- `BoardView` 支持精灵铺格（`sfMapFloor / Edge / Stone1 / Stone2`）或色块占位；老鼠纵向贴图 + `mouseSpriteScale`。
- `UiTheme` 配色与 H5 `style.css` 对齐；安全区 `Widget` 边距；全屏底图 `sfUiBg`。
- 弹窗与按钮描边统一；关卡选择弹窗动态格宽；失败结算行动条收窄居中；移除"重置进度"入口。

### 跨端 / 微信
- `storage/platformKv.ts` 适配 `wx.*StorageSync` 与 `sys.localStorage`，`levelSave` / `audioSettings` 全部走该层。
- `profiles/v2/packages/wechatgame.json` 的 `orientation` 改为 `landscape`，输出 `game.json` 的 `deviceOrientation` 为横屏。
