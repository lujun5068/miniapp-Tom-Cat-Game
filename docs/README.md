# docs 索引

本目录下每份文档的职责如下，按"长期稳定"到"高频变动"排序：

| 文档 | 职责 | 何时更新 |
|------|------|----------|
| [`DESIGN_DOC.md`](./DESIGN_DOC.md) | 项目整体设计：项目概览、技术栈、目录结构、模块职责、界面规范、跨平台。 | 架构 / 模块拆分 / 界面整体规范变化时 |
| [`SCORE_AND_SKIN.md`](./SCORE_AND_SKIN.md) | 积分 + 皮肤 + 微信能力专题：积分规则、存档结构、`ScoreManager` 接口、皮肤配置、个人中心页面、微信分享、当前限制。 | 积分规则 / 存档字段 / 公开接口变化时 |
| [`PROJECT_STATUS.md`](./PROJECT_STATUS.md) | 当下状态：路线图（已完成 / 进行中 / 待办）、发布自检 checklist、性能 profiler TODO、短期优先级、新人快速运行。 | 路线图调整、发布前自检勾选时 |
| [`CHANGELOG.md`](./CHANGELOG.md) | 按日期倒序记录工程层面的可见改动；同一天按主题分组。 | 每次合 PR / 出包前追加 |

## 工作约定

- 写新代码 / 改动行为时：先在 `CHANGELOG.md` 顶部追加条目；如改动到接口或存档字段，再同步 `SCORE_AND_SKIN.md` 或 `DESIGN_DOC.md` 对应小节。
- 路线图（已完成 / 进行中 / 待办）只在 `PROJECT_STATUS.md` 维护；其他文档需要引用时用相对链接，不要复述。
- 历史修复列表（曾经的 `INTEGRATION_SYSTEM_DESIGN.md §8.2` 与 `PROJECT_STATUS.md §五`）已统一搬入 `CHANGELOG.md`；不要再在专题文档里堆 changelog。
- 性能改造数据见 `PROJECT_STATUS.md §3 性能追踪 TODO`；已不再单独维护 `PERFORMANCE_OPTIMIZATION.md`。
- 仓库根 `README.md` 仅面向"如何运行 / 构建"，不重复架构 / 设计内容。
