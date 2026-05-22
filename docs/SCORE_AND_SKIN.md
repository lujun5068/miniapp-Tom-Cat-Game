# 积分 · 皮肤 · 微信能力

> 专题文档，描述当前实现的接口、存档结构、业务约束与已知限制。  
> 历史修复 / 变更记录请查阅 [`CHANGELOG.md`](./CHANGELOG.md)；整体架构请见 [`DESIGN_DOC.md`](./DESIGN_DOC.md)。

---

## 1. 积分规则

| 来源 | 奖励 | 频控 | 入账接口 |
|------|------|------|----------|
| 每日登录 | 连续第 N 天 +N×10（最低 10；中断后从 10 重计） | 每日 1 次（按本地日期） | `claimDailyLoginRewardIfNeeded()` |
| 通关 | +5 | 每局结算 | `addScore(5, '游戏胜利')` |
| 破关卡纪录 | +10 | 每次破纪录追加 | `addScore(10, '破关卡记录')` |
| 完美命中 | +5 / 只 | 本局仅统计**攻击冲撞路径**上捕获的老鼠数 `n`；胜 / 负均结算，无每日上限 | `addScore(n×5, '完美命中' / '完美命中×n')`；计数见 `GameSimulation.attackCatchCount` |
| 失败 | +2 | 每日最多 10 次（即每日最多 +20） | `addLoseReward(2, '游戏失败')` |
| 微信分享 | +10 | 每日 1 次，幂等（朋友 / 朋友圈共享额度） | `addShareReward()` |

入账规则：
- 当日首调用 / 跨日才会真正发放，重复调用安全返回 0。
- 任何来源都自动写入流水 `history`（最多保留最近 50 条）。
- 当日上限达到后弹窗 / UI 会显示对应提示文案，不再静默忽略。

## 2. 数据结构

存储 key 固定为 `cat-game-score-v1`（保留旧 key 兼容迁移），数据结构升级到 `version: 2`：

```typescript
// assets/scripts/game/ScoreManager.ts
type ScoreSaveV2 = {
  version: 2;
  availableScore: number;       // 当前可用积分（可消费余额）
  totalEarnedScore: number;     // 历史累计获得，仅增长不减
  lastLoginDate: string;        // 上次发放每日登录奖励的本地日期（YYYY-MM-DD）
  lastLoginPopupDate: string;   // 上次确认每日奖励弹窗的本地日期
  loginStreakDays: number;      // 当前连续登录天数（发放当日奖励后写入；隔日未登录则下次重置为 1）
  unlockedSkins: string[];      // 已解锁皮肤 ID（默认皮肤始终包含）
  currentSkin: string;          // 当前皮肤 ID
  history: ScoreHistoryEntry[]; // 最近积分流水（earn / spend）
  failureRewardDate: string;    // 当日失败积分入账日期
  failureRewardCount: number;   // 当日失败积分入账次数，达到 10 后不再入账
  shareRewardDate: string;      // 当日分享奖励入账日期（与今日相同即已发过）
};

type ScoreHistoryEntry = {
  id: string;
  type: 'earn' | 'spend';
  amount: number;
  reason: string;
  createdAt: string;            // ISO 8601 UTC 时间字符串
};
```

### 2.1 v1 → v2 迁移
- v1 仅记录余额 `totalScore` 与登录日期，没有"累计获得"信息。
- 迁移时把 v1 的 `totalScore` 同时作为 `availableScore` 与 `totalEarnedScore` 的初值；曾经获得 200 已花掉 100 的玩家迁移后只能看到累计 100，**这是不可逆的历史数据丢失**。
- 加载时若发现 `totalEarnedScore < availableScore` 会自动抬升到 `availableScore`，避免显示反转。

### 2.2 数据归一化
加载时会对所有字段做 sanitize：
- 非 `string` 的日期字段被置为 `''`
- 非 `Number.isFinite` 的数值被置为 0、负数截断为 0
- 非数组 / 非法皮肤 ID 被过滤，默认皮肤始终 `unlockedSkins` 中
- `currentSkin` 若未解锁则 fallback 到默认皮肤
- `history` 中字段不全的条目被丢弃，超过上限的截断

## 3. 公开接口

```typescript
ScoreManager.getInstance();                      // 仅加载存档，无业务副作用
scoreManager.claimDailyLoginRewardIfNeeded();    // 由 GameController.onLoad 显式调用
scoreManager.addScore(amount, reason);           // 通用入账
scoreManager.addLoseReward(amount, reason);      // 失败积分，带每日次数频控；返回实际入账积分
scoreManager.getLoseRewardRemainingToday();      // 当日失败积分剩余次数（用于 UI 提示）
scoreManager.addShareReward(reason?);            // 分享 +10、每日 1 次、幂等
scoreManager.canClaimShareRewardToday();         // 当日是否还可领取分享奖励
scoreManager.getTotalScore();                    // = availableScore
scoreManager.getTotalEarnedScore();              // = totalEarnedScore
scoreManager.getScoreHistory();                  // 复制返回，避免外部修改内部数组
scoreManager.unlockSkin(skinId);                 // 扣可用积分解锁；返回是否成功
scoreManager.setCurrentSkin(skinId);             // 切换当前皮肤；返回是否成功
scoreManager.getCurrentSkin();
scoreManager.getUnlockedSkins();
scoreManager.shouldShowLoginPopup();             // 配合 markLoginPopupShown 控制弹窗一日一次
scoreManager.markLoginPopupShown();
```

> 设计上构造函数严格无副作用，所以测试 / 工具脚本调用 `ScoreManager.getInstance()` 不会触发"加积分 + 写盘"，避免误写真实玩家存档。

---

## 4. 皮肤配置

`assets/scripts/game/skinConfig.ts`：

```typescript
export interface CatSkin {
  id: string;
  name: string;
  price: number;
  description: string;
  isDefault: boolean;
  category: string;                 // 共用音频组 key：cat / fox / boar / ...（见 §4.3）
  speedBuff: number;                // 从基础走路间隔中扣除的秒数（>0 即更快，见 §4.4）
  visualTint: { r: number; g: number; b: number };  // 仅 fallback 色块时生效（见说明）
}
```

当前 7 个皮肤：`default`（免费，初始可用）/ `ninja` / `pirate` / `fox` / `boar` / `wolf` / `ying`，价格 / 描述以 [`game/skinConfig.ts`](../assets/scripts/game/skinConfig.ts) `catSkins` 数组为准。

- `visualTint` **只在贴图加载失败、`BoardView` 回退到 entityGfx 色块圆点时生效**，作为最低可见反馈。贴图路径自 2026-05-21 起强制走 `CAT_SPRITE_NEUTRAL_TINT = (255,255,255)`，不再用 `Sprite.color` 做乘法染色（modulate 会把贴图整体压暗，正常情况下玩家根本看不到这个颜色）。后续若想让贴图也叠加皮肤色调，需要换成非 modulate 的混合方式（自定义 shader），不能直接复用 `Sprite.color`。详见 [`CHANGELOG.md`](./CHANGELOG.md) 2026-05-21 "修复非默认皮肤贴图整体偏暗"。

### 4.1 资源目录约定

```text
assets/resources/cat-skins/
└── <skinId>/
    ├── start/     待机 / 起始帧（至少 1 张）
    ├── walk1/     水平移动帧
    ├── walk2/     纵向移动帧
    └── xuanyun/   眩晕帧
```

- 位于 Cocos 约定的 `resources/` 内置 Bundle 下，运行时 `resources.loadDir('cat-skins/<skinId>/<action>', SpriteFrame, ...)` 拉取。
- 文件名兼容 `frame-NN.png` / `frame_NN_delay-0.2s.png` / `startN.png` 等命名（由 `BoardView.sortCatSpriteFrames` 按数字段排序）。
- 增加新皮肤时只需放图 + 在 `skinConfig.ts` 添加元数据，不需要改 `BoardView` 或 `GameController` 代码。
- **资源默认朝向约定（重要）**：`start / walk1 / xuanyun` 单帧请画成 **面朝右**；`walk2` 单帧请画成 **面朝上**。`BoardView` 在向左移动时左右翻转、向下移动时旋转 180°；如果资源朝向不符合约定，游戏内会出现猫头反向 / 行走方向不对的视觉问题（参见 [`CHANGELOG.md`](./CHANGELOG.md) 2026-05-19 "猫朝向修复" 条目）。
- **棋盘显示尺寸**：猫节点在 `BoardView.drawEntities` 中按 `tileSize` 估算半径再乘以 `CAT_DISPLAY_SCALE`（当前 1.5）。调大此常量会让猫整体更显眼，但会跨越 tile 边界；调小则更贴近 tile。

### 4.2 加载与切换流程

- 加载：`assets/scripts/game/catSkinLoader.ts` 暴露 `loadCatSkinFrames(skinId, fallback='default')`，按 4 个动作目录顺序加载；某动作目录加载失败 / 为空时自动回退到 `default` 同名目录。
- 应用：`GameController.applyCurrentCatSkin()` 同时设 `visualTint`（fallback 用，详见 §4 接口注释）、调用 `applyWalkSpeedConfig()` 把当前皮肤的 `speedBuff` 应用到走路冷却（见 §4.4）、异步触发 `applyCatSkinFrames(skinId)` 与 `applyCatSkinAudio(category)`（见 §4.3）；前者拿到帧后再次 `BoardView.configureCatFrameAnimations`，并在写入前用 `boardView.isValid` 防御场景切换导致的并发问题。
- 兑换：在个人中心点击"兑换"调用 `unlockSkin(skinId)`，成功后立刻调用 `setCurrentSkin(skinId)`。
- 切换：在已解锁的非当前皮肤上点击"使用"，调用 `setCurrentSkin(skinId)`；默认皮肤可重新切回但不展示兑换按钮。
- 生效时机：玩家从个人中心返回主场景时（`loadMainGameScene()`）主场景会重新 `onLoad` → `applyCurrentCatSkin` → 加载新皮肤帧 + 音频；当前不支持主场景内热切换（也不必要，PersonalCenterPage 入口本身就是一次性的离开 / 返回）。

### 4.3 皮肤音频资源约定

`CatSkin.category` 字段（`cat / fox / boar / ...`）决定使用哪一组皮肤特征音；**同 category 共用一组音**，节省资源（例如 `default / ninja / pirate` 都用 `cat/`）。

```text
assets/resources/cat-audios/
└── <category>/
    ├── start.m4a   关卡开始 / 出场，对应 onLevelStart
    ├── jump.m4a    跳跃成功，对应 onJumpSuccess
    ├── attack.m4a  攻击成功，对应 onAttackSuccess
    └── stun.m4a    眩晕，对应 onStun
```

- 加载：`game/catAudioLoader.ts` 的 `loadCatSkinAudio(category, fallback='cat')` 异步加载 4 个 `AudioClip`，缺失自动回退到 `cat/` 同名音；都缺则返回 null。
- 注入：`GameController.applyCatSkinAudio(category)` → `CocosGameAudio.setSkinAudio(pack)` 写入 `skinClips` 覆盖层。
- 播放：`CocosGameAudio.playLevelStart / playJump / playAttack / playStun` 通过 `resolveSkinClip(action, fallback)` 取音，**优先用 skinClips、再回退到 Inspector 通用 clip**。
- 不受皮肤影响：
  - `sfxCatch / sfxWin / sfxLose / sfxUi` 4 个仍走 Inspector 通用 clip。
  - **主循环 BGM 已不在 Inspector**：移出到 `assets/audio-stream/bgm_main_loop.m4a` + 配套 `audio-stream.meta`（`isBundle: true`，`compressionType.wechatgame: 'subpackage'`）。`GameController.applyStreamingBgm()` 在 `onLoad` 异步 `assetManager.loadBundle('audio-stream')` → `bundle.load('bgm_main_loop', AudioClip)` → `CocosGameAudio.setBgmClip(clip)`。`setBgmClip` 内部已处理"clip 注入时 BGM 已被用户开启 + 已 unlock 则立即播放"的时序。目的是把 ~490KB 的 BGM 从首包剥离到微信小游戏分包，详见 §6。
- 增加新 category：在 `assets/resources/cat-audios/` 下新建同名目录放 4 个 m4a 即可，无需改任何代码；`skinConfig` 中皮肤标记上该 category 后下次进入主场景即生效。
- 平台注意：微信小游戏部分机型对 m4a 解码兼容性差异较大，必要时把全部 m4a 转 mp3 重新导入（同名 + 同 meta uuid 即可，`resources.load('cat-audios/cat/start', AudioClip)` 路径不含后缀）。

### 4.4 皮肤移速 buff

`CatSkin.speedBuff` 字段（单位：秒，>= 0）让每个皮肤可以拥有不同的走路速度。

- **计算公式**：实际下发给 `GameSimulation.walkRepeatIntervalSec` 的值 = `max(Inspector.walkRepeatIntervalSec − speedBuff, MIN_WALK_REPEAT_INTERVAL_SEC)`。`walkRepeatIntervalSec` 是「下一格之间的最小逻辑间隔」，值越小走得越快，所以 `speedBuff` 越大越快。
- **基础间隔**：`GameController.walkRepeatIntervalSec` 是 Inspector 配置（默认 0.045，`scene-001.scene` 当前设为 0.08），代表「无任何皮肤加成时的基础节奏」。
- **下限兜底**：`assets/scripts/game/simulation.ts` 的 `MIN_WALK_REPEAT_INTERVAL_SEC = 0.005`。扣减后小于该值会贴齐下限，避免出现 0 / 负值把 `actionCooldown` 逻辑打穿；实际 60fps 下硬上限约 30 格/秒，再小也不会更快。
- **当前配置（参考）**：`fox` 0.02 最快 · `boar / wolf / ying` 0.015 · `ninja / pirate` 0.005 · `default` 0。
- **应用入口**：`GameController.applyWalkSpeedConfig()` 读取 `scoreManager.getCurrentSkin()` 拿到当前皮肤后做上述计算并下发；`onLoad` 初始化时调用一次，`applyCurrentCatSkin` 内也调用一次（覆盖未来场景内热切换皮肤的场景）。
- **生效时机**：与皮肤帧组 / 音频同步，玩家从个人中心切皮肤回主场景 → `onLoad` 即生效，无需重启小游戏。
- 注意：本字段**只影响走路节奏**，跳跃 / 攻击自身的 cooldown 是固定的 0.088 / 0.25s，不受 `speedBuff` 影响。

---

## 5. 个人中心页面

### 5.1 场景与分包
- 场景：`assets/personal-center/PersonalCenterPage.scene`
- 脚本：`assets/scripts/PersonalCenterPage.ts`
- Bundle：`assets/personal-center/`（由 `assets/personal-center.meta` 配置 `userData.compressionType.wechatgame = 'subpackage'`，其他平台 `merge_dep`）
- 路由：`sceneRoutes.loadPersonalCenterScene()` / `loadMainGameScene()`

进入路径：主游戏 → 左侧"个人中心"按钮 → 写盘保存当前进度 → `assetManager.loadBundle('personal-center')` → `bundle.loadScene('PersonalCenterPage')` → `director.runScene`。  
返回路径：个人中心顶部"返回"按钮 → `loadMainGameScene()`，主场景重新 `onLoad` 并从存档恢复进度。

### 5.2 页面布局
- **顶部导航**：标题 + 返回按钮。
- **当前积分卡片**（高度 144，圆角 18）：
  - 左侧大数字显示 `availableScore`
  - 中部 stat pill：`累计获得 N` / `已解锁皮肤 X/Y`，宽度按卡片可用区动态计算
  - 右侧"积分详情"按钮，点击打开积分流水弹窗
  - 底部小字提示：动态文案
    - 未领取分享奖励：`每日将游戏分享给微信好友或群聊可获得额外积分奖励！`
    - 已领取：`今日分享奖励已领取，明天再来分享可继续获得 +10`
- **皮肤商店卡片**：按可用宽度自适应网格，最多 4 列；每张皮肤卡片包含预览、名称、描述、价格 / 状态、兑换 / 使用按钮。
  - 预览块（48×48）：底层 `Graphics` 画圆形底 + 状态边框（当前皮肤 honey 高亮、已解锁默认描边、未解锁灰色），上层 `Sprite` 显示 `resources/cat-skins/<skinId>/start/` 第一帧；通过 `catSkinLoader.loadCatSkinStartFrame(skinId)` 异步加载并由 `skinPreviewCache` 缓存避免重复读盘；未解锁皮肤贴图按灰色 + 半透明渲染。
- **积分流水弹窗**：点击"积分详情"打开，模态遮罩 + 滚动列表，关闭时彻底销毁不留节点。

### 5.3 UI 稳定性
- `clearPageChildren` 销毁 Canvas 下除 `Camera` 外的所有动态子节点，防止 overlay 节点泄漏。
- `lateUpdate` 中遍历 `scrollAreas` 时跳过 `!isValid` 节点并周期 compact，避免弹窗销毁后访问已销毁组件。
- `destroyOverlay` 在销毁 overlay 的同时把其内部的 `ScrollAreaState` 引用从 `scrollAreas` 中移除。

---

## 6. 微信分享

`assets/scripts/storage/wechatShare.ts` 封装 wx 分享 API：

```typescript
setupWechatShare({
  title: '...',
  query: '...',
  imageUrl?: '...',
  onShareSuccess?: (channel: 'message' | 'timeline') => void,
});
```

- 在 `WECHAT` 为真且全局 `wx` 存在时注册 `showShareMenu` / `updateShareMenu` / `onShareAppMessage` / `onShareTimeline`。
- 接入 `onShareSuccess` 后，主游戏与个人中心都把它桥接到 `ScoreManager.addShareReward`：朋友 + 朋友圈共享同一份"每日 1 次"额度，由 `addShareReward` 内部按 `shareRewardDate` 幂等保证。
- 个人中心入账成功后立即 `refreshScoreCard()` 让积分卡片与底部分享提示文案同步刷新。

---

## 7. 当前保留限制

1. **皮肤帧组体积较精简**：5 套皮肤（`default / ninja / pirate / fox / boar`）大多是 `start` 1 帧 + `walk1` 5–6 帧 + `walk2` 4–6 帧 + `xuanyun` 2 帧 + `attack` 5 帧（`fox` 暂未提供 attack，运行时自动复用其 walk1）的小动画；如需更连贯的待机 / 眩晕 / 攻击过渡，可往 `assets/skin-pack/cat-skins/<skinId>/{start,xuanyun,attack}/`（或 default 走 `resources/cat-skins/default/...`）内补图，无需改代码。
2. **失败积分反作弊较简单**：仅按"每日入账次数 ≤ 10"做频控，没有最低游戏时长 / 单局有效输入次数门槛；如出现自动化挂机失败需要再叠加策略。
3. **积分流水非审计账本**：只保留最近 50 条，超出会被截断；不适合作为对账依据。
4. **本地存档可被篡改**：积分系统纯客户端实现，未做存档签名 / 服务端校验。后续如果接入排行榜、活动奖励、账号体系或付费内容再考虑加防护。
5. **个人中心返回会重载主场景**：依赖进入个人中心前的写盘恢复进度；如果未来需要无缝回到暂停点，需要引入更完整的运行态保存或覆盖式页面方案。

---

## 8. 自检清单

发布前 / 每次大改后建议至少回归这几条（详细发布自检表见 [`PROJECT_STATUS.md`](./PROJECT_STATUS.md)）：

- 跨日测试每日登录积分入账与弹窗各只出现一次。
- 连续失败 10 次后，第 11 次弹窗显示"已达今日失败积分上限"，且实际积分不再增加。
- 当日首次分享后积分 +10、卡片底部提示切换为"已领取"；再次分享不重复入账。
- 进入个人中心 → 兑换皮肤 → 返回主游戏 → 再进个人中心，确认皮肤状态、积分、分享文案、scroll area 均正常。
- 微信小游戏构建：`personal-center` Bundle 进入 subpackage、首包减小；存档与音频开关跨进程保持。

---

## 9. 老鼠皮肤（纯视觉，与积分无关）

老鼠皮肤是地图上的视觉装饰，**不与积分 / 玩家拥有皮肤挂钩**：每只老鼠首次出现时由 `BoardView` 用 `Math.random()` 按 id 稳定地随机分配一种皮肤，并按移动方向播放对应帧动画。玩家无法选择、不能解锁、不会写入存档。

### 9.1 资源目录约定

```text
assets/resources/rat_skins/
└── <skinId>/                # 当前 4 套：black / brown / dark_brown / white
    ├── up/    1.png 2.png 3.png
    ├── down/  1.png 2.png 3.png
    ├── left/  1.png 2.png 3.png
    └── right/ 1.png 2.png 3.png
```

- 帧贴图**自带方向**，渲染层不会再做 `setScale` 翻转或旋转。
- 文件名按内部数字段排序（`1.png` / `frame-01.png` 等都兼容）。
- 增加 / 删除皮肤：在 `ratSkinLoader.RAT_SKIN_IDS` 增删对应 id 再丢资源即可，无需改 `BoardView` 或 `GameController` 代码。
- **方向命名约定（重要）**：当前资源 `left/`、`right/` 中的老鼠鼻子方向与文件夹名一致（向左 / 向右移动直接用同名目录）；`up/`、`down/` 按"老鼠看上去面朝哪边"命名，**与游戏内运动方向相反**——即 `BoardView` 在屏幕往下走时取 `up/` 帧、屏幕往上走时取 `down/` 帧（详见 `applyRatSkinFrame` 注释，未来若改为"按运动方向"命名只需互换两行）。如新增皮肤建议沿用同一约定，避免方向乱套。

### 9.2 运行时流程

- 加载：`game/ratSkinLoader.ts` 暴露 `loadAllRatSkinFrames()`，一次性遍历 4 皮肤 × 4 方向 × N 帧并按数字排序。
- 注入：`GameController.applyRatSkinFrames()` 在 `onLoad` 完成 BoardView 配置后异步调用，把 `RatSkinPack` 写入 `BoardView.setMouseSkinFrames({ pack, frameDurationSec: mouseAnimFrameSec })`。
- 渲染：`BoardView.drawEntities` 若 `hasAnyRatSkinFrames()` 为真则走方向动画分支：
  - 每只老鼠 id 首次出现时随机分配 `skin`、默认方向 `right`、`animTime/frameIndex` 归零；
  - 后续每帧按 `dx/dy` 计算下一方向（无位移保持原方向），方向变化时立刻把 `animTime/frameIndex` 归零防止串帧；
  - 按 `dt` 累加 `animTime`，超过 `ratAnimSecPerFrame` 就推进 `frameIndex` 并循环；
  - 当前方向缺帧时按"其它方向 → 单帧 `sfMouse`"顺序回退。
- 清理：`ratState` 在 `rebuildMap` / 老鼠节点对象池回收 / `setMouseSkinFrames` 三处清空，避免与节点对象池复用产生残留旧动画。

### 9.3 与猫皮肤的区别

| 维度 | 猫皮肤 | 老鼠皮肤 |
| --- | --- | --- |
| 玩家可选 | 是（个人中心兑换 / 切换） | 否（随机分配） |
| 写入存档 | 是（`unlockedSkins` / `currentSkin`） | 否 |
| 帧方向处理 | 资源默认朝右 / 朝上，渲染层翻转 + 旋转 | 资源自带 4 方向，渲染层不翻转 |
| 配置入口 | `skinConfig.ts` + 个人中心 | `ratSkinLoader.RAT_SKIN_IDS` |

---

## 10. 首包瘦身与分包策略

### 10.1 当前已分包 Bundle

| Bundle 名 | 目录 | 主要内容 | wechatgame compressionType | 加载入口 |
| --- | --- | --- | --- | --- |
| `personal-center` | `assets/personal-center/` | `PersonalCenterPage.scene` | `subpackage` | `sceneRoutes.loadPersonalCenterScene()` |
| `audio-stream` | `assets/audio-stream/` | `bgm_main_loop.m4a` (~490KB) | `subpackage` | `GameController.applyStreamingBgm()` |
| `skin-pack` | `assets/skin-pack/` | `cat-skins/{ninja,pirate,fox,boar}` + `cat-audios/{fox,boar}` | `subpackage` | `catSkinLoader.loadSkinPackBundle()` / `catAudioLoader.loadSkinPackBundle()` |
| `resources`（默认 Resources Bundle） | `assets/resources/` | `cat-skins/default/`、`cat-audios/cat/`、`rat_skins/` | （默认随首包） | `resources.load*` |
| `internal` / `start-scene` / `main` | Cocos 自动生成 | 引擎依赖 + 主场景 + 公共脚本 | （首包） | — |

> Bundle 内只包含**该目录树内**的资源；外部资源（脚本、被场景引用的图 / 音）默认仍在主包。仅把场景丢进 bundle 目录而引用的脚本 / 资源散在外面，则分包目录会非常小、首包不会瘦身。
>
> **重要**：`.meta` 里写的 `compressionType.wechatgame: 'subpackage'` 字段 Cocos Creator 在构建时**不会自动读取**——必须在 Creator 资产管理器选中目录后，右侧 Inspector 里手动把"压缩类型"下拉框改为「小游戏分包」并保存，构建才会真的输出到 `build/wechatgame/subpackages/`。

### 10.2 BGM 分包工作流程（`audio-stream`）

1. 资源位于 `assets/audio-stream/bgm_main_loop.m4a`（uuid 保留 `20a59def-...`，不改避免历史引用断链）。
2. `assets/audio-stream.meta` 配 `userData.isBundle: true`、`bundleName: 'audio-stream'`、`compressionType.wechatgame: 'subpackage'`、其他平台 `merge_dep`。
3. `scene-001.scene` 不再 reference 该 uuid（已删除 `clipBgmMain` 字段），构建依赖图不会把 bgm 拖回主场景 bundle。
4. `GameController.applyStreamingBgm()` 在 `onLoad` 中异步：`assetManager.loadBundle('audio-stream')` → `bundle.load('bgm_main_loop', AudioClip)` → `gameAudio.setBgmClip(clip)`；失败仅 `console.warn`，BGM 静默不影响游戏。
5. `CocosGameAudio.setBgmClip` 写入 `bgm.clip` 并视 `bgmEnabled && unlocked` 决定是否立即播放，所以"分包加载完成"与"首次用户手势"先后顺序都能 work。

### 10.3 皮肤分包工作流程（`skin-pack`）

`skin-pack` 同时承载非默认猫皮肤帧 + 非 `cat` category 的猫音效，由 `catSkinLoader.ts` 与 `catAudioLoader.ts` 各自维护句柄缓存共同使用同一份分包内容。

**资源边界**

| 类型 | 留在 `resources/`（首包） | 移到 `skin-pack/`（分包） |
| --- | --- | --- |
| 猫帧 | `cat-skins/default/` | `cat-skins/{ninja,pirate,fox,boar}/` |
| 猫音效 | `cat-audios/cat/` | `cat-audios/{fox,boar}/` |
| 老鼠帧 | `rat_skins/`（全） | — |

> 保留 `default` + `cat` 在 `resources/` 是兜底底线：任何"分包没下到 / 没勾选 / 配置错误"的极端情况，玩家仍能用默认皮肤跑完所有关卡，不会黑屏 / 卡机。

**加载流程**（适用于猫皮肤帧 / 猫音效两类）

1. 调用方仍是 `loadCatSkinFrames(skinId)` / `loadCatSkinAudio(category)`，签名零变化。
2. Loader 内部根据 `skinId === 'default'` / `category === 'cat'` 路由到 `resources` 或 `skin-pack` Bundle。
3. 首次访问非默认皮肤时通过 `skinPackBundlePromise`（模块级单例）触发 `assetManager.loadBundle('skin-pack')`，整个会话只下载一次；同模块内后续 `loadDir / load` 调用全部命中缓存。
4. 失败级联兜底：
   - 单文件缺 → 同 category 下一个；
   - 该 category 4 个全缺 → fallback 到 `default` 帧 / `cat` 音；
   - `skin-pack` Bundle 整体加载失败（网络异常 / 分包未上传）→ 等价于"4 个全缺"，自动走兜底；
   - 兜底也没有 → 返回 null / 空数组，由 `BoardView` 用单帧 `sfCat` 或 `CocosGameAudio.resolveSkinClip` 用通用 Inspector clip。
5. 用户体验：进入主场景默认皮肤时不触发分包下载；切换到非默认皮肤或进入个人中心查看预览时才下载（5 个非默认预览只触发一次）。

### 10.4 待施行优化（按性价比排序）

按 `build/wechatgame/` 实测数据，主包剩余大头是 `cocos-js/` 与脚本 `src/`：

| 候选项 | 预计减小 | 落地位置 |
| --- | --- | --- |
| Cocos 引擎模块裁剪 | 100–300KB | 项目设置 → 功能裁剪（见 §10.5） |
| 按 bundle 拆分脚本 | 50–100KB | Creator 构建面板高级选项（开启后只被分包用到的脚本跟分包走） |
| 老鼠帧独立分包 | ~80KB | 当前老鼠帧固定 4 套都加载，玩家无法选；如未来扩展为皮肤化才有必要做 |
| 字体子集 / 压缩 | 取决于字体 | 当前未使用自定义字体，无优化空间 |

### 10.5 Cocos 引擎模块裁剪指引（必须在 Creator UI 里操作）

| 步骤 | 操作 |
| --- | --- |
| 1 | Creator 顶部菜单 → 「项目」→「项目设置」 |
| 2 | 左侧选「功能裁剪」（旧版叫"模块设置 / Engine Modules"） |
| 3 | 关闭项目用不到的模块：3D（`primitive` / `terrain` / `light`）、`physics-2d/3d`（项目无物理）、`particle-2d/3d`、`spine`、`dragon-bones`、`tiled-map`、`video / webview`、`profiler`（生产环境）、`marionetter` 等。**保留**：`ui / ui-base / sprite / audio / animation / tween` |
| 4 | 「保存」→ Creator 会重新生成 `cocos-js` 编译产物 |
| 5 | 重新「构建发布 → wechatgame」**Build**（不是 Make），观察 `build/wechatgame/cocos-js/` 体积变化 |

> 保守做法：先一次只关 2-3 个明显无关的模块，预览跑一遍主场景 + 个人中心，确认没报"未定义符号"再继续关下一批。

### 10.6 构建发布面板分包配置自检

每次构建前在 Creator 构建发布面板里确认：

**包含的 Bundles**：勾选全部，包括 `personal-center / audio-stream / skin-pack / resources`。任何一个没勾选都不会被构建出来。

**主包压缩类型**：必须是「合并所有 JSON」（推荐）或「无压缩」。**绝对不能选「小游戏分包」**——主包本身不是 subpackage，选错会出现诡异的 `subpackages/main/` 0.6KB 空目录，且微信小游戏启动失败。

**各分包压缩类型**（在 Creator 资产管理器选中目录后，Inspector 右侧设置，**`.meta` 字段不被构建器读取，必须 UI 操作**）：

| 目录 | 压缩类型 | 备注 |
| --- | --- | --- |
| `assets/personal-center` | **小游戏分包** | 个人中心 scene |
| `assets/audio-stream` | **小游戏分包** | BGM |
| `assets/skin-pack` | **小游戏分包** | 非默认皮肤帧 + 非 cat 音效 |
| `assets/resources` | 合并所有 JSON | 默认 Resources Bundle，**不能改成分包**否则 `resources.load*` 失效 |

**构建后核对**（PowerShell）：
```powershell
$b='C:\lujun-work\lujun-self\Tom-cat-game\Cocos-Tom_Cat\build\wechatgame'
Get-ChildItem -Directory "$b\subpackages" | ForEach-Object {
  $size = (Get-ChildItem -Recurse -File $_.FullName | Measure-Object Length -Sum).Sum
  '{0,10:N1} KB  {1}' -f ($size/1024), $_.Name
}
```

预期看到：`personal-center / audio-stream / skin-pack` 三个目录，**不应**出现 `main`。如出现 `main` 说明主包压缩类型还没改对。改完点「Build」（不是「Make」），让 manifest 重新生成。
