export interface CatSkin {
  id: string; // 皮肤唯一标识
  name: string; // 皮肤名称
  price: number; // 兑换价格
  description: string; // 皮肤描述
  isDefault: boolean; // 是否为默认皮肤
  category: string; // 分类
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
    visualTint: { r: 255, g: 255, b: 255 },
  },
  {
    id: 'ninja',
    name: '忍者汤姆',
    price: 0,
    description: '身手敏捷的忍者汤姆',
    isDefault: false,
    category: 'cat',
    visualTint: { r: 110, g: 120, b: 155 },
  },
  {
    id: 'pirate',
    name: '海盗汤姆',
    price: 0,
    description: '勇敢的海盗汤姆',
    isDefault: false,
    category: 'cat',
    visualTint: { r: 210, g: 85, b: 70 },
  },
  {
    id: 'fox',
    name: '小狐仙',
    price: 0,
    description: '妲己MM',
    isDefault: false,
    category: 'fox',
    visualTint: { r: 110, g: 120, b: 155 },
  },
  {
    id: 'boar',
    name: '猪刚鬣',
    price: 0,
    description: '天蓬元帅',
    isDefault: false,
    category: 'boar',
    visualTint: { r: 255, g: 214, b: 80 },
  },
];

export function getCatSkinById(skinId: string): CatSkin {
  return catSkins.find((skin) => skin.id === skinId) ?? catSkins[0];
}
