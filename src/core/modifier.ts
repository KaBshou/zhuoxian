/**
 * 修正器引擎 —— 全项目的中枢。
 *
 * 装备灵纹、天赋星点、辅助玉简、浊气觉醒、怪物妖纹、秘境词条……
 * **全部都是同一个东西**：给某个属性加/乘一个值，条件是按标签过滤。
 *
 * 所以全游戏只有一个聚合函数（本文件）。任何系统都不许自己写一套「加成计算」。
 * 这条纪律的意义在 idle-grim 里已经有反例：那个项目把升华效果在 4 个伤害入口各补了一遍，
 * 注释自己写着「这是唯一一处普攻不。damageMonster 的伤害来源，所以升华加成要在这里单独补一次」。
 *
 * 结算公式（流放之路同款）：
 *   最终值 = (基础值 + flat 总和) × (1 + increased 总和) × Π(1 + more)
 *
 * 为什么 increased 和 more 必须分开：
 *   increased 多条互相**累加**（+20% 和 +30% = +50%），是「堆量」；
 *   more 多条互相**连乘**（+20% 和 +30% = ×1.56），是「质变」。
 *   只有前者的话，后期必须靠堆天文数字推进；两者并存，玩家才有「凑乘算」的追求。
 */

import { matchesTags, type Tag } from '../data/tags';
import { STAT_META, clampStat, type StatKey } from '../data/stats';

/** 三种运算 */
export type ModOp = 'flat' | 'increased' | 'more';

/** 修正器来源：只用于显示（伤害拆解面板要告诉玩家「这 40 点伤害是哪来的」） */
export type ModSourceKind =
  | 'base' // 基础值（武器、怪物原型）
  | 'equip' // 装备灵纹
  | 'talent' // 天赋星点
  | 'support' // 辅助玉简
  | 'ascend' // 浊气觉醒
  | 'turbid' // 浊气状态
  | 'monster' // 怪物妖纹
  | 'map' // 秘境词条
  | 'buff'; // 临时状态

export interface ModSource {
  readonly kind: ModSourceKind;
  /** 显示名，如「锋锐」「星点·破军」「辅助：扩散」 */
  readonly label: string;
}

/**
 * 一条修正器。
 *
 * `tags` 为空 = 无条件生效；非空 = **目标标签必须包含其全部**才生效。
 * 例：`{ stat: 'damage', op: 'increased', value: 0.2, tags: ['spell', 'fire'] }`
 *     表示「法术且火属性的伤害 +20%」。
 */
export interface Modifier {
  readonly stat: StatKey;
  readonly op: ModOp;
  readonly value: number;
  readonly tags?: readonly Tag[];
  readonly source?: ModSource;
}

/** 聚合结果 */
export interface Aggregate {
  /** flat 总和 */
  readonly flat: number;
  /** increased 总和（0.5 表示 +50%） */
  readonly increased: number;
  /** more 连乘后的倍率（1.56 表示 ×1.56） */
  readonly more: number;
}

export const EMPTY_AGGREGATE: Aggregate = Object.freeze({ flat: 0, increased: 0, more: 1 });

/** 一条修正器对本次聚合的贡献（伤害拆解面板用） */
export interface ModContribution {
  readonly source: string;
  readonly op: ModOp;
  readonly value: number;
}

export interface AggregateDetail {
  readonly agg: Aggregate;
  readonly parts: readonly ModContribution[];
}

/**
 * 聚合修正器。这是全项目唯一的结算入口。
 *
 * @param mods  候选修正器列表（可以整包传，内部按 stat + tags 过滤）
 * @param stat  要算哪个属性
 * @param tags  目标的标签集合（算伤害时传这个伤害实例的标签；算面板属性时不传）
 */
export function aggregate(
  mods: readonly Modifier[],
  stat: StatKey,
  tags?: readonly Tag[],
): Aggregate {
  let flat = 0;
  let increased = 0;
  let more = 1;
  for (const m of mods) {
    if (m.stat !== stat) continue;
    if (!Number.isFinite(m.value)) continue; // 坏数据静默跳过，别让一处脏数据毁掉整场战斗
    if (!matchesTags(tags, m.tags)) continue;
    switch (m.op) {
      case 'flat':
        flat += m.value;
        break;
      case 'increased':
        increased += m.value;
        break;
      case 'more':
        more *= 1 + m.value;
        break;
    }
  }
  return { flat, increased, more };
}

/** 同 `aggregate`，但保留每一条的明细，给伤害拆解面板用 */
export function aggregateDetailed(
  mods: readonly Modifier[],
  stat: StatKey,
  tags?: readonly Tag[],
): AggregateDetail {
  const parts: ModContribution[] = [];
  let flat = 0;
  let increased = 0;
  let more = 1;
  for (const m of mods) {
    if (m.stat !== stat) continue;
    if (!Number.isFinite(m.value)) continue;
    if (!matchesTags(tags, m.tags)) continue;
    parts.push({
      source: m.source?.label ?? m.source?.kind ?? '未知来源',
      op: m.op,
      value: m.value,
    });
    switch (m.op) {
      case 'flat':
        flat += m.value;
        break;
      case 'increased':
        increased += m.value;
        break;
      case 'more':
        more *= 1 + m.value;
        break;
    }
  }
  return { agg: { flat, increased, more }, parts };
}

/** 把聚合结果作用到基础值上 */
export function applyAggregate(base: number, agg: Aggregate): number {
  return (base + agg.flat) * (1 + agg.increased) * agg.more;
}

/**
 * 算一个属性的最终值（自带基础值 + 值域夹取）。
 *
 * 面板显示、战斗结算都走这个函数；不要自己 `base + flat`。
 */
export interface ResolveOptions {
  /** 五行抗性上限的额外放开量（周天图 resist-cap-plus = +0.05） */
  readonly resistCapBonus?: number;
}

export function resolveStat(
  key: StatKey,
  mods: readonly Modifier[],
  tags?: readonly Tag[],
  opts?: ResolveOptions,
): number {
  const agg = aggregate(mods, key, tags);
  return clampStat(key, applyAggregate(STAT_META[key].base, agg), opts?.resistCapBonus ?? 0);
}

/** 一次算出全部属性（角色面板用）。返回 Record 便于存档/显示遍历。 */
export function resolveAllStats(mods: readonly Modifier[], opts?: ResolveOptions): Record<StatKey, number> {
  const out = {} as Record<StatKey, number>;
  for (const key of Object.keys(STAT_META) as StatKey[]) {
    out[key] = resolveStat(key, mods, undefined, opts);
  }
  return out;
}

/**
 * 便捷构造器。用它可以少写一半样板，也顺手强制带上来源。
 * （来源不是可选的：拆解面板必须能回答「这 40 点是谁给的」）
 */
export function mod(
  stat: StatKey,
  op: ModOp,
  value: number,
  source: ModSource,
  tags?: readonly Tag[],
): Modifier {
  return tags && tags.length > 0
    ? { stat, op, value, tags, source }
    : { stat, op, value, source };
}

/** 把聚合结果格式化成一句话，用于日志和调试（"基础 100 +40% ×1.56 → 218.4"） */
export function describeAggregate(base: number, agg: Aggregate): string {
  const afterFlat = base + agg.flat;
  const afterInc = afterFlat * (1 + agg.increased);
  const final = afterInc * agg.more;
  const incPct = (agg.increased * 100).toFixed(0);
  return `${base} +${agg.flat} → ${afterFlat}，+${incPct}% → ${afterInc.toFixed(1)}，×${agg.more.toFixed(3)} → ${final.toFixed(1)}`;
}
