# Cocos Tom Cat

一个基于 Cocos Creator 的休闲小游戏项目。玩家控制小猫在棋盘地图中移动、跳跃和攻击，在限定时间内抓住关卡中的老鼠。

## 技术栈

- Cocos Creator 3.8.8
- TypeScript
- Cocos Creator 组件系统与场景编辑器
- Cocos 内置音频、精灵、节点、输入与本地存储能力
- 微信小游戏适配存储：微信环境使用 `wx.*StorageSync`，其他平台使用 `sys.localStorage`

## 项目结构

```text
assets/
  audio/                       音效与背景音乐资源
  images/                      猫、老鼠、地图、UI 等图片资源
  scene-001.scene              当前主游戏场景（启动场景，由 settings/v2/packages/scene.json 指定）
  personal-center/             个人中心子目录，配置为独立 Bundle（wechatgame subpackage）
    PersonalCenterPage.scene   个人中心场景，按需通过 assetManager.loadBundle 拉取
  scripts/
    GameController.ts          游戏主控制器，负责 UI、输入、关卡流程和音频绑定
    PersonalCenterPage.ts      个人中心页面：积分卡片、皮肤商店、积分流水弹窗
    BoardView.ts               棋盘渲染与角色显示
    game/                      纯游戏逻辑、积分管理、皮肤配置、场景路由（sceneRoutes.ts）
    audio/                     Cocos 音频封装
    render/                    地图贴图配置
    storage/                   关卡 / 积分存档、跨端存储、微信分享封装
    ui/                        UI 主题、安全区适配、共享 widget（widgets.ts）
    visual/                    猫动画播放
settings/                      Cocos Creator 项目设置（启动场景在 packages/scene.json）
package.json                   Cocos Creator 项目信息
tsconfig.json                  TypeScript 配置
```

## 使用方法

### 环境准备

1. 安装 Cocos Creator 3.8.8。
2. 使用 Cocos Dashboard 或 Cocos Creator 打开本项目根目录。
3. 等待 Creator 完成资源导入和脚本编译。

### 运行预览

1. 在 Cocos Creator 中打开 `assets/scene-001.scene`（即启动场景）。
2. 确认场景中的 `Canvas` 节点已挂载 `GameController` 组件。
3. 在 Inspector 中检查资源绑定：
   - 地图贴图：`sfMapFloor`、`sfMapEdge`、`sfMapStone1`、`sfMapStone2`
   - 猫资源：`sfCat`、`catAnimFramesStart`、`catAnimFramesWalkHorizontal`、`catAnimFramesWalkVertical`、`catAnimFramesStun`
   - 老鼠资源：`sfMouse`、`sfMouseVertical`
   - UI 背景：`sfUiBg`
   - 音频：`clipBgmMain`、`clipLevelStart`、`clipSfxJump`、`clipSfxAttack`、`clipSfxCatch` 等
4. 点击 Creator 顶部的预览按钮运行游戏。

### 构建发布

1. 在 Cocos Creator 中打开“项目”菜单下的“构建发布”。
2. 选择目标平台，例如 Web、桌面端或微信小游戏。
3. 根据平台要求配置构建参数并执行构建。
4. 如果发布到微信小游戏，请确认目标机型支持当前音频格式。若 `.m4a` 兼容性不满足需求，可替换为 `.mp3` 后重新绑定音频资源。

## 操作说明

- 移动：键盘 `WASD` / 方向键，或使用屏幕左下角虚拟摇杆。
- 跳跃：键盘 `Space`，或点击屏幕右下角“跳跃”按钮。
- 攻击：键盘 `J`，或点击屏幕右下角“攻击”按钮。
- 开始 / 暂停：点击右侧“开始”按钮。
- 下一关：通关后点击“下一关”按钮。
- 音乐 / 音效：使用左侧开关控制，并会保存到本地。

## 游戏规则概览

- 每关默认限时 30 秒。
- 关卡数量上限为 30 关。
- 关卡越高，老鼠数量越多，老鼠移动间隔也会逐步缩短。
- 小猫移动到老鼠所在格即可抓住老鼠。
- 跳跃需要面前一格是障碍物，并且障碍物后一格可行走。
- 攻击会尝试攻击面前一格；若目标格不可行走，小猫会进入短暂眩晕。
- 在时间结束前抓完所有老鼠即可通关。

## 存档说明

项目会保存关卡进度和音频设置：

- 微信小游戏环境：使用 `wx.setStorageSync` / `wx.getStorageSync`
- 其他平台：使用 `sys.localStorage`

相关实现位于 `assets/scripts/storage/`。
