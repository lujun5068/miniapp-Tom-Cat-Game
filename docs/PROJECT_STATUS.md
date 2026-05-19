# 项目状态 · 路线图 · 发布自检

> 描述当前项目状态、迭代路线图与发布前自检；变更历史请见 [`CHANGELOG.md`](./CHANGELOG.md)。

---

## 1. 路线图（按 已完成 / 进行中 / 待办 分类）

每条尽量给出涉及的文件 / 模块，便于读者快速定位。  
**进行中**：代码已起步但还需要再投入；**待办**：尚未开工的预案。

### 1.1 游戏内容

#### 已完成
- 皮肤系统骨架：`game/skinConfig.ts` 定义皮肤元数据，`ScoreManager` 负责解锁 / 切换；当前阶段用 `visualTint` 区分外观。
- 关卡限时 + 难度梯度：每关 30 秒、关卡上限 30 关、老鼠数量与步进随关卡递增（`GameSimulation`）。

#### 进行中
- 皮肤美术资源接入：`assets/images/cat/skins/` 多套动画帧待补齐，`BoardView` 中按当前皮肤加载对应帧组的分支等资源就位再接（参考 [`SCORE_AND_SKIN.md`](./SCORE_AND_SKIN.md) §4）。

#### 待办
- 新关卡形式：特殊地图元素（传送门 / 陷阱）、Boss 关卡。
- 角色技能：加速 / 范围攻击等；带不同行为模式的老鼠。
- 新增模式：无尽 / 时间挑战 / 多人对战。

### 1.2 技术与稳定性

#### 已完成
- 代码模块化：`ui/widgets.ts` 共享 UI 原子；`game/sceneRoutes.ts` 集中场景跳转；积分系统集中在 `game/ScoreManager.ts` 并按职责拆出 `addLoseReward` / `claimDailyLoginRewardIfNeeded` / `addShareReward` 显式接口。
- 资源异步加载与首屏瘦身：个人中心通过 `assets/personal-center/` Bundle 打成 wechatgame subpackage，由 `assetManager.loadBundle` 按需拉取。
- 跨平台存储：`storage/platformKv.ts` 适配 `wx.*StorageSync` 与 `sys.localStorage`，`decodeWxValue` 严格只接受字符串，杜绝二次编码。
- BoardView 对象池：`spritePool` / `mousePool` 复用节点，关卡切换不再频繁创建销毁。

#### 进行中
- 性能数据采集：目前性能改造以定性结论为主，缺少 profiler 实测数据（见下方 §3 性能追踪 TODO）。
- 失败积分反作弊：每日次数频控已上线，更进一步的最低游戏时长 / 单局有效输入次数策略待评估。

#### 待办
- 单元测试与回归：`GameSimulation` / `ScoreManager` 等纯逻辑可优先补 Jest / Vitest 风格的单测，目前仓库无测试目录。
- 渲染深度优化：精灵图集、纹理压缩、自定义 shader、LOD 系统、资源预加载等长期备选，目前未观察到瓶颈。
- 多端适配：iOS / Android / PC 客户端目前未单独打包，仅 H5 / 微信小游戏路径走过。

### 1.3 用户体验

#### 已完成
- 弹窗（结算 / 关卡列表 / 登录奖励）共用 `UiTheme.modalPanelBg / Border + MODAL_PANEL_CORNER_RADIUS`。
- 微信分享：主游戏 + 个人中心接入 `wechatShare.ts`；个人中心刷新积分后会重新调用 `setupWechatShare` 同步分享文案。
- 个人中心 UI 细节：积分卡片 stat pill 随宽度自适应、主滚动锚点修正、皮肤商店按宽度分列、分享提示动态文案。

#### 进行中
- 音效 / 音乐扩展：当前只有主循环 BGM + 基础音效，关卡专属 BGM、更丰富反馈音效暂未规划。

#### 待办
- 过渡动画：场景切换、弹窗出现 / 关闭、按钮反馈等过渡动画偏简单。
- 社交闭环：排行榜、成就、邀请分享回流等深度社交能力，等待是否上线服务端再决定。

### 1.4 商业化

#### 已完成
- 本地积分经济雏形：每日登录 / 胜负结算 / 破纪录 / 分享的积分入账与皮肤兑换全链路打通，可在客户端纯本地完成验证。

#### 待办
- 广告 / 内购 / 品牌合作：均未启动，需先有稳定留存与服务端账号体系再考虑接入。

---

## 2. 发布自检（微信小游戏）

发布前请按下面 checklist 逐项确认。

### 2.1 构建发布
- [ ] Cocos Creator → **项目 → 构建发布** → 平台选择 **微信小游戏**，AppID、首包 / 分包策略均按产品配置。
- [ ] 构建产物 `build/wechatgame`（或所选输出目录）可被微信开发者工具导入。
- [ ] `personal-center` 在构建报告中作为独立 subpackage 出现，首包不包含其场景与依赖。

### 2.2 运行时
- [ ] 真机通关 / 改音频开关后**杀进程再进**，关卡进度 + 音频设置均保留。
- [ ] 首次点击 / 按键后 BGM + SFX 可播；无解码错误日志（如 `.m4a` 异常请换 `.mp3` 重绑）。
- [ ] 进入 → 退出 → 再进个人中心，皮肤、积分、scroll area 均正常；多次进入不出现 overlay 节点泄漏。
- [ ] 右上角分享菜单可见，分享文案符合预期；分享回调内当日 +10 只入一次。

### 2.3 合规
- [ ] 在微信开发者工具 **详情 → 本地设置** 或 `game.json` 中固定 **最低基础库**（建议 ≥ 3.1.x）并真机回归。
- [ ] 配置用户隐私保护指引、必要接口声明等（参考[平台要求](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/privacy.html)）。

### 2.4 关键常量校对
- [ ] `sceneRoutes.PERSONAL_CENTER_BUNDLE === 'personal-center'`，与 `assets/personal-center.meta` 的 `userData.bundleName` 一致。
- [ ] `settings/v2/packages/scene.json` 的 `current-scene` UUID 指向 `scene-001.scene`。
- [ ] `profiles/v2/packages/wechatgame.json` 的 `orientation = landscape`。

---

## 3. 性能追踪 TODO

当前性能改造以定性结论为主（对象池、子场景切换、Bundle 分包、widget 复用、`scrollAreas` 防御等），尚未在微信开发者工具 / Cocos Profiler 中收集 Before / After 的定量指标。在外发前建议按下表填齐数据：

| 指标 | 采集方式 | 当前数据 | 建议目标 |
|------|----------|----------|----------|
| 主场景节点数（进入个人中心前 vs 进入后） | Cocos `Profiler` 节点统计 / `director._scene._children.length` | 未采集 | 个人中心切换后主场景节点应释放至 0（场景被替换） |
| 主场景 + 个人中心 draw call | Cocos Profiler stats 面板 | 未采集 | 两个场景的 draw call 独立，个人中心 ≤ 50 |
| 微信小游戏首包体积（personal-center subpackage 拆出前后对比） | 微信开发者工具 → 构建 → 包体大小 | 未采集 | personal-center 完整体积进入 subpackage，首包减少其全部大小 |
| 进入 / 退出个人中心耗时 | `performance.now()` 包裹 `loadPersonalCenterScene` 与 `loadMainGameScene` | 未采集 | 真机首次进入 < 1s（含 subpackage 下载），二次进入 < 300ms |
| 结算前后内存增量 | 多次结算后 Profiler 内存采样 | 未采集 | 单次结算前后内存差异接近 0（弹窗销毁后归位） |

采集步骤建议：1) 在微信开发者工具中按表格指标各跑一次；2) 把数据填进对应行；3) 数据填齐后，可在 [`CHANGELOG.md`](./CHANGELOG.md) 中追加一条"性能基线已建立"。

---

## 4. 短期优先级

按当前情况，下一步建议（按优先级排序）：

1. 把 §3 表格中的 profiler 数据采到 ≥ 3 项，给出真实的首包瘦身数据与个人中心 draw call 基线。
2. 补 `ScoreManager` / `GameSimulation` 的单元测试（纯逻辑、无 Cocos 依赖，可走 Vitest）。
3. 完成多套皮肤的美术资源接入并把 `BoardView.configureCatFrameAnimations` 的皮肤分支接通。
4. 评估失败积分反作弊是否需要叠加最低游戏时长策略；视需要在 `addLoseReward` 之前加一道 `GameSimulation` 提供的"本局有效输入"判断。

更长期（排行榜、成就、商业化）需先决定是否引入服务端再启动。

---

## 5. 快速运行（新同事入门）

1. 用 **Cocos Creator 3.8.8** 打开 `Cocos-Tom_Cat` 工程；等待资源导入与脚本编译。
2. 打开 `assets/scene-001.scene`（启动场景）。
3. 确认 `Canvas` 节点已挂载 `GameController` 组件。
4. 在 Inspector 中检查贴图 / 音频资源绑定（参考根目录 `README.md` § 运行预览）。
5. 点击 Creator 顶部预览按钮，或在微信开发者工具中导入 `build/wechatgame` 调试。
