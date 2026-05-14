# 猫抓老鼠 · Cocos 微信小游戏移植 — 进度文档

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

- [x] `levelSave`：`sys.localStorage` 读写（编辑器预览可用）
- [x] `gameSession`：内存态与本局最佳、解锁关合并逻辑
- [x] `progress.ts`：`getEffectiveMaxUnlockedLevel`、`saveProgressToDisk`、`resetProgressOnDisk`
- [x] 结算弹窗 **× 关闭**：胜利时写盘并静默重置本关（与网页版 `bindEndModal` 行为一致）

### 2.3 表现层

- [x] `BoardView`：障碍/空地（`Graphics` 色块 **或** 四张地图 `SpriteFrame` 齐全时精灵铺格）；猫 / 鼠（圆点 **或** `sfCat` / `sfMouse` 单帧）
- [x] `CatMotionAnimator`：行走/跳/扑补间（坐标系与棋盘居中、Y 向上）
- [x] `GameConstants.BASE_TILE_PX = 40`（对齐原网页 `TILE`）

### 2.4 UI 与流程（运行时动态搭建）

- [x] 顶栏：音乐·开/关、音效·开/关、开始/暂停、下一关、重置进度、全部关卡
- [x] HUD：关卡、剩余时间、本关最佳、眩晕提示
- [x] 操作提示文案（键盘 + 摇杆 + 按钮）
- [x] 虚拟摇杆 + 跳跃 / 攻击按钮
- [x] 键盘：WASD / 方向键移动，空格跳跃，J 扑击
- [x] 胜负弹窗：标题/副标题、重玩、下一关、关闭逻辑
- [x] 选关弹窗：1–30 网格按钮，解锁状态与当前关高亮
- [x] 重置进度二次确认面板
- [x] `UiTheme` 配色 + 安全区 `Widget` 边距 + 可选全屏 `sfUiBg`（与 3.2 对齐 H5 观感）
- [x] `GameController` 文件头注释：在 **Canvas** 上挂载本组件即可预览

### 2.5 音频（`AudioSource` + 本地设置）

- [x] `storage/audioSettings.ts`：与网页版相同 key `cat-game-audio-v1`，`sys.localStorage` 读写
- [x] `audio/CocosGameAudio.ts`：子节点双 `AudioSource`（BGM 循环 + SFX `playOneShot`）
- [x] `GameController`：Inspector 中 `clipBgmMain` / `clipLevelStart` / `clipSfx*` 等槽位绑定 `AudioClip`
- [x] 顶栏切换音乐/音效、文案同步；首次触摸/按键解锁播放；对局 BGM 与暂停/胜负暂停；`setSoundHooks`、倒计时滴答、胜负音效、UI 点击音
- [x] **资源入库**：已导入 **`.m4a`** 音频并由 Creator 生成 `AudioClip`，在 **GameController** 各 `clip*` 上完成绑定即可（与网页版音效一一对应即可，扩展名不必相同）。

---

## 三、待办事项（建议顺序）

### 3.1 音频（收尾）

- [x] 导入工程并在 **GameController** 各 `clip*` 上绑定 `AudioClip`（当前资源为 **`.m4a`**，编辑器与浏览器预览通常可直接播放）
- [ ] **微信真机**：若个别机型无法解码 `.m4a`，请按[微信小游戏音频文档](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/audio.html)改用 **mp3** 等推荐格式后重新导入绑定
- [x] 顶栏「音乐·开/关」「音效·开/关」与 `AudioSource` 绑定及状态持久化
- [x] 关卡开始、倒计时 tick、胜负、操作 hooks、UI 点击等播放逻辑

### 3.2 美术与动画（高优先级，对齐 H5 观感）

- [x] 地图：`GameController` 提供 `sfMapFloor` / `sfMapEdge` / `sfMapStone1` / `sfMapStone2`；四张绑齐后 `BoardView` 用精灵铺格，否则色块占位（**贴图可后补**）
- [x] 猫 / 鼠：`sfCat`、`sfMouse` 单帧 `SpriteFrame`；未绑定时仍为圆点占位（**序列帧 / Spine / 方向帧可后补**）
- [x] UI 视觉：`UiTheme`（对齐 `src/style.css` 色板）+ 顶栏 / 结算弹窗 / 摇杆 / 大按钮 `styleRoundActionButton`；全屏底 `sfUiBg` 或 `UiTheme.bgFallback`
- [x] 安全区：`getSafeAreaInsets()` + 顶栏 / HUD / 底提示 / 摇杆与右侧按钮 `Widget` 边距；棋盘可用区 `layoutBoard` 叠加左右上下安全边距


### 3.3 微信小游戏发布（发布前必做）

- [ ] **构建发布** → 微信小游戏，配置 AppID、分包与首包大小
- [ ] 存储：`sys.localStorage` → **`wx.setStorage` / `getStorage`** 封装（或官方适配方案）
- [ ] 音频：与微信同时播放条数、自动播放策略对齐；**真机验证 `.m4a` 解码**（异常则改 **mp3** 等再绑定）
- [ ] 在开发者工具中固定 **最低基础库**（如 3.1.x）并真机回归
- [ ] 隐私协议、用户数据等按微信平台要求配置

### 3.4 工程与协作（中优先级）

- [ ] 将「挂载 GameController 的场景」纳入版本管理并设为启动场景（若尚未保存场景文件）
- [ ] 资源目录规范：`textures/`、`audio/`、`prefabs/` 等
- [ ] 需要时在 `docs/` 补充「场景节点树 / Prefab 说明」

### 3.5 可选优化（低优先级）

- [ ] 强横屏与分辨率策略与网页版 `style.css` 强横屏方案对齐
- [ ] 性能：老鼠数量上限、对象池（若上 Spine/大量粒子再评估）
- [ ] 国际化（若不需要可忽略）

---

## 四、快速运行（给新同事）

1. 使用 **Cocos Creator 3.8.8** 打开 `Cocos-Tom_Cat` 工程。  
2. 打开或新建 2D 场景，选中 **Canvas**。  
3. **添加组件 → `GameController`**，保存场景。  
4. 将已导入的 **AudioClip**（例如由 **`.m4a`** 生成）拖到 **GameController** 的 `clipBgmMain`、`clipLevelStart`、`clipSfxJump` 等属性上（与玩法一一对应即可）。  
5. （可选）将地图四张贴图、猫/鼠单帧、全屏底图拖到 `sfMapFloor` / `sfMapEdge` / `sfMapStone1` / `sfMapStone2`、`sfCat`、`sfMouse`、`sfUiBg`；不配则色块 + 主题底。  
6. 点击运行预览。

---

## 五、变更记录（手写维护）

| 日期 | 变更摘要 |
|------|----------|
| 2026-05-14 | 初版：核心逻辑 + 占位渲染 + 动态 UI + 本地存档（`sys.localStorage`） |
| 2026-05-14 | 音频：`CocosGameAudio` + `audioSettings`；顶栏开关与 `GameSimulation` hooks、倒计时与胜负音效 |
| 2026-05-14 | 音频资源：工程内使用 **`.m4a`** 导入；文档补充微信真机格式注意项 |
| 2026-05-14 | 3.2：`BoardView` 地图精灵 + `GameController` 贴图槽位；`UiTheme` / 安全区 / 全屏背景；贴图与序列动画可后补 |
