/**
 * 品阶（稀有度）。
 *
 * 为什么用中文拼音当 key（fan/ling/bao/xian）而不是 common/rare：
 * 这个词会出现在 UI、存档、掉落过滤规则、词条条件里，
 * 用 `ling` 比 `magic` 更不容易被后来的开发者误解成"法术的"。
 * 一旦定下就不要改 —— 改 key 等于让所有老存档失效。
 */

import { RARITY_TERM } from './glossary';

export type Rarity = 'fan' | 'ling' | 'bao' | 'xian';

/** 从低到高 */
export const RARITIES: readonly Rarity[] = ['fan', 'ling', 'bao', 'xian'];

export const RARITY_NAME: Readonly<Record<Rarity, string>> = RARITY_TERM;

/** 数值比较用：品阶越高越大 */
export const RARITY_RANK: Readonly<Record<Rarity, number>> = {
  fan: 0,
  ling: 1,
  bao: 2,
  xian: 3,
};

/** 默认掉落权重（后面会被灵蕴 / 怪物品阶 / 机缘属性修正） */
export const RARITY_BASE_WEIGHT: Readonly<Record<Rarity, number>> = {
  fan: 60,
  ling: 28,
  bao: 10,
  xian: 2,
};

/**
 * 这条品阶能带几条灵纹。
 *
 * 凡品 0 条是**故意**的：地上 60% 的掉落是纯垃圾，玩家必须学会不捡。
 * 如果凡品也带词条，掉落的「信息量」会泛滥，玩家会累，而且暗黑类游戏
 * 恰恰靠"大多数掉落是垃圾"来制造出货时的爽感。
 */
export const RARITY_AFFIX_COUNT: Readonly<Record<Rarity, readonly [number, number]>> = {
  fan: [0, 0],
  ling: [1, 2],
  bao: [3, 4],
  xian: [4, 4], // 仙品固定 4 条 + 1 条传奇效果（传奇效果不在灵纹里，单独字段）
};

export function rarityRank(r: Rarity): number {
  return RARITY_RANK[r];
}

/** 比较两个品阶：>0 表示 a 更高 */
export function compareRarity(a: Rarity, b: Rarity): number {
  return RARITY_RANK[a] - RARITY_RANK[b];
}

export function isRarity(x: unknown): x is Rarity {
  return typeof x === 'string' && (RARITIES as readonly string[]).includes(x);
}

/** 中文名，未识别时返回原文而不是 undefined（存档读坏时不至于显示空白） */
export function rarityName(r: Rarity): string {
  return RARITY_NAME[r] ?? String(r);
}
