# 积分系统设计文档

## 1. 系统概述

本设计文档基于现有猫捕鼠游戏，增加积分系统，用于激励玩家持续游戏和兑换猫角色皮肤。积分系统将自动记录和发放积分，并提供皮肤兑换功能。

## 2. 功能需求

### 2.1 积分获取方式
- **每日登录**：+10 积分
- **游戏成功过关**：+5 积分
- **游戏失败**：+2 积分
- **破关卡记录**：+10 积分

### 2.2 积分使用
- 积分用于兑换猫角色的皮肤
- 初始只有默认皮肤
- 后续可添加多种皮肤供玩家兑换

### 2.3 自动发放
- 积分应在满足条件时自动发放，无需玩家手动领取

## 3. 技术设计

### 3.1 存储结构

#### 3.1.1 积分存储
创建新的存储文件 `scoreSave.ts`，使用与现有存储机制相同的跨端键值存储方案。

```typescript
// assets/scripts/game/ScoreManager.ts
export type ScoreSaveV2 = {
  version: 2;
  availableScore: number;       // 当前可用积分
  totalEarnedScore: number;     // 历史累计获得积分
  lastLoginDate: string;        // 上次发放每日登录奖励日期（本地 YYYY-MM-DD）
  lastLoginPopupDate: string;   // 上次确认每日奖励弹窗日期（本地 YYYY-MM-DD）
  unlockedSkins: string[];      // 已解锁的皮肤 ID
  currentSkin: string;          // 当前使用的皮肤 ID
  history: ScoreHistoryEntry[]; // 最近积分流水
};
```

#### 3.1.2 皮肤定义
创建皮肤配置文件 `skinConfig.ts`，定义皮肤属性和价格。

```typescript
// assets/scripts/game/skinConfig.ts
export interface CatSkin {
  id: string;           // 皮肤唯一标识
  name: string;         // 皮肤名称
  price: number;        // 兑换价格
  description: string;  // 皮肤描述
  isDefault: boolean;   // 是否为默认皮肤
  visualTint: {         // 当前资源阶段的皮肤显示色调
    r: number;
    g: number;
    b: number;
  };
}

export const catSkins: CatSkin[] = [
  {
    id: "default",
    name: "默认皮肤",
    price: 0,
    description: "Tom的经典形象",
    isDefault: true,
    visualTint: { r: 255, g: 255, b: 255 }
  },
  {
    id: "golden",
    name: "黄金汤姆",
    price: 100,
    description: "金光闪闪的汤姆",
    isDefault: false,
    visualTint: { r: 255, g: 214, b: 80 }
  },
  {
    id: "ninja",
    name: "忍者汤姆",
    price: 150,
    description: "身手敏捷的忍者汤姆",
    isDefault: false,
    visualTint: { r: 110, g: 120, b: 155 }
  },
  {
    id: "pirate",
    name: "海盗汤姆",
    price: 200,
    description: "勇敢的海盗汤姆",
    isDefault: false,
    visualTint: { r: 210, g: 85, b: 70 }
  }
];
```

### 3.2 核心类设计

#### 3.2.1 积分管理器
创建 `ScoreManager.ts` 类，负责积分的管理和发放。

> 当前代码已在此基础上升级为 v2 存档，增加本地日期判断、积分流水和旧存档迁移，详见“8. 当前修复记录”。

```typescript
// assets/scripts/game/ScoreManager.ts
import { storageGetItem, storageSetItem } from '../storage/platformKv';
import { catSkins } from './skinConfig';

type ScoreSaveV1 = {
  version: 1;
  totalScore: number;
  lastLoginDate: string;
  unlockedSkins: string[];
  currentSkin: string;
};

const KEY = 'cat-game-score-v1';

const defaultSave = (): ScoreSaveV1 => ({
  version: 1,
  totalScore: 0,
  lastLoginDate: '',
  unlockedSkins: ['default'],
  currentSkin: 'default'
});

export class ScoreManager {
  private static instance: ScoreManager;
  private saveData: ScoreSaveV1;

  private constructor() {
    this.loadFromDisk();
    this.checkDailyLogin();
  }

  public static getInstance(): ScoreManager {
    if (!ScoreManager.instance) {
      ScoreManager.instance = new ScoreManager();
    }
    return ScoreManager.instance;
  }

  private loadFromDisk(): void {
    try {
      const raw = storageGetItem(KEY);
      if (!raw) {
        this.saveData = defaultSave();
        this.saveToDisk();
        return;
      }
      const o = JSON.parse(raw) as Partial<ScoreSaveV1>;
      if (o.version !== 1) {
        this.saveData = defaultSave();
        this.saveToDisk();
        return;
      }
      this.saveData = {
        version: 1,
        totalScore: Number(o.totalScore) || 0,
        lastLoginDate: o.lastLoginDate || '',
        unlockedSkins: Array.isArray(o.unlockedSkins) ? o.unlockedSkins : ['default'],
        currentSkin: o.currentSkin || 'default'
      };
    } catch {
      this.saveData = defaultSave();
      this.saveToDisk();
    }
  }

  private saveToDisk(): void {
    try {
      storageSetItem(KEY, JSON.stringify(this.saveData));
    } catch {
      /* ignore */
    }
  }

  private checkDailyLogin(): void {
    const today = new Date().toISOString().split('T')[0];
    if (this.saveData.lastLoginDate !== today) {
      this.addScore(10, '每日登录奖励');
      this.saveData.lastLoginDate = today;
      this.saveToDisk();
    }
  }

  public addScore(amount: number, reason: string): void {
    this.saveData.totalScore += amount;
    this.saveToDisk();
    console.log(`获得 ${amount} 积分: ${reason}`);
  }

  public getTotalScore(): number {
    return this.saveData.totalScore;
  }

  public unlockSkin(skinId: string): boolean {
    const skin = catSkins.find(s => s.id === skinId);
    if (!skin || skin.isDefault) return false;
    
    if (this.saveData.totalScore >= skin.price && !this.saveData.unlockedSkins.includes(skinId)) {
      this.saveData.totalScore -= skin.price;
      this.saveData.unlockedSkins.push(skinId);
      this.saveToDisk();
      return true;
    }
    return false;
  }

  public setCurrentSkin(skinId: string): boolean {
    if (this.saveData.unlockedSkins.includes(skinId)) {
      this.saveData.currentSkin = skinId;
      this.saveToDisk();
      return true;
    }
    return false;
  }

  public getCurrentSkin(): string {
    return this.saveData.currentSkin;
  }

  public getUnlockedSkins(): string[] {
    return [...this.saveData.unlockedSkins];
  }
}
```

### 3.3 游戏逻辑集成

#### 3.3.1 修改 GameController.ts
在游戏结束时根据结果发放积分，并在游戏开始时初始化积分管理器。

```typescript
// 在 GameController.ts 中添加
import { ScoreManager } from './game/ScoreManager';

// 在 onLoad 方法中初始化
private scoreManager: ScoreManager;

onLoad(): void {
  // 现有代码...
  this.scoreManager = ScoreManager.getInstance();
  // 现有代码...
}

// 在游戏结束处理中添加积分发放
if (this.sim.gameEnd !== 'none' && !this.endModalShown) {
  this.endModalShown = true;
  this.gameRunning = false;
  this.gameAudio.pauseBgm();
  if (this.sim.gameEnd === 'win') {
    const k = String(this.sim.level);
    const save = loadLevelSave();
    const prevBest = Math.max(
      gameSession.bests[k] ?? 0,
      save.bestTimeRemainingSec[k] ?? 0,
    );
    const isNewPersonalBest = this.sim.timeLeft > prevBest;
    gameSession.recordClearedLevel(this.sim.level, this.sim.timeLeft);
    
    // 发放积分
    this.scoreManager.addScore(5, '游戏胜利');
    if (isNewPersonalBest) {
      this.scoreManager.addScore(10, '破关卡记录');
    }
    
    this.gameAudio.playWin();
    this.showEndModal(
      'win',
      this.sim.level,
      this.sim.timeLeft,
      isNewPersonalBest,
    );
  } else {
    // 发放积分
    this.scoreManager.addScore(2, '游戏失败');
    
    this.gameAudio.playLose();
    vibrateLong();
    this.showEndModal('lose', this.sim.level, this.sim.timeLeft, false);
  }
  this.syncRunBtn();
}
```

### 3.4 UI 集成

#### 3.4.1 添加积分显示
在游戏界面添加积分显示，在右侧栏添加积分和皮肤按钮。

```typescript
// 在 GameController.ts 的 buildUi 方法中添加
// 右侧栏添加积分显示和皮肤按钮
rightRail.addChild(
  this.wrapBtn(makeLabelButton('积分', 100, 44), () => this.showScorePanel()),
);

rightRail.addChild(
  this.wrapBtn(makeLabelButton('皮肤', 100, 44), () => this.showSkinPanel()),
);
```

#### 3.4.2 积分面板
创建积分面板，显示当前积分和积分获取历史。

#### 3.4.3 皮肤面板
创建皮肤面板，显示可兑换的皮肤和当前已解锁的皮肤。

## 4. 皮肤系统实现

### 4.1 皮肤资源
为每个皮肤创建对应的动画帧和图片资源，存放在 `assets/images/cat/skins/` 目录下。

### 4.2 皮肤切换
在 `BoardView.ts` 中修改猫的渲染逻辑，根据当前选择的皮肤加载对应的资源。

```typescript
// 在 BoardView.ts 中添加
import { ScoreManager } from './game/ScoreManager';

// 在 configureCatFrameAnimations 方法中修改
configureCatFrameAnimations(opts: CatFrameAnimationsOpts): void {
  const scoreManager = ScoreManager.getInstance();
  const currentSkin = scoreManager.getCurrentSkin();
  
  // 根据当前皮肤加载对应的动画帧
  // 实现皮肤切换逻辑
}
```

## 5. 实现步骤

1. **创建存储文件**：`scoreSave.ts`
2. **创建皮肤配置**：`skinConfig.ts`
3. **实现积分管理器**：`ScoreManager.ts`
4. **修改 GameController**：集成积分发放逻辑
5. **添加 UI 元素**：积分显示和皮肤面板
6. **实现皮肤系统**：资源准备和切换逻辑
7. **测试验证**：确保积分系统正常工作

## 6. 测试用例

### 6.1 积分获取测试
- 每日登录：确认首次登录获得 10 积分
- 游戏胜利：确认获得 5 积分
- 游戏失败：确认获得 2 积分
- 破记录：确认额外获得 10 积分

### 6.2 皮肤兑换测试
- 积分足够：确认能成功兑换皮肤
- 积分不足：确认无法兑换皮肤
- 皮肤切换：确认能正常切换已解锁的皮肤

### 6.3 存储测试
- 重启游戏：确认积分和皮肤状态保存
- 跨平台：确认在不同平台上正常工作

## 7. 后续优化

1. **增加更多皮肤**：设计更多有趣的皮肤供玩家兑换
2. **积分排行榜**：添加全球或好友积分排行榜
3. **限时活动**：增加限时积分获取活动
4. **成就系统**：与积分系统结合，完成成就获得额外积分
5. **社交分享**：分享游戏获得额外积分奖励

## 8. 当前修复记录

### 8.1 存储边界

当前阶段积分系统仍使用客户端本地存储，继续通过 `storage/platformKv` 写入本地键值数据。暂不处理用户篡改本地存档的风险，后续如果接入排行榜、活动奖励、账号体系或付费内容，再考虑服务端校验或存档签名。

### 8.2 已修复问题

1. **本地日期判断**：每日登录奖励改为按本地日期 `YYYY-MM-DD` 判断，不再使用 UTC 日期，避免北京时间早上 8 点才切换奖励日。
2. **每日奖励弹窗语义**：每日登录积分仍自动发放，但弹窗文案改为“已获得 +10 积分”，按钮仅用于确认已读，避免“点击领取”和实际已入账不一致。
3. **存档版本迁移**：积分存档从旧的 `version: 1` 迁移到 `version: 2`，保留同一个本地存储 key，并兼容旧字段 `totalScore`、`lastLoginPopupShown`。
4. **可用积分与累计积分区分**：新增 `availableScore` 与 `totalEarnedScore`，兑换皮肤只扣可用积分，累计积分保留给后续统计、成就或展示使用。
5. **积分流水**：新增最近积分记录，记录获得和消费来源，便于玩家理解积分变化。
6. **数据归一化**：加载存档时会过滤非法皮肤 ID、无效日期、非有限数值，并确保默认皮肤始终可用。
7. **皮肤可见效果**：在尚未准备多套猫动画资源前，皮肤先通过 `visualTint` 色调影响猫的显示，保证兑换和使用后在棋盘上有可见反馈。
8. **个人中心页面化**：个人中心不再作为游戏界面上的弹窗打开，而是拆为独立场景 `PersonalCenterPage.scene` 和页面脚本 `PersonalCenterPage.ts`。主游戏场景通过 `assetManager.loadBundle(...).loadScene(...)` 从 Bundle/分包加载个人中心，个人中心点击“返回”后加载主场景 `scene-001`。

### 8.3 当前保留限制

1. **皮肤资源仍是占位实现**：当前用色调区分皮肤，后续接入 `assets/images/cat/skins/` 多套动画资源后，应由 `BoardView` 按当前皮肤加载对应帧组。
2. **失败奖励仍可能被刷**：失败 +2 的规则暂未加入最低游玩时长、每日上限或关卡限制。如果积分经济被打穿，应优先加奖励频控。
3. **积分历史只保留最近记录**：当前只保留最近 50 条流水，用于轻量展示，不作为审计账本。
4. **微信小游戏分包配置**：个人中心已按 Bundle/分包加载，`GameController` 暴露 `personalCenterBundleName` 与 `personalCenterSceneName` 配置项。构建微信小游戏时需确保 `personalCenterBundleName` 与 Cocos 构建发布里的 Bundle 名一致，且该 Bundle 内包含 `PersonalCenterPage.scene`。

## 9. 总结

本积分系统设计方案通过合理的存储结构和逻辑实现，为游戏增加了新的激励机制和玩法。玩家可以通过每日登录、游戏胜负和破记录获得积分，用于兑换各种皮肤，提升游戏的可玩性和用户粘性。

系统设计考虑了跨平台兼容性，使用与现有存储机制相同的方案，确保在不同平台上都能正常工作。同时，代码结构清晰，易于维护和扩展，为后续的功能迭代做好了准备。