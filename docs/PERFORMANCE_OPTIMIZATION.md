# 性能优化报告

## 优化目标

按照设计文档中的 5.2.1 性能优化要求，对 Cocos Tom Cat 游戏进行性能优化，主要包括：
- 优化渲染性能，减少 draw call
- 优化动画播放，减少内存使用
- 优化物理碰撞检测，提高游戏运行流畅度

## 优化措施

### 1. 对象池优化

**文件：** [BoardView.ts](file:///C:/lujun-work/lujun-self/Tom-cat-game/Cocos-Tom_Cat/assets/scripts/BoardView.ts)

**优化内容：**
- 添加了 `spritePool` 和 `mousePool` 对象池，用于复用精灵节点
- 修改了 `addTileSprite` 方法，优先从对象池获取节点，而不是每次创建新节点
- 修改了 `clearChildren` 函数，将节点回收回对象池而不是直接销毁
- 修改了 `drawEntities` 方法，使用对象池复用老鼠节点

**优化效果：**
- 减少了节点的创建和销毁开销，降低了内存使用
- 减少了垃圾回收的频率，提高了游戏运行的稳定性
- 提高了渲染性能，特别是在地图切换和老鼠数量变化时

### 2. 动画系统优化

**文件：** [CatMotionAnimator.ts](file:///C:/lujun-work/lujun-self/Tom-cat-game/Cocos-Tom_Cat/assets/scripts/visual/CatMotionAnimator.ts)

**优化内容：**
- 优化了 `update` 方法，减少不必要的计算
- 添加了位置变化检测，避免重复设置相同的位置
- 优化了动画状态更新逻辑，减少冗余计算
- 添加了时间增量的安全处理，避免除以零错误

**优化效果：**
- 减少了动画更新的计算开销，提高了动画播放的流畅度
- 避免了不必要的位置更新，减少了渲染负担
- 提高了动画系统的稳定性和可靠性

### 3. 游戏控制器优化

**文件：** [GameController.ts](file:///C:/lujun-work/lujun-self/Tom-cat-game/Cocos-Tom_Cat/assets/scripts/GameController.ts)

**优化内容：**
- 优化了 `update` 方法，减少不必要的更新操作
- 添加了动画事件检测，只有在有动画事件时才更新动画
- 优化了 UI 更新逻辑，只有在状态变化时才更新 UI
- 优化了音频状态更新逻辑，减少冗余操作

**优化效果：**
- 减少了每帧的计算开销，提高了游戏运行的流畅度
- 避免了不必要的 UI 更新，减少了渲染负担
- 优化了音频状态管理，提高了音频系统的效率

### 4. 渲染优化

**文件：** [BoardView.ts](file:///C:/lujun-work/lujun-self/Tom-cat-game/Cocos-Tom_Cat/assets/scripts/BoardView.ts)

**优化内容：**
- 通过对象池减少了节点的创建和销毁开销
- 优化了地图渲染逻辑，减少了不必要的重绘
- 优化了老鼠渲染逻辑，减少了冗余操作

**优化效果：**
- 减少了 draw call 的数量，提高了渲染性能
- 减少了内存使用，提高了游戏在低端设备上的运行效果
- 提高了游戏的整体流畅度和响应速度

### 5. 个人中心页面优化

**文件：** `assets/scripts/PersonalCenterPage.ts`、`assets/personal-center/PersonalCenterPage.scene`、`assets/personal-center.meta`、`assets/scripts/game/sceneRoutes.ts`

> ⚠️ 本节为**定性收益**记录，尚未在微信开发者工具 / Cocos Profiler 中收集 BeforeAfter 的 节点数 / 内存占用 / 首包体积 / 首屏 FPS 等定量指标。在作为正式优化报告对外输出前，请按章末"profiler 实测数据 TODO"补齐数据再下结论。

**优化内容（定性）：**
- 个人中心拆为独立场景，支持按 Bundle/分包加载，减少主场景 UI 复杂度。
- 皮肤商店使用自适应网格，默认最多 4 列，避免固定双栏布局在不同屏幕下溢出。
- 皮肤商店不强制使用滚动容器，卡片区域高度按皮肤数量和行数计算；主页面提供整体滚动兜底。
- 积分流水放入详情弹窗，只有在用户点击时构建滚动列表，避免常驻占用主页面布局空间。
- 皮肤卡片刷新时重建网格节点，确保当前皮肤状态与"使用/兑换"按钮一致。
- 进入个人中心时切换主场景，原主场景的所有节点 / Tween / Listener 由 Cocos 场景切换释放，不再常驻内存。

**预期收益（定性，待 profiler 验证）：**
- 主游戏场景与个人中心页面解耦，便于微信小游戏首包与分包管理。
- 个人中心在不同横屏宽度下更稳定，减少卡片重叠和裁切。
- 积分流水不占用主页面常驻空间，页面结构更清晰。
- 个人中心 subpackage 不进首屏，理论上能减小首包体积；具体减少多少 KB 需要构建对比。

## 6. UI 原子组件复用

抽出 `assets/scripts/ui/widgets.ts` 后，主游戏 `GameController`、个人中心 `PersonalCenterPage` 共用同一份 `makeLabelButton` / `paintRoundRect` / `paintModal*` 实现，减少了重复代码体量与冗余 Graphics 节点的不一致绘制开销：

- 圆角按钮使用同一套 lineWidth / cornerRadius / 描边色，避免两边各自维护造成的样式漂移。
- 模态背景、面板底色、面板描边使用统一调色，渲染状态切换更可预期，对包含多个相同弹窗时的合批更友好。
- 删除了重复定义的 `LabelButtonOpts`、`defaultBtnCornerRadius`、`paintLabelButtonBg` 等函数，减小了打包后单文件体积。

## 7. 稳定性与状态管理

- `PersonalCenterPage` 内的 `scrollAreas` 在 `lateUpdate` 中跳过失效节点并 compact 数组，避免历史弹窗销毁后仍持有引用导致访问已销毁组件。
- `clearPageChildren` 销毁 Canvas 下除 `Camera` 外的所有动态子节点，避免反复进入个人中心时累积 overlay 节点。
- `sceneRoutes.ts` 集中处理主场景与个人中心 Bundle 的加载/回退逻辑；个人中心 Bundle 加载失败时只在非微信预览环境回退到 `director.loadScene`，避免微信环境出现"看似加载但走错路径"的隐式分支。
- `platformKv.decodeWxValue` 收紧为仅接受字符串，杜绝旧存档被外部写为对象后被 `JSON.stringify` 二次编码造成的语义错乱。

## 优化结果（定性）

以下评估为代码层面的定性收益，**没有附带 BeforeAfter 的实测数据**，建议在外发或归档前先按"§profiler 实测数据 TODO"做一次回归实测：

1. **内存使用**：减少了节点的创建和销毁，预期降低内存峰值和垃圾回收频率（待 Profiler 内存采样验证）。
2. **渲染性能**：通过对象池和减少不必要的更新，预期减少 draw call（待 stats 面板对比）。
3. **运行流畅度**：优化了动画系统和游戏逻辑，预期更稳定的帧率（待 Profiler FPS 曲线）。
4. **稳定性**：添加了错误处理和安全检查（如 `scrollAreas` 失效节点过滤、`platformKv.decodeWxValue` 类型收紧），不依赖 Profiler。

## profiler 实测数据 TODO

| 指标 | 采集方式 | 当前数据 | 建议目标 |
|------|----------|----------|----------|
| 主场景节点数（进入个人中心前 vs 进入后） | Cocos `Profiler` 节点统计 / `director._scene._children.length` | 未采集 | 个人中心切换后主场景节点数应释放至 0（场景被替换） |
| 主场景 + 个人中心 draw call | Cocos Profiler stats 面板 | 未采集 | 两个场景的 draw call 应各自独立，且个人中心不要超过 50 个 draw call |
| 微信小游戏首包体积（subpackage 拆出 personal-center 前后对比） | 微信开发者工具 → 构建 → 包体大小 | 未采集 | personal-center 完整体积进入 subpackage，首包减少其全部大小（含场景 + 依赖） |
| 进入 / 退出个人中心耗时 | `performance.now()` 包裹 `loadPersonalCenterScene` 与 `loadMainGameScene` | 未采集 | 真机首次进入 < 1s（含 subpackage 下载），二次进入 < 300ms |
| 失败 / 成功结算后内存增量 | 多次结算后 Profiler 内存 | 未采集 | 单次结算前后内存差异接近 0（弹窗销毁后归位） |

> 采集步骤建议：1) 在微信开发者工具中按表格指标各跑一次；2) 把数据填进上表对应行；3) 数据填齐后，把"优化结果（定性）"小节升级为"优化结果"，并补充 BeforeAfter 数据。

## 后续优化建议

1. **补 profiler 实测数据**（高优）：按上表填齐定量指标后，再把本文升级为正式的优化报告。
2. **精灵图集优化**：在 Cocos Creator 编辑器中创建精灵图集，将分散的精灵图片合并为精灵图集，减少 draw call。
3. **纹理压缩**：在 Cocos Creator 编辑器中对图片资源进行纹理压缩，减少内存使用。
4. **异步加载**：实现资源的异步加载，提高游戏启动速度；个人中心等非首屏页面优先放入 Bundle/分包（已完成 personal-center）。
5. **LOD 系统**：实现细节层次 (LOD) 系统，根据距离调整渲染细节。
6. **物理引擎优化**：优化物理碰撞检测，减少计算开销。
7. **资源预加载**：实现资源的预加载机制，减少游戏过程中的加载卡顿。
8. **shader 优化**：使用自定义 shader 优化渲染效果，提高渲染性能。
9. **内存管理**：实现更精细的内存管理，进一步减少内存使用。
10. **多线程优化**：利用多线程技术处理计算密集型任务，提高游戏运行效率。

## 结论

本次性能优化已经从代码结构、对象池、动画系统、场景拆分等层面打下基础，**但所有结论目前都属于"代码定性收益"**，缺少 profiler 实测数据。下一步应优先把 §profiler 实测数据 TODO 中的指标采集到位，再正式把本文标记为可对外的优化报告。

对于精灵图集和纹理压缩的优化，建议在 Cocos Creator 编辑器中进行操作，具体步骤如下：

1. **精灵图集优化**：
   - 在 Cocos Creator 编辑器中，选择 `资源管理器`
   - 选中需要合并的精灵图片
   - 右键点击，选择 `创建 -> 精灵图集`
   - 在精灵图集编辑器中调整参数，生成精灵图集

2. **纹理压缩**：
   - 在 Cocos Creator 编辑器中，选择需要压缩的图片资源
   - 在 `属性检查器` 中，找到 `纹理设置`
   - 选择合适的压缩格式和质量
   - 应用设置并重新构建项目