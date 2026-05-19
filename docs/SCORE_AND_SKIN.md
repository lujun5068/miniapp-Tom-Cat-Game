# 积分 · 皮肤 · 微信能力

> 专题文档，描述当前实现的接口、存档结构、业务约束与已知限制。  
> 历史修复 / 变更记录请查阅 [`CHANGELOG.md`](./CHANGELOG.md)；整体架构请见 [`DESIGN_DOC.md`](./DESIGN_DOC.md)。

---

## 1. 积分规则

| 来源 | 奖励 | 频控 | 入账接口 |
|------|------|------|----------|
| 每日登录 | +10 | 每日 1 次（按本地日期） | `claimDailyLoginRewardIfNeeded()` |
| 通关 | +5 | 每局结算 | `addScore(5, '游戏胜利')` |
| 破关卡纪录 | +10 | 每次破纪录追加 | `addScore(10, '破关卡记录')` |
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
  visualTint: { r: number; g: number; b: number };
}
```

当前 4 个皮肤：`default`（免费，初始可用）/ `golden`（100）/ `ninja`（150）/ `pirate`（200）。`visualTint` 仍保留，用于在帧组之外叠加色调（也可作为 fallback 的最低可见反馈）。

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
- 应用：`GameController.applyCurrentCatSkin()` 同时设 `visualTint` 与异步触发 `applyCatSkinFrames(skinId)`；后者拿到帧后再次 `BoardView.configureCatFrameAnimations`，并在写入前用 `boardView.isValid` 防御场景切换导致的并发问题。
- 兑换：在个人中心点击"兑换"调用 `unlockSkin(skinId)`，成功后立刻调用 `setCurrentSkin(skinId)`。
- 切换：在已解锁的非当前皮肤上点击"使用"，调用 `setCurrentSkin(skinId)`；默认皮肤可重新切回但不展示兑换按钮。
- 生效时机：玩家从个人中心返回主场景时（`loadMainGameScene()`）主场景会重新 `onLoad` → `applyCurrentCatSkin` → 加载新皮肤帧；当前不支持主场景内热切换（也不必要，PersonalCenterPage 入口本身就是一次性的离开 / 返回）。

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

1. **皮肤帧组体积较精简**：当前 `default / golden / ninja / pirate` 四套都是 `start` 1 帧 + `walk1` 5 帧 + `walk2` 4 帧 + `xuanyun` 2 帧的小动画；如需更连贯的待机 / 眩晕过渡，可往 `assets/resources/cat-skins/<skinId>/{start,xuanyun}/` 内补图，无需改代码。
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
