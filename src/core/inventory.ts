/**
 * 背包与自动换装。
 *
 * 这个文件回答一个问题：**地上那件法宝，值不值得让角色换上去？**
 *
 * 为什么挂机游戏必须「自动换装」：
 * 玩家在挂机（不操作）的时候也在持续掉装备。如果每次都要手动比较，
 * 挂机就变成了"回来一看地上全过期了"。但全自动换装又会让玩家失去决策 ——
 * 折中：**自动换「明显更强」的，其余留在背包里等玩家自己挑**。
 * 阈值 `AUTO_EQUIP_MARGIN` 就是这个折中的落点。
 *
 * 判断强不强**不能看单条属性大小**（生命和暴击不可比），
 * 而要走一遍真实的属性管线再算战力 —— 这样以后加新 StatKey、
 * 改天赋、改词缀，换装逻辑不用跟着改。
 */

import {
  UNARMED_DAMAGE,
  characterModifiers,
  equippedItems,
  equip,
  type CharacterState,
} from './character';
import type { Item } from './item';
import type { SlotId } from '../data/slots';
import { SLOT_ID_TO_KIND, type SlotKind } from '../data/slots';
import { resolveAllStats } from './modifier';

/** 背包上限。满了就自动分解最差的 —— 挂机不能因为背包满而停止收货 */
export const BAG_CAPACITY = 40;

/** 战力高于这个比例才自动换（1.02 = 强 2% 以上才换） */
export const AUTO_EQUIP_MARGIN = 1.02;

/**
 * 战力：把属性压成一个数。
 *
 * 权重的含义 —— 都是"一点这个属性值多少战力"：
 * - 伤害 1：基准
 * - 气血 0.12：能多挨几下
 * - 护体 0.15：护甲有边际递减，所以权重略高于气血但不能等值
 * - 出手速度 120：从 1.0 到 1.1 是 +10% 全局输出，值钱
 * - 破绽率 400：暴击率是百分比，1 点 = 100%
 * - 破绽伤害 60
 * - 其他：真元/回气/身法统一给个低价，避免它们把战力刷虚
 *
 * 这套权重**必然是主观的**，它的作用不是"算出玩家的真实强度"，
 * 而是"让自动换装别犯明显错误"。以后有玩家抱怨"我明明换了个更好的它不换"，
 * 就调这里。
 */
export const STAT_WEIGHT: Readonly<Record<string, number>> = {
  damage: 1,
  life: 0.12,
  shield: 0.1,
  armor: 0.15,
  mana: 0.02,
  manaRegen: 6,
  lifeRegen: 6,
  lifeOnHit: 5,
  attackSpeed: 120,
  castSpeed: 80,
  critChance: 400,
  critMulti: 60,
  resMetal: 40,
  resWood: 40,
  resWater: 40,
  resFire: 40,
  resEarth: 40,
  // D82：`moveSpeed` / `projectileSpeed` 在真消费者里 0 行命中（玩家不移动、神通无投射物飞行）。
  // 权重清零有两个作用：①不再把废件算成「高战力」（以前 moveSpeed 是全表最高 60，
  // 自动换装和判据 C 都被它带偏）；②以后谁再给这两个键挂来源，itemPower 也不会奖励它。
  // （这两个键本身留着：删 StatKey 要动存档兼容/天赋形状/词缀总数，成本远高于收益。）
  moveSpeed: 0,
  area: 40,
  projectileSpeed: 0,
  turbid: 30,
  lootRarity: 25,
  lootQuantity: 20,
  xpGain: 0, // D37/D82：修为加成通道已取消（gainXp 不读属性），权重归零
  body: 3,
  agility: 3,
  spirit: 3,
};

/** 一件装备的战力（不含角色自身属性） */
export function itemPower(item: Item): number {
  let p = 0;
  for (const b of item.base) p += (STAT_WEIGHT[b.stat] ?? 1) * b.value;
  for (const a of item.affixes) p += (STAT_WEIGHT[a.stat] ?? 1) * a.value;
  return p;
}

/**
 * 角色当前战力。
 *
 * DPS 基础值 = 拳脚 + 武器基底 flat。后者已由修正器管线算进 `st.damage`
 * （基底与「伤害提高」灵纹各算一次），不要再手加一遍武器 base ——
 * 那是「铁剑伤害双算」事故的根源。
 */
export function characterPower(ch: CharacterState): number {
  const st = resolveAllStats(characterModifiers(ch));
  const dps =
    (UNARMED_DAMAGE + st.damage) * st.attackSpeed * (1 + st.critChance * (st.critMulti - 1));
  return (
    dps * 10 +
    st.life * STAT_WEIGHT.life +
    st.shield * STAT_WEIGHT.shield +
    st.armor * STAT_WEIGHT.armor +
    st.lifeRegen * STAT_WEIGHT.lifeRegen +
    st.lifeOnHit * STAT_WEIGHT.lifeOnHit +
    (st.resFire + st.resWater + st.resMetal + st.resWood + st.resEarth) * 0.5
  );
}

export interface EquipDecision {
  readonly shouldEquip: boolean;
  /** 换了会强多少（1.08 = 强 8%）；空坑时返回 Infinity */
  readonly gain: number;
  readonly targetSlot: SlotId;
}

/**
 * 该不该把这件装备穿上。
 *
 * **比的是「同一部位里换不换」，不是「全角色战力涨不涨」**（2026-10-22 修）。
 * 旧实现拿 `characterPower(换装前) / characterPower(换装后)` 做判断，被一场
 * 「满级挂机 8 小时，脚上还是一双 44 级的灵品靴」的实测打穿：
 * 全角色战力被 `dps × 10` 一项彻底支配（几千），而靴子/戒指/玉冠这类
 * 「身法/回气/抗性」部位再怎么换也只动个位数 —— 比值永远到不了 1.02，
 * 于是**这些部位一辈子不换装**，玩家看到的就是「掉了更好的它不穿」。
 * 同部位比就消掉了这个支配项（同一种基底主属性，量纲一致）。
 */
export function decideEquip(ch: CharacterState, item: Item): EquipDecision {
  const targetSlot = slotForItem(ch, item);
  if (!targetSlot) {
    return { shouldEquip: false, gain: 0, targetSlot: 'sword' };
  }
  const current = ch.equipment[targetSlot];
  // 空坑必穿：没有「比什么」的问题
  if (!current) {
    return { shouldEquip: true, gain: Number.POSITIVE_INFINITY, targetSlot };
  }
  // 传奇优先（D61）：`itemPower` 只累加 base + affixes，**根本不读 legendary**，
  // 于是「带传奇的仙品」和「同灵蕴宝品」在战力上几乎一样 —— 实测 90.3~95.2% 的仙品
  // 永远换不上去，玩家刷到的传奇效果一次都不会生效。
  // 修法不动 itemPower（不引魔数、不污染战力口径），只加一条前置规则：
  // 「新件有传奇、身上没有 → 直接换」。两件都有传奇时仍按战力比（不能无限换装）。
  if (item.legendary && !current.legendary) {
    return { shouldEquip: true, gain: Number.POSITIVE_INFINITY, targetSlot };
  }
  const before = itemPower(current);
  const after = itemPower(item);
  const gain = before <= 0 ? Number.POSITIVE_INFINITY : after / before;
  return { shouldEquip: gain >= AUTO_EQUIP_MARGIN, gain, targetSlot };
}

/** 这件装备该戴在哪个坑（戒指有两个坑，优先空的那个） */
export function slotForItem(ch: CharacterState, item: Item): SlotId | null {
  const kind = item.slot;
  if (kind === 'ring') {
    if (!ch.equipment.ring1) return 'ring1';
    if (!ch.equipment.ring2) return 'ring2';
    // 两个都满了：换更差的那个
    const p1 = itemPower(ch.equipment.ring1);
    const p2 = itemPower(ch.equipment.ring2);
    return p1 <= p2 ? 'ring1' : 'ring2';
  }
  const id = (Object.keys(SLOT_ID_TO_KIND) as SlotId[]).find(
    (sid) => SLOT_ID_TO_KIND[sid] === kind,
  );
  return id ?? null;
}

export interface PickupResult {
  readonly character: CharacterState;
  readonly bag: Item[];
  /** 给玩家看的一句话（"换上了青锋法剑" 之类） */
  readonly message: string;
  readonly equipped: boolean;
}

/**
 * 拾取一件掉落。
 *
 * 顺序是刻意的：先判断该不该换（换下来的旧装备进背包，不是凭空消失），
 * 再看背包满没满 —— 如果先判背包满，会出现"背包满了所以不换装"这种荒唐结果。
 */
export function pickup(ch: CharacterState, bag: readonly Item[], item: Item): PickupResult {
  const decision = decideEquip(ch, item);
  const nextBag = [...bag];

  if (decision.shouldEquip) {
    const { character, replaced } = equip(ch, decision.targetSlot, item);
    if (replaced) nextBag.push(replaced);
    const pct = Number.isFinite(decision.gain) ? `（强 ${((decision.gain - 1) * 100).toFixed(0)}%）` : '';
    return {
      character,
      bag: trimBag(nextBag),
      message: `换上 ${item.name}${pct}`,
      equipped: true,
    };
  }

  nextBag.push(item);
  return { character: ch, bag: trimBag(nextBag), message: `收起 ${item.name}`, equipped: false };
}

/** 背包超了就丢最差的（挂机不能因为背包满而停止收货） */
export function trimBag(bag: readonly Item[]): Item[] {
  if (bag.length <= BAG_CAPACITY) return [...bag];
  return [...bag]
    .sort((a, b) => itemPower(b) - itemPower(a))
    .slice(0, BAG_CAPACITY);
}

/** 背包里最好的几件（UI 用来展示"你有好东西没穿"） */
export function bestInBag(bag: readonly Item[], n = 3): Item[] {
  return [...bag].sort((a, b) => itemPower(b) - itemPower(a)).slice(0, n);
}

/** 已装备部位的简表（UI 用） */
export function equipmentSummary(ch: CharacterState): { slot: SlotId; item: Item; power: number }[] {
  return equippedItems(ch).map((e) => ({ slot: e.slot, item: e.item, power: itemPower(e.item) }));
}

/** 这个部位类型有没有空坑 */
export function hasFreeSlot(ch: CharacterState, kind: SlotKind): boolean {
  const id = slotForItem(ch, { slot: kind } as Item);
  return id !== null;
}
