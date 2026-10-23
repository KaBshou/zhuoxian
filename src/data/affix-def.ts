/**
 * 灵纹（词缀）的**契约**。
 *
 * 这个文件只放类型和纯过滤函数，不放具体词缀数据 ——
 * 数据在 `src/data/affixes.ts`，由数值策划维护。
 * 分开的理由：契约一改全项目都要动，数据天天在调。
 *
 * 词缀的本质（本作最重要的设计决定之一）：
 * **一条灵纹不是「+12 伤害」，而是「一条可被移除、可被替换、可被重洗的修正器」。**
 * 所以数据层必须存**实例**（AffixInstance），不能存加总后的 map。
 * 存 map 的话，「灭灵石：随机删一条词缀」这个通货永远做不出来，
 * 因为弹药已经打散了，你没法从总和里减掉"某一条"。
 */

import type { ModOp } from '../core/modifier';
import type { StatKey } from './stats';
import type { SlotKind } from './slots';
import type { Tag } from './tags';

/**
 * 灵纹阶位 —— 决定这条词缀从多少灵蕴开始出现。
 *
 * 为什么分档：低物等的装备洗不出高阶词缀，这样「换更高物等的装备」
 * 才有意义。不分档的话，1 级掉的法宝和 60 级掉的法宝词缀池一样，
 * 玩家捡到的东西永远是同一批。
 */
export type AffixTier = 'huang' | 'xuan' | 'di' | 'tian';

export const AFFIX_TIER_ORDER: readonly AffixTier[] = ['huang', 'xuan', 'di', 'tian'];

/** 阶位 → 灵蕴区间（含两端） */
export const AFFIX_TIER_ILVL: Readonly<Record<AffixTier, readonly [number, number]>> = {
  huang: [1, 15],
  xuan: [16, 30],
  di: [31, 45],
  tian: [46, 99],
};

export const AFFIX_TIER_NAME: Readonly<Record<AffixTier, string>> = {
  huang: '黄阶',
  xuan: '玄阶',
  di: '地阶',
  tian: '天阶',
};

/** 阶位 → 权重系数。越高的阶越稀有（会被 ilvl 进一步限制） */
export const AFFIX_TIER_WEIGHT: Readonly<Record<AffixTier, number>> = {
  huang: 1.0,
  xuan: 0.55,
  di: 0.28,
  tian: 0.12,
};

/**
 * 一条灵纹的**定义**（模板）。
 * 洗出来的具体装备上挂的是 `AffixInstance`（见 core/item.ts），不是这个。
 */
export interface AffixDef {
  /** 唯一 id，一旦发布不能改（存档里存的是它） */
  readonly id: string;
  /** 修仙名，显示在装备上 */
  readonly name: string;
  /** 加哪个属性 */
  readonly stat: StatKey;
  /** flat / increased / more */
  readonly op: ModOp;
  /** 基础数值（灵蕴为该阶下限时的值） */
  readonly value: number;
  /** 灵蕴每高 1 点，数值增加多少（可以负数，用于「浊气增长 -x%」这种） */
  readonly perIlvl: number;
  /** 阶位 */
  readonly tier: AffixTier;
  /** 最小灵蕴（低于这个值洗不出来；通常等于阶位下限，个别词缀会更高） */
  readonly ilvl: number;
  /** 相对权重，越大越常见 */
  readonly weight: number;
  /** 限定部位；不填 = 所有部位都能出 */
  readonly slots?: readonly SlotKind[];
  /** 限定条件标签：只有带这些标签的伤害实例才吃这条（用于「火焰伤害 +x%」这类） */
  readonly tags?: readonly Tag[];
  /** 这条最多能被洗到几层（同一条词缀重复出现的上限），默认 1 */
  readonly maxStack?: number;
}

/** 灵蕴 → 阶位（超过最高档按最高档算） */
export function tierOfIlvl(ilvl: number): AffixTier {
  const n = Number.isFinite(ilvl) ? Math.max(1, Math.floor(ilvl)) : 1;
  for (let i = AFFIX_TIER_ORDER.length - 1; i >= 0; i--) {
    const t = AFFIX_TIER_ORDER[i];
    if (n >= AFFIX_TIER_ILVL[t][0]) return t;
  }
  return 'huang';
}

/** 这条灵纹在给定灵蕴下的实际数值 */
export function affixValueAt(def: AffixDef, ilvl: number): number {
  const n = Number.isFinite(ilvl) ? Math.max(def.ilvl, Math.floor(ilvl)) : def.ilvl;
  return def.value + def.perIlvl * (n - def.ilvl);
}

/** 这条灵纹能不能出现在这个部位 */
export function affixFitsSlot(def: AffixDef, slot: SlotKind): boolean {
  return def.slots === undefined || def.slots.includes(slot);
}

/**
 * 筛出「某部位 + 某灵蕴」能出的候选池。
 *
 * 权重会被阶位系数修正：同样 weight 的天阶词缀比黄阶稀有一倍多。
 */
export interface AffixCandidate {
  readonly def: AffixDef;
  readonly weight: number;
}

export function affixCandidates(
  pool: readonly AffixDef[],
  slot: SlotKind,
  ilvl: number,
): AffixCandidate[] {
  const out: AffixCandidate[] = [];
  const n = Number.isFinite(ilvl) ? Math.floor(ilvl) : 1;
  for (const def of pool) {
    if (def.ilvl > n) continue;
    if (!affixFitsSlot(def, slot)) continue;
    if (!(def.weight > 0)) continue;
    out.push({ def, weight: def.weight * AFFIX_TIER_WEIGHT[def.tier] });
  }
  return out;
}

/**
 * 校验一份词缀池（数值策划交付时用，也进单测）。
 * 返回问题列表，空数组 = 合格。
 */
export function validateAffixPool(pool: readonly AffixDef[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const d of pool) {
    if (seen.has(d.id)) problems.push(`id 重复：${d.id}`);
    seen.add(d.id);
    if (!d.id.trim()) problems.push('有空 id');
    if (!d.name.trim()) problems.push(`${d.id} 没有名字`);
    if (!Number.isFinite(d.value)) problems.push(`${d.id} 的 value 不是有限数`);
    if (!Number.isFinite(d.perIlvl)) problems.push(`${d.id} 的 perIlvl 不是有限数`);
    if (!Number.isFinite(d.weight) || d.weight <= 0) problems.push(`${d.id} 的 weight 必须为正数`);
    const [lo, hi] = AFFIX_TIER_ILVL[d.tier];
    if (d.ilvl < lo || d.ilvl > hi + 1) {
      problems.push(`${d.id} 的 ilvl=${d.ilvl} 不在 ${d.tier} 阶区间 ${lo}~${hi}`);
    }
    if (d.slots && d.slots.length === 0) problems.push(`${d.id} 的 slots 为空数组（会永远洗不出来）`);
  }
  return problems;
}
