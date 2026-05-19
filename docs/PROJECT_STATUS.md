# 猫捕鼠冠军Tom · 小游戏设计文档

**引擎版本：** Cocos Creator **3.8.8**  
**文档更新说明：** 由开发过程整理；后续请在迭代时同步更新「已办 / 待办」。

---

## 一、环境与仓库

| 项 | 说明 |
|----|------|
| 工程路径 | `Tom-cat-game/Cocos-Tom_Cat/` |
| 目标平台 | 微信小游戏（最低基础库策略另见产品配置，建议 ≥ 3.1.x） |
| 脚本目录 | `assets/scripts/` |

---

## 二、已办事项

### 2.1 核心玩法（与网页版逻辑对齐）

- [x] 地图：`demoMap`（14×14 演示关）、`Grid.fromLines`（`#` / `.`）
- [x] 规则：`evalJump`、`evalAttack`、`catchMice`、眩晕时长等
- [x] 模拟：`GameSimulation`（计时、老鼠步进间隔随关卡、移动/跳/扑、胜负判定）
- [x] 生成：`spawnEntities`（猫鼠最小距离等）
- [x] AI：`stepAllMiceAwayFromCat`（BFS 距离场共用）
- [x] 关卡元数据：`MAX_LEVELS`、`MAX_MICE`、`mouseCountForLevel` 等

### 2.2 存档与进度

- [x] `levelSave`：键 `cat-game-level-v1`；读写经 `storage/platformKv`（编辑器 / 浏览器用 `sys.localStorage`，**微信小游戏**用 `wx.setStorageSync` 等）
- [x] `gameSession`：内存态与本局最佳、解锁关合并逻辑
- [x] `progress.ts`：`getEffectiveMaxUnlockedLevel`、`saveProgressToDisk`、`resetProgressOnDisk`
- [x] 结算弹窗 **× 关闭**：胜利时写盘并静默重置本关（与网页版 `bindEndModal` 行为一致）
- [x] `ScoreManager`：积分 v2 本地存档、每日登录奖励、胜负/破纪录奖励、皮肤兑换、当前皮肤和最近积分流水

### 2.3 表现层

- [x] `BoardView`：障碍/空地（`Graphics` 色块 **或** 四张地图 `SpriteFrame` 齐全时精灵铺格）；猫 / 鼠（圆点 **或** `sfCat` / `sfMouse`）；老鼠支持 **`sfMouseVertical`** 纵向贴图、**`mouseSpriteScale`** 显示缩放，位移时朝向与 `BoardView.drawEntities` 内翻转逻辑对齐
- [x] `CatMotionAnimator`：行走/跳/扑补间（坐标系与棋盘居中、Y 向上）
- [x] `GameConstants.BASE_TILE_PX = 40`（对齐原网页 `TILE`）

### 2.4 UI 与流程（运行时动态搭建）

- [x] 侧栏：左侧音乐·开/关、音效·开/关、个人中心；右侧开始/暂停、下一关、**全部关卡**（已移除「重置进度」入口；`progress.resetProgressOnDisk` 仍保留供将来或调试使用）
- [x] HUD：关卡、剩余时间、本关最佳、眩晕提示
- [x] 操作提示文案（键盘 + 摇杆 + 按钮）
- [x] 虚拟摇杆 + **圆形**跳跃 / 攻击按钮
- [x] 键盘：WASD / 方向键移动，空格跳跃，J 扑击
- [x] 胜负弹窗：标题/副标题、积分变化、重玩、下一关、关闭逻辑；**失败时仅重玩且行动条收窄居中**；结算 / 选关弹窗统一 `UiTheme` 高对比遮罩与面板描边（`MODAL_PANEL_*`、`paintModal*`）
- [x] 选关弹窗：1–30 网格；**面板宽度** `MODAL_LEVELS_PANEL_WIDTH` 与内边距下**动态格宽**防溢出；已解锁 / 未解锁底色与数字色区分（`levelPickLocked*`）
- [x] `UiTheme` 配色 + 安全区 `Widget` 边距 + 可选全屏 `sfUiBg`（与 3.2 对齐 H5 观感）
- [x] `GameController` 文件头注释：在 **Canvas** 上挂载本组件即可预览
- [x] `PersonalCenterPage`：独立个人中心场景，展示积分卡片、皮肤商店和积分流水详情弹窗；皮肤网格按宽度自适应，默认最多 4 列

### 2.5 音频（`AudioSource` + 本地设置）

- [x] `storage/audioSettings.ts`：与网页版相同 key `cat-game-audio-v1`；读写经 `storage/platformKv`（微信 `wx` 同步存储 / 否则 `sys.localStorage`）
- [x] `audio/CocosGameAudio.ts`：子节点双 `AudioSource`（BGM 循环 + SFX `playOneShot`）
- [x] `GameController`：Inspector 中 `clipBgmMain` / `clipLevelStart` / `clipSfx*` 等槽位绑定 `AudioClip`
- [x] 顶栏切换音乐/音效、文案同步；首次触摸/按键解锁播放；对局 BGM 与暂停/胜负暂停；`setSoundHooks`、倒计时滴答、胜负音效、UI 点击音
- [x] **资源入库**：已导入 **`.m4a`** 音频并由 Creator 生成 `AudioClip`，在 **GameController** 各 `clip*` 上完成绑定即可（与网页版音效一一对应即可，扩展名不必相同）。

---

## 三、待办事项（建议顺序）

### 3.1 音频（收尾）

- [x] 导入工程并在 **GameController** 各 `clip*` 上绑定 `AudioClip`（当前资源为 **`.m4a`**，编辑器与浏览器预览通常可直接播放）
- [x] **微信真机**：若个别机型无法解码 `.m4a`，请按[微信小游戏音频文档](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/audio.html)改用 **mp3** 等推荐格式后重新导入绑定
- [x] 顶栏「音乐·开/关」「音效·开/关」与 `AudioSource` 绑定及状态持久化
- [x] 关卡开始、倒计时 tick、胜负、操作 hooks、UI 点击等播放逻辑

### 3.2 美术与动画（高优先级，对齐 H5 观感）

- [x] 地图：`GameController` 提供 `sfMapFloor` / `sfMapEdge` / `sfMapStone1` / `sfMapStone2`；四张绑齐后 `BoardView` 用精灵铺格，否则色块占位（**贴图可后补**）
- [x] 猫 / 鼠：`sfCat`、`sfMouse`、**`sfMouseVertical`**（可空）、**`mouseSpriteScale`**（默认 1.5 等可在 Inspector 调）；未绑贴图时仍为圆点占位（**序列帧 / Spine 可后补**）
- [x] UI 视觉：`UiTheme`（对齐 `src/style.css` 色板）+ 顶栏 / 结算弹窗 / 摇杆 / 大按钮 `styleRoundActionButton`；全屏底 `sfUiBg` 或 `UiTheme.bgFallback`
- [x] 安全区：`getSafeAreaInsets()` + 顶栏 / HUD / 底提示 / 摇杆与右侧按钮 `Widget` 边距；棋盘可用区 `layoutBoard` 叠加左右上下安全边距


### 3.3 微信小游戏发布（发布前必做）

- [x] **构建发布**：Creator 菜单 **项目 → 构建发布**，发布平台选 **微信小游戏**，配置 **AppID**、首包与分包策略（首包体积见[微信文档](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/subPackage/useSubPackage.html)）
- [x] **存储**：已实现 `assets/scripts/storage/platformKv.ts` — 在 **`cc/env` 的 `WECHAT` 为真** 且存在 `wx` 时使用 **`wx.getStorageSync` / `setStorageSync` / `removeStorageSync`**；关卡存档 `levelSave.ts`、音频设置 `audioSettings.ts` 已改为经此读写（与网页版键名一致）。异步 `wx.setStorage` 若需可再包一层队列（当前同步 API 与原有 try/catch 语义一致）
- [x] 音频：与微信**同时播放实例数**、**用户触媒后**再播等策略对齐；**真机验证 `.m4a`**（异常则改 **mp3** 等再绑定，见 3.1）
- [x] 在微信开发者工具 **详情 → 本地设置** 或 **game.json** 中固定 **最低基础库**（建议 ≥ 3.1.x）并真机回归
- [x] **隐私与用户数据**：按[平台要求](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/privacy.html)配置用户隐私保护指引、必要接口声明等
- [x] **个人中心分包**：`PersonalCenterPage.scene` 已迁移到 `assets/personal-center/`，由 `assets/personal-center.meta` 配置为 wechatgame `subpackage`；Bundle 名 `personal-center` 由 `assets/scripts/game/sceneRoutes.ts` 中的 `PERSONAL_CENTER_BUNDLE` 维护，构建后该场景及其依赖会从首包剥离
- [x] **微信分享**：主游戏界面和个人中心页面通过 `storage/wechatShare.ts` 注册右上角分享菜单、会话分享和朋友圈分享

**3.3 自检（发布前打勾）**

| 项 | 说明 |
|----|------|
| 构建产物 | `build/wechatgame`（或所选输出目录）可导入微信开发者工具 |
| 存储 | 真机通关 / 改音频开关后杀进程再进，进度与开关应保持 |
| 音频 | 首次点击后 BGM/SFX 可播；无解码错误日志 |
| 合规 | 隐私弹窗、敏感 API 声明与审核材料就绪 |
| 分包 | `PERSONAL_CENTER_BUNDLE` 与构建发布中的 Bundle 名一致 |
| 分享 | 微信开发者工具和真机中右上角分享菜单可见，分享文案正确 |

### 3.4 工程与协作（中优先级）

- [x] 将「挂载 GameController 的场景」纳入版本管理并设为启动场景（若尚未保存场景文件）
- [x] 资源目录规范：`textures/`、`audio/`、`prefabs/` 等
- [x] 需要时在 `docs/` 补充「场景节点树 / Prefab 说明」

### 3.5 可选优化（低优先级）

- [x] 强横屏与分辨率策略与网页版 `style.css` 强横屏方案对齐
- [x] 性能：老鼠数量上限、对象池（若上 Spine/大量粒子再评估）
- [x] 国际化（若不需要可忽略）

---

## 四、快速运行（给新同事）

1. 使用 **Cocos Creator 3.8.8** 打开 `Cocos-Tom_Cat` 工程。  
2. 打开或新建 2D 场景，选中 **Canvas**。  
3. **添加组件 → `GameController`**，保存场景。  
4. 将已导入的 **AudioClip**（例如由 **`.m4a`** 生成）拖到 **GameController** 的 `clipBgmMain`、`clipLevelStart`、`clipSfxJump` 等属性上（与玩法一一对应即可）。  
5. （可选）将地图四张贴图、猫/鼠单帧、**老鼠纵向贴图**、全屏底图拖到 `sfMapFloor` / `sfMapEdge` / `sfMapStone1` / `sfMapStone2`、`sfCat`、`sfMouse`、**`sfMouseVertical`**、`sfUiBg`；按需调整 **`mouseSpriteScale`**；不配则色块 + 主题底。  
6. 点击运行预览。

---

## 五、变更记录（手写维护）

| 日期 | 变更摘要 |
|------|----------|
| 2026-05-14 | 初版：核心逻辑 + 占位渲染 + 动态 UI + 本地存档（`sys.localStorage`） |
| 2026-05-14 | 音频：`CocosGameAudio` + `audioSettings`；顶栏开关与 `GameSimulation` hooks、倒计时与胜负音效 |
| 2026-05-14 | 音频资源：工程内使用 **`.m4a`** 导入；文档补充微信真机格式注意项 |
| 2026-05-14 | 3.2：`BoardView` 地图精灵 + `GameController` 贴图槽位；`UiTheme` / 安全区 / 全屏背景；贴图与序列动画可后补 |
| 2026-05-14 | UI：移除重置入口；弹窗与按钮描边统一；关卡弹窗宽度与动态格子；老鼠纵向贴图 + 显示缩放；失败结算重玩居中 |
| 2026-05-14 | **3.3 部分**：`storage/platformKv.ts` + `levelSave` / `audioSettings` 对接微信 `wx` 同步存储；文档补充发布自检表 |
| 2026-05-14 | 微信小游戏构建：`profiles/v2/packages/wechatgame.json` 中 `orientation` 改为 **landscape**，生成 `game.json` 的 `deviceOrientation` 为横屏 |
| 2026-05-18 | 积分系统：新增每日登录、胜负/破纪录奖励、皮肤兑换、积分流水和本地 v2 存档 |
| 2026-05-18 | 个人中心：拆为独立场景 `PersonalCenterPage.scene`，支持 Bundle/分包加载、积分卡片、皮肤商店和积分详情弹窗 |
| 2026-05-18 | 微信能力：主游戏界面和个人中心页面接入微信分享菜单 |
| 2026-05-19 | 个人中心分包：场景迁移到 `assets/personal-center/` 并按 wechatgame `subpackage` 打包；`PERSONAL_CENTER_BUNDLE` 改为 `personal-center`；构建 profiles 中 `PersonalCenterPage.scene` 的 URL 同步更新；清掉 `scene.scene` 中残留的 `personalCenter*` 哑序列化字段 |
| 2026-05-19 | 个人中心稳定性：修复 `clearPageChildren` 仅销毁部分子节点导致的 overlay 节点泄漏；`lateUpdate` 跳过失效 ScrollArea 并周期 compact，避免历史弹窗关闭后访问已销毁组件抛错 |
| 2026-05-19 | UI 原子收敛：抽出 `ui/widgets.ts`，`GameController` 与 `PersonalCenterPage` 共用 `makeLabelButton / paintRoundRect / paintModal*` 等工具，删除两份重复实现 |
| 2026-05-19 | 个人中心 UI 微调：主滚动 content 锚点定位修正为固定 `vs.height/2`；积分卡片 stat pill 改为基于 `contentW` 动态计算；登录奖励弹窗改用统一 `UiTheme.modalPanelBg/Border` |
| 2026-05-19 | 路由统一：`sceneRoutes.ts` 新增 `loadMainGameScene` / `loadPersonalCenterScene`，`GameController` / `PersonalCenterPage` 不再各自拼装 Bundle 加载逻辑 |
| 2026-05-19 | 分享文案刷新：`PersonalCenterPage.refreshScoreCard` 后会重新 `setupWechatShare`，分享卡片随积分 / 解锁数实时更新 |
| 2026-05-19 | 失败积分频控：`ScoreManager.addLoseReward` 每日入账上限 10 次（+20 分/天），存档新增 `failureRewardDate/Count`；失败弹窗在达到上限时给出提示文案 |
| 2026-05-19 | 存储健壮性：`platformKv.decodeWxValue` 只接受字符串，避免遇到非预期类型时被 `JSON.stringify` 二次包装；清理 `PersonalCenterPage.updateScrollAreaSize` 死代码与 `BoardView.ts` 未使用的 `BatchNode` import |
