export interface CatSkin {
  id: string; // 皮肤唯一标识
  name: string; // 皮肤名称
  price: number; // 兑换价格
  description: string; // 皮肤描述
  isDefault: boolean; // 是否为默认皮肤
  category: string; // 分类
  /**
   * 移速 buff（单位：秒）。从 Inspector 配置的基础 `walkRepeatIntervalSec` 中**扣减**该值
   * 后作为该皮肤实际的走路间隔，因此值越大走得越快。建议范围 0 ~ 0.03，超出后会被
   * `MIN_WALK_REPEAT_INTERVAL_SEC` 兜底（再大也不会更快）。
   */
  speedBuff: number;
  /**
   * 皮肤主题色（0~255 RGB）。**仅在贴图加载失败、`BoardView` 回退到 entityGfx
   * 色块圆点时生效**，作为"最低可见反馈"。贴图路径不再用这个值做乘法染色
   * （Sprite.color 是 modulate，<255 会把贴图整体压暗），所以正常情况下玩家
   * 看不到这个颜色——保留它只是为了帧组加载失败时圆点还能区分皮肤。
   * 详见 `BoardView.CAT_SPRITE_NEUTRAL_TINT` 与 `setCatVisualTint` 的注释。
   */
  visualTint: {
    r: number;
    g: number;
    b: number;
  };
}

export const catSkins: CatSkin[] = [
  {
    id: 'default',
    name: '默认皮肤',
    price: 0,
    description: 'Tom的经典形象',
    isDefault: true,
    category: 'cat',
    speedBuff: 0,
    visualTint: { r: 255, g: 255, b: 255 },
  },
  {
    id: 'ninja',
    name: '忍者汤姆',
    price: 200,
    description: '身手敏捷的忍者汤姆，少许增加移速',
    isDefault: false,
    category: 'cat',
    speedBuff: 0.005,
    visualTint: { r: 110, g: 120, b: 155 },
  },
  {
    id: 'pirate',
    name: '海盗汤姆',
    price: 200,
    description: '勇敢的海盗汤姆，少许增加移速',
    isDefault: false,
    category: 'cat',
    speedBuff: 0.005,
    visualTint: { r: 210, g: 85, b: 70 },
  },
  {
    id: 'fox',
    name: '小狐仙',
    price: 500,
    description: '妲己MM，增加大量移速',
    isDefault: false,
    category: 'cat',
    speedBuff: 0.025,
    visualTint: { r: 110, g: 120, b: 155 },
  },
  {
    id: 'ying',
    name: '白头鹰',
    price: 500,
    description: '自由的白头鹰，增加移速和攻击效果',
    isDefault: false,
    category: 'cat',
    speedBuff: 0.018,
    visualTint: { r: 110, g: 120, b: 155 },
  },
  {
    id: 'boar',
    name: '猪刚鬣',
    price: 800,
    description: '可爱的蓬蓬猪，增加移速，专属音效和冲锋效果',
    isDefault: false,
    category: 'boar',
    speedBuff: 0.018,
    visualTint: { r: 255, g: 214, b: 80 },
  },
  {
    id: 'wolf',
    name: '金刚狼',
    price: 800,
    description: '凶残的金刚狼，增加移速，专属音效和攻击效果',
    isDefault: false,
    category: 'wolf',
    speedBuff: 0.018,
    visualTint: { r: 110, g: 120, b: 155 },
  },
  {
    id: 'girl',
    name: '小萝莉',
    price: 1000,
    description: '可爱的萝莉，增加移速和攻击效果,专属音效',
    isDefault: false,
    category: 'girl',
    speedBuff: 0.022,
    visualTint: { r: 110, g: 120, b: 155 },
  },
];

export function getCatSkinById(skinId: string): CatSkin {
  return catSkins.find((skin) => skin.id === skinId) ?? catSkins[0];
}
