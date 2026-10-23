/**
 * 法宝位（装备槽）。
 *
 * 分两层是**故意**的：
 * - `SlotKind` = 物品自己是什么（一枚戒指只知道「我是戒指」，不知道戴哪只手）
 * - `SlotId`  = 玩家身上哪一个坑（ring1 / ring2 是两个坑）
 *
 * 如果物品存 SlotId，那么「把戒指从左手中指换到右手」就得改物品数据 ——
 * 这是错的，戒指本身没变。所以换位只是重新挂载，物品数据不动。
 */

/** 玩家身上的 10 个法宝位 */
export type SlotId =
  | 'sword'
  | 'relic'
  | 'crown'
  | 'robe'
  | 'bracer'
  | 'boots'
  | 'belt'
  | 'ring1'
  | 'ring2'
  | 'pendant';

/** 物品自己的类型（9 种，两个戒指坑合并成一种） */
export type SlotKind =
  | 'sword'
  | 'relic'
  | 'crown'
  | 'robe'
  | 'bracer'
  | 'boots'
  | 'belt'
  | 'ring'
  | 'pendant';

export const SLOT_IDS: readonly SlotId[] = [
  'sword',
  'relic',
  'crown',
  'robe',
  'bracer',
  'boots',
  'belt',
  'ring1',
  'ring2',
  'pendant',
];

export const SLOT_KINDS: readonly SlotKind[] = [
  'sword',
  'relic',
  'crown',
  'robe',
  'bracer',
  'boots',
  'belt',
  'ring',
  'pendant',
];

/** 法宝位 → 修仙名 */
export const SLOT_NAME: Readonly<Record<SlotKind, string>> = {
  sword: '法器',
  relic: '本命法宝',
  crown: '冠',
  robe: '道袍',
  bracer: '护腕',
  boots: '踏云靴',
  belt: '腰带',
  ring: '戒指',
  pendant: '玉佩',
};

/** 坑 → 物品类型 */
export const SLOT_ID_TO_KIND: Readonly<Record<SlotId, SlotKind>> = {
  sword: 'sword',
  relic: 'relic',
  crown: 'crown',
  robe: 'robe',
  bracer: 'bracer',
  boots: 'boots',
  belt: 'belt',
  ring1: 'ring',
  ring2: 'ring',
  pendant: 'pendant',
};

export function isSlotId(x: unknown): x is SlotId {
  return typeof x === 'string' && (SLOT_IDS as readonly string[]).includes(x);
}

export function isSlotKind(x: unknown): x is SlotKind {
  return typeof x === 'string' && (SLOT_KINDS as readonly string[]).includes(x);
}

/** 这个物品能不能放这个坑 */
export function fitsSlot(kind: SlotKind, id: SlotId): boolean {
  return SLOT_ID_TO_KIND[id] === kind;
}
