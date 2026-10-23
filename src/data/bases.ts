/**
 * 法宝基底（= 装备的"底子"）。
 *
 * 一件法宝 = 基底（自带一条主属性）+ 灵纹（随机词缀）。
 * 分开的理由：玩家能感知「这把剑本身好」和「这把剑的灵纹好」是两件事，
 * 换装备时也会分开比较（底子好但词缀烂，是该留着洗还是卖掉）。
 *
 * ✅ 数值已按 `docs/BALANCE.md` §9 标定（2026-10-22，数值策划）。两条规则：
 *   1. `mainFlat` 一阶 → 二阶 → 三阶每阶 **×1.7**（跨阶位跳变，与灵纹的 ×1.7 对齐）；
 *   2. `mainPerIlvl = mainFlat × 3%` —— 与灵纹同一条斜率规则（同阶位 15 灵蕴涨 1.42 倍 < 跨阶 1.7，保证不反转）。
 * 为什么斜率必须是 3% 而不是 20%+：`baseMainValue` 从灵蕴 1 一直线性外推到 99，
 * 若按占位值的 24~27%/灵蕴，一把剑会吃掉全游戏 26 层总供给（40.85 倍）的 38%，
 * 其余八个部位 + 全部灵纹都变成摆设。按 3% 后，单部位（灵蕴 4 → 99）约涨 **10 倍**，
 * 九个部位分摊在各自属性通道上，法器/戒指负责伤害、道袍/法宝负责生存，量级才对得上。
 * 复算器：`F:\dsh-work\tmp\gen-balance.mjs`；对照表：BALANCE.md §9。
 */

import type { SlotKind } from './slots';
import type { StatKey } from './stats';

export interface ItemBaseDef {
  readonly id: string;
  readonly slot: SlotKind;
  /** 修仙名，如「青锋法剑」 */
  readonly name: string;
  /** 主属性 */
  readonly main: StatKey;
  /** 灵蕴 1 时的主属性值 */
  readonly mainFlat: number;
  /**
   * 主属性的结算方式。
   * 为什么必须显式写：同一个 StatKey 可以既是固定值又是百分比。
   * 「法器给固定伤害 8」和「戒指给伤害提高 3%」都在 stat: 'damage' 上，
   * 光看 stat 分不出来 —— 分错了戒指就变成一个加 0.03 点伤害的废物。
   */
  readonly mainOp?: 'flat' | 'increased';
  /** 主属性每点灵蕴增加多少 */
  readonly mainPerIlvl: number;
  /** 一阶基底（粗布 / 铜制品）：掉率高但上限低 */
  readonly tier: 1 | 2 | 3;
}

/**
 * 27 个基底 = 9 部位 × 3 阶。
 *
 * 三阶的意义：低阶基底掉率高、数值低；高阶基底只在深一点的灵蕴出现。
 * 这样「往下刷」才有实际收益，而不只是数字变大。
 *
 * 成长口径：`baseMainValue(b, ilvl) = mainFlat + mainPerIlvl * (ilvl - 1)`，
 * **从灵蕴 1 开始线性外推**（`ItemBaseDef` 没有 per-base 的 `ilvl` 门槛，只有 `tier`，
 * 阶级由 `rollBase` 按掉落灵蕴决定）。所以 t3 在灵蕴 99 时吃满 98 格成长：
 *   法器：t1@4 = 8 + 0.24×3 = 8.72 → t3@99 = 24 + 0.72×98 = 94.6（10.85 倍）
 *   腰带：t1@4 = 20 + 0.6×3 = 21.8 → t3@99 = 56 + 1.68×98 = 220.6（10.1 倍）
 * 10 倍是「单个部位」的量级，不是全装备总和 —— 九个部位各自负责一条属性通道，
 * 总和才是 BALANCE §2 里实测的 40.85 倍 DPS 供给。
 */
export const ITEM_BASES: readonly ItemBaseDef[] = [
  // ── 法器（主属性：伤害，固定值）──
  // D123 实测记录（回滚）：把 sword 的 damage 从 flat 改 increased（0.08/0.14/0.24）后满级 284.7 → 457.0（+52%）。
  // 原因：早期伤害几乎全靠普攻，flat 8 打在 p.damage 基数 5 上是 +160%，而 increased 0.08 只有 +8%。
  // 「同一组数字换 op」并不等价 —— flat 在小基数上是指数级的。要复活这个部位，得先解决「deep 普攻不吃层缩放」。
  { id: 'sword-t1', slot: 'sword', name: '铁剑', main: 'damage', mainOp: 'flat', mainFlat: 8, mainPerIlvl: 0.24, tier: 1 },
  { id: 'sword-t2', slot: 'sword', name: '青锋法剑', main: 'damage', mainOp: 'flat', mainFlat: 14, mainPerIlvl: 0.42, tier: 2 },
  { id: 'sword-t3', slot: 'sword', name: '逐电飞剑', main: 'damage', mainOp: 'flat', mainFlat: 24, mainPerIlvl: 0.72, tier: 3 },

  // ── 本命法宝（主属性：护体罡气）──
  { id: 'relic-t1', slot: 'relic', name: '木牌', main: 'shield', mainOp: 'flat', mainFlat: 12, mainPerIlvl: 0.36, tier: 1 },
  { id: 'relic-t2', slot: 'relic', name: '玄龟甲', main: 'shield', mainOp: 'flat', mainFlat: 20, mainPerIlvl: 0.6, tier: 2 },
  { id: 'relic-t3', slot: 'relic', name: '离火镜', main: 'shield', mainOp: 'flat', mainFlat: 34, mainPerIlvl: 1.02, tier: 3 },

  // ── 冠（主属性：真元）──
  { id: 'crown-t1', slot: 'crown', name: '束发木冠', main: 'mana', mainOp: 'flat', mainFlat: 10, mainPerIlvl: 0.3, tier: 1 },
  { id: 'crown-t2', slot: 'crown', name: '九霄玉冠', main: 'mana', mainOp: 'flat', mainFlat: 17, mainPerIlvl: 0.51, tier: 2 },
  { id: 'crown-t3', slot: 'crown', name: '血玉额冠', main: 'mana', mainOp: 'flat', mainFlat: 28, mainPerIlvl: 0.84, tier: 3 },

  // ── 道袍（主属性：护体）──
  { id: 'robe-t1', slot: 'robe', name: '粗布道袍', main: 'armor', mainOp: 'flat', mainFlat: 25, mainPerIlvl: 0.75, tier: 1 },
  { id: 'robe-t2', slot: 'robe', name: '青云法衣', main: 'armor', mainOp: 'flat', mainFlat: 42, mainPerIlvl: 1.26, tier: 2 },
  { id: 'robe-t3', slot: 'robe', name: '玄冥墨袍', main: 'armor', mainOp: 'flat', mainFlat: 70, mainPerIlvl: 2.1, tier: 3 },

  // ── 护腕（主属性：灵巧）──
  { id: 'bracer-t1', slot: 'bracer', name: '缠丝护腕', main: 'agility', mainOp: 'flat', mainFlat: 3, mainPerIlvl: 0.09, tier: 1 },
  { id: 'bracer-t2', slot: 'bracer', name: '铁骨护腕', main: 'agility', mainOp: 'flat', mainFlat: 5, mainPerIlvl: 0.15, tier: 2 },
  { id: 'bracer-t3', slot: 'bracer', name: '龙鳞护腕', main: 'agility', mainOp: 'flat', mainFlat: 8, mainPerIlvl: 0.24, tier: 3 },

  // ── 踏云靴（主属性：身法）──
  { id: 'boots-t1', slot: 'boots', name: '麻鞋', main: 'armor', mainOp: 'flat', mainFlat: 12, mainPerIlvl: 0.36, tier: 1 },
  { id: 'boots-t2', slot: 'boots', name: '疾风履', main: 'armor', mainOp: 'flat', mainFlat: 20, mainPerIlvl: 0.60, tier: 2 },
  { id: 'boots-t3', slot: 'boots', name: '踏云靴', main: 'armor', mainOp: 'flat', mainFlat: 34, mainPerIlvl: 1.02, tier: 3 },

  // ── 腰带（主属性：气血）──
  { id: 'belt-t1', slot: 'belt', name: '布腰带', main: 'life', mainOp: 'flat', mainFlat: 20, mainPerIlvl: 0.6, tier: 1 },
  { id: 'belt-t2', slot: 'belt', name: '灵纹玉带', main: 'life', mainOp: 'flat', mainFlat: 34, mainPerIlvl: 1.02, tier: 2 },
  { id: 'belt-t3', slot: 'belt', name: '兽骨束带', main: 'life', mainOp: 'flat', mainFlat: 56, mainPerIlvl: 1.68, tier: 3 },

  // ── 戒指（主属性：伤害提高 —— 百分比，所以 mainOp 是 increased）──
  { id: 'ring-t1', slot: 'ring', name: '铜戒', main: 'damage', mainOp: 'increased', mainFlat: 0.03, mainPerIlvl: 0.0009, tier: 1 },
  { id: 'ring-t2', slot: 'ring', name: '青玉戒', main: 'damage', mainOp: 'increased', mainFlat: 0.05, mainPerIlvl: 0.0015, tier: 2 },
  { id: 'ring-t3', slot: 'ring', name: '血纹戒', main: 'damage', mainOp: 'increased', mainFlat: 0.08, mainPerIlvl: 0.0024, tier: 3 },

  // ── 玉佩（主属性：神识）──
  { id: 'pendant-t1', slot: 'pendant', name: '木牌佩', main: 'spirit', mainOp: 'flat', mainFlat: 3, mainPerIlvl: 0.09, tier: 1 },
  { id: 'pendant-t2', slot: 'pendant', name: '平安玉佩', main: 'spirit', mainOp: 'flat', mainFlat: 5, mainPerIlvl: 0.15, tier: 2 },
  { id: 'pendant-t3', slot: 'pendant', name: '龙纹玉诀', main: 'spirit', mainOp: 'flat', mainFlat: 8, mainPerIlvl: 0.24, tier: 3 },
];

/** 某部位的所有基底 */
export function basesForSlot(
  pool: readonly ItemBaseDef[],
  slot: SlotKind,
): ItemBaseDef[] {
  return pool.filter((b) => b.slot === slot);
}

/** 基底在给定灵蕴下的主属性值 */
export function baseMainValue(def: ItemBaseDef, ilvl: number): number {
  const n = Number.isFinite(ilvl) ? Math.max(1, Math.floor(ilvl)) : 1;
  return def.mainFlat + def.mainPerIlvl * (n - 1);
}

/**
 * 校验基底表（和 validateAffixPool 一样，数值策划交付时跑一遍）。
 */
export function validateItemBases(pool: readonly ItemBaseDef[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const b of pool) {
    if (seen.has(b.id)) problems.push(`基底 id 重复：${b.id}`);
    seen.add(b.id);
    if (!b.name.trim()) problems.push(`${b.id} 没有名字`);
    if (!Number.isFinite(b.mainFlat)) problems.push(`${b.id} 的 mainFlat 不是有限数`);
    if (!Number.isFinite(b.mainPerIlvl)) problems.push(`${b.id} 的 mainPerIlvl 不是有限数`);
  }
  for (const slot of ['sword', 'relic', 'crown', 'robe', 'bracer', 'boots', 'belt', 'ring', 'pendant'] as SlotKind[]) {
    const n = pool.filter((b) => b.slot === slot).length;
    if (n === 0) problems.push(`部位 ${slot} 没有任何基底（会掉出 undefined）`);
  }
  return problems;
}
