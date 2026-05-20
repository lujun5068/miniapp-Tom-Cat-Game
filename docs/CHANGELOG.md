# 变更日志

按日期倒序记录工程层面的可见改动。本文整合了原 `PROJECT_STATUS.md §五 变更记录` 与原 `INTEGRATION_SYSTEM_DESIGN.md §8.2 已修复问题` 两处历史日志，并去掉了重复项。

格式约定：每条改动尽量贴出相关文件 / 接口路径；同一天的多条按主题分组。

---

## 2026-05-20

### 包体 / 分包
- BGM 拆 `audio-stream` 分包，目标：把 ~490KB 的 `bgm_main_loop.m4a` 从首包剥离（短期首包瘦身方案 step1）。
  - 资源迁移：`assets/audio/bgm_main_loop.m4a(.meta)` → `assets/audio-stream/bgm_main_loop.m4a(.meta)`（保留原 uuid `20a59def-...` 避免历史引用断链）。
  - Bundle 配置：新增 `assets/audio-stream.meta`，`userData.isBundle: true / bundleName: 'audio-stream' / compressionType.wechatgame: 'subpackage'`，其他平台 `merge_dep`。
  - 解开主场景依赖：删除 `scene-001.scene` 里的 `clipBgmMain` 字段（含 uuid 引用），让构建依赖图不再把 bgm 拖回主场景所在的 `start-scene/` bundle。
  - 代码改造（[`assets/scripts/audio/CocosGameAudio.ts`](../assets/scripts/audio/CocosGameAudio.ts)）：`GameAudioClipBundle` 去掉 `bgmMain` 字段；新增私有 `bgmClip: AudioClip|null` 与 `setBgmClip(clip)`；`tryPlayBgm / syncBgmPlayback` 改读 `this.bgmClip`，内部已处理"clip 注入晚于首次用户手势"的时序，注入即视情况自动 `play`。
  - 加载入口（[`assets/scripts/GameController.ts`](../assets/scripts/GameController.ts)）：删 `@property clipBgmMain` 与构造时 `bgmMain` 入参；新增 `applyStreamingBgm()`：`assetManager.loadBundle('audio-stream')` → `bundle.load('bgm_main_loop', AudioClip)` → `gameAudio.setBgmClip(clip)`，`onLoad` 完成 `CocosGameAudio` 构造后异步 `void this.applyStreamingBgm()`。失败仅 `console.warn`，游戏其余流程不依赖 BGM；加载完成时组件可能已销毁，故注入前 `isValid` 防御。
  - 文档：[`SCORE_AND_SKIN.md`](./SCORE_AND_SKIN.md) §10 新增"首包瘦身与分包策略"章节，记录当前 4 个 Bundle 划分（main / personal-center / audio-stream / resources）、`audio-stream` 完整流程、待施行优化清单（非默认皮肤资源 / 引擎模块裁剪 / 脚本按 bundle 拆分）以及 Creator 构建发布面板自检步骤；同步更新 README 中"音频"章节描述。

### 音频
- 皮肤特征音接入（按 category 切换 4 个动作音）：新增 `assets/resources/cat-audios/<category>/{start,jump,attack,stun}.m4a`（当前覆盖 `cat / fox / boar` 三类）与 `assets/scripts/game/catAudioLoader.ts`（`loadCatSkinAudio(category, fallback='cat')` 异步加载 4 个 `AudioClip`，缺失自动回退到 `cat/`）。`CocosGameAudio` 新增 `setSkinAudio(pack)` + 私有 `skinClips` 覆盖层 + `resolveSkinClip(action, fallback)`：`playLevelStart / playJump / playAttack / playStun` 都改为先取皮肤覆盖音、再回退到 Inspector 配置的通用 clip；不受皮肤影响的 `sfxCatch / sfxWin / sfxLose / sfxUi` 保持原行为；主循环 BGM 改由 `audio-stream` 分包异步加载（见上一节）。`GameController.applyCurrentCatSkin` 调用 `applyCatSkinAudio(skin.category)` 注入；`skinConfig.CatSkin.category` 字段决定使用哪一组（`default/ninja/pirate=cat`, `fox=fox`, `boar=boar`，同 category 共享一组音）。

### 业务规则
- 猫跳跃 / 攻击 / 眩晕规则调整（[`assets/scripts/game/rules.ts`](../assets/scripts/game/rules.ts)）：
  - 新增 `isWallCell(grid, x, y)`：越界或位于地图外圈的障碍格视为"墙"（与 `BoardView.isMapOuterRing` 同一几何判据，对应视觉上的 `edge` 贴图）；内圈障碍是石头，可跳越。
  - `evalJump`：
    1. 前方下一格是墙（含越界）→ 眩晕（行为不变）；
    2. **新行为**：前方下一格是空地 → 前进 1 格落点（原本要求必须有石头，否则眩晕）；
    3. 前方下一格是石头（内圈障碍）→ 仍然检查 `+2dx,+2dy` 是否可走，可走则跳到 2 格落点，否则眩晕（保留越过逻辑）。
  - `evalAttack`：**改为前进 2 格冲撞**，三种结果：
    1. p1 不可走 → 原地眩晕、不移动（`ok:false, stun:true`）；
    2. **p1 可走、p2 不可走 → 前进 1 格后眩晕**（`ok:true, x:p1x, y:p1y, path:[p1], stun:true`，撞墙 / 撞障碍效果）；
    3. p1 / p2 都可走 → 冲到 p2（`ok:true, x:p2x, y:p2y, path:[p1,p2]`，不眩晕）。
  - `simulation.tryPounce`：按 `r.path` 逐格 `catchMice`（避免 p1 上的老鼠"被跳过却没被吃"）；若返回 `stun:true` 则在播完 `onAttackSuccess` 之后再触发 `STUN_DURATION_SEC + onStun`。`MotionEvent.kind='attack'` 的 from→to 由动画系统线性插值，1 格 / 2 格距离都不影响 `CatMotionAnimator` 既有 attack 段动画播放。
  - 副作用：旧 `AttackResult` 没有 `path` 字段、`r.x/r.y` 仍是终点；新类型加了 `path: {x,y}[]` 与可选 `stun?: boolean`（仅 `ok:true` 分支）。当前仅 `simulation.tryPounce` 一处消费，无外部 API 影响。

---

## 2026-05-19

### 美术 / 资源
- 猫朝向修复：BoardView 的 flip / angle 逻辑统一为"资源默认水平朝右、`walk2` 纵向朝上"——`walkH` 改为 `dx<0` 时左右翻转（原来 `dx>0` 翻转，与新 `resources/cat-skins/**/walk1` 资源朝右的实际朝向相反，导致猫头反向）；`walkV / stun` 改为 `dy>0` 时旋转 180°（实测 `walk2` 资源默认面朝上，向下走时翻 180° 转朝下）。资源默认朝向请按 [`SCORE_AND_SKIN.md`](./SCORE_AND_SKIN.md) §4.1 的约定提供。
- 猫显示尺寸放大：`BoardView` 新增 `CAT_DISPLAY_SCALE = 1.5`，棋盘上的猫节点半径乘以该系数，整体视觉放大 1.5 倍（老鼠尺寸保持不变）。后续如需调大 / 调小整体猫的显示比例，统一改这一个常量即可。
- 猫动画速度提升：`catAnimFrameSec` 默认值由 `0.2s` 调整为 `0.1s`（同步更新 `GameController` / `BoardView` 兜底值与 `assets/scene-001.scene`）。新像素皮肤每个动作 4~5 帧，原值看上去帧率过低；推荐 0.08~0.12 区间。
- 个人中心"使用"按钮 layer 修复：`PersonalCenterPage.createActionBtn` 在 `makeLabelButton` 之后显式 `syncUiLayer(btn)`，避免 `new Node()` 默认 `Default` layer 与 Canvas 的 `UI_2D` 不一致导致按钮被 UI Camera 忽略；表现为兑换 / 解锁后"使用"按钮在卡片下方不可见，刷新或重进个人中心才偶然出现。
- 个人中心皮肤卡片预览改为皮肤 start 帧：`PersonalCenterPage.createSkinRow` 在原 Graphics 圆块上叠 `Sprite` 子节点 `PreviewSprite`（44×44），`refreshSkinPreview` 改为画"圆形底 + 状态边框"，贴图由 `catSkinLoader.loadCatSkinStartFrame(skinId)` 异步加载 `resources/cat-skins/<skinId>/start/` 第一帧并缓存（`skinPreviewCache: Map<string, SpriteFrame|null>`）；未解锁皮肤贴图按灰色 + 半透明渲染，仍能识别轮廓但明显不可用。
- 老鼠皮肤随机化 + 四方向动画：新增 `assets/resources/rat_skins/<color>/<dir>/{1,2,3}.png`（4 色 × up/down/left/right × 3 帧）与 `assets/scripts/game/ratSkinLoader.ts`（`loadAllRatSkinFrames` 一次性加载全 16 个方向帧组）。`BoardView` 新增 `setMouseSkinFrames({ pack, frameDurationSec })`、`ratSkinPack` / `ratState: Map<mouseId, {skin,dir,animTime,frameIndex}>`；老鼠 id 首次出现时按 `Math.random()` 稳定分配一种皮肤，按 `dx/dy` 切换 `RatDirection` 并按 `ratAnimSecPerFrame` 推进帧；当前方向缺帧时回退到其它方向，皮肤完全空再回退到 `sfMouse`（保持原有翻转兜底）。`GameController` 新增 `mouseAnimFrameSec`（默认 0.15）Inspector 属性与 `applyRatSkinFrames()`，在 `onLoad` 完成 BoardView 配置后异步注入；老鼠节点回收 / `rebuildMap` / `setMouseSkinFrames` 三处都会清空 `ratState`，避免与对象池复用产生残留旧动画。该皮肤随机与积分皮肤系统完全独立。
- 老鼠纵向方向映射修正：`applyRatSkinFrame` 中 `dy > 0`（屏幕往下）改取 `up/` 帧、`dy < 0`（屏幕往上）改取 `down/` 帧。实测用户提供的 `rat_skins/<skin>/up|down` 是按"老鼠看上去面朝哪边"命名，与游戏内运动方向相反；横向（left/right）保持鼻子方向与文件夹名一致。如未来重新出图改为"按运动方向"命名，把这两行 `nextDir = 'up'/'down'` 互换即可。

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
