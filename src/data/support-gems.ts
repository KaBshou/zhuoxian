/**
 * 辅助玉简（support gems）—— PoE 式辅助石的修仙版。
 *
 * 核心纪律（SYSTEM-MAP 地基二 + idle-grim 王牌教训）：
 * - 辅助玉简不改技能行为，只产出 **Modifier**。标签过滤天然决定它对谁生效，
 *   不需要 per-skill 分支 —— 26 个技能 × N 个符文的分支路径没人测得完。
 * - 第一版 12 个（REQ：60 辅助是终量），每个对应一类修仙概念。
 * - op 三态语义与 modifier.ts 完全一致：flat / increased（加法叠）/ more（乘法叠）。
 */
import type { Modifier, ModSource } from '../core/modifier';
import { mod } from '../core/modifier';
/** 装配槽位上限（12 选 4 = 495 种组合；全开是零决策，4 槽保住 97.2% 战力） */
export const GEM_SLOTS = 4;

import type { Tag } from './tags';
import { TAG_NAME } from './tags';

export interface SupportGemDef {
  readonly id: string;
  readonly name: string;
  readonly desc: string;
  /** 辅助玉简自己的标签：技能必须**命中任意一条**才受它影响 */
  readonly supports: readonly Tag[];
  /** 它产出的修正器（不带 source，挂载时补） */
  readonly mods: readonly Omit<Modifier, 'source'>[];
  /** 解锁所需境界台阶 */
  readonly unlockStep: number;
  /**
   * 真元消耗倍率（1 = 不变，1.5 = 真元消耗 +50%）。
   * 这是**唯一的「技能代价」通道**：27 个 StatKey 里没有 `manaCost`，
   * 而 Modifier 只能改属性、改不了「每次施法扣多少真元」。
   * 所以双刃型玉简的代价必须走这里，由战斗层在扣真元时乘上去（BALANCE §15.4）。
   */
  readonly costMul?: number;
}

const EQ: ModSource = { kind: 'support', label: '辅助玉简' };

/** 第一版 12 个辅助玉简（五行只开金/火/水） */
export const SUPPORT_GEMS: readonly SupportGemDef[] = [
  {
    id: 'mengong',
    name: '猛攻',
    desc: `${TAG_NAME.attack}类神通出手更快。`,
    supports: ['attack'],
    mods: [{ stat: 'attackSpeed', op: 'increased', value: 0.25 }],
    unlockStep: 0,
  },
  {
    id: 'jixie',
    name: '急切',
    desc: `${TAG_NAME.spell}类神通结印更快。`,
    supports: ['spell'],
    mods: [{ stat: 'castSpeed', op: 'increased', value: 0.25 }],
    unlockStep: 0,
  },
  {
    id: 'cuijin',
    name: '淬金',
    desc: `${TAG_NAME.metal}系伤害提高。`,
    supports: ['metal'],
    mods: [{ stat: 'damage', op: 'increased', value: 0.3, tags: ['metal'] }],
    unlockStep: 0,
  },
  {
    id: 'zhuo-huo',
    name: '浊火',
    desc: `${TAG_NAME.fire}系伤害提高。`,
    supports: ['fire'],
    mods: [{ stat: 'damage', op: 'increased', value: 0.3, tags: ['fire'] }],
    unlockStep: 0,
  },
  {
    id: 'hanbing',
    name: '寒浸',
    desc: `${TAG_NAME.water}系伤害提高。`,
    supports: ['water'],
    mods: [{ stat: 'damage', op: 'increased', value: 0.3, tags: ['water'] }],
    unlockStep: 0,
  },
  {
    id: 'kaopi',
    name: '拷皮',
    desc: '无视部分护体（护甲穿透，直接乘区）。',
    supports: ['attack', 'spell'],
    mods: [{ stat: 'damage', op: 'more', value: 0.15 }],
    unlockStep: 4,
  },
  {
    id: 'kuosan',
    name: '扩散',
    desc: `${TAG_NAME.area}范围扩大。`,
    supports: ['area'],
    mods: [{ stat: 'area', op: 'increased', value: 0.35 }],
    unlockStep: 4,
  },
  {
    id: 'guantou',
    name: '贯头',
    desc: '破绽率（暴击率）+6 个百分点。',
    supports: ['attack', 'spell'],
    mods: [{ stat: 'critChance', op: 'flat', value: 0.06 }],
    unlockStep: 9,
  },
  {
    id: 'duanjin',
    name: '断筋',
    desc: '破绽伤害（暴击倍率）提高。',
    supports: ['attack', 'spell'],
    mods: [{ stat: 'critMulti', op: 'increased', value: 0.25 }],
    unlockStep: 9,
  },
  {
    id: 'huitou',
    name: '回气',
    desc: '击中回气，打得到就续得上。',
    supports: ['attack', 'spell'],
    mods: [{ stat: 'lifeOnHit', op: 'flat', value: 2 }],
    unlockStep: 9,
  },
  {
    id: 'yuanmo',
    name: '驭魔',
    desc: `真元上限提高，${TAG_NAME.spell}更持久。`,
    supports: ['spell'],
    mods: [{ stat: 'mana', op: 'increased', value: 0.25 }],
    unlockStep: 18,
  },
  {
    id: 'wanhui',
    name: '万汇',
    desc: '更多伤害，但真元消耗 +50%（双刃玉简，乘区）。',
    supports: ['attack', 'spell'],
    // 代价必须是真的：原来写的是 `mana increased −0.2`（只是把真元上限从 50 压到 40），
    // 而驭魔同时给 +25% 上限，两条都在 step 18 解锁 → 净 +5%，等于「more 30% 白送还倒贴真元」。
    // 改成 costMul 1.5：寒水箭 4.17 → 6.25 真元/s（基线 4 的 1.56 倍），连发就要靠回元装。
    mods: [{ stat: 'damage', op: 'more', value: 0.3 }],
    costMul: 1.5,
    unlockStep: 18,
  },
];

export const SUPPORT_GEM_IDS: readonly string[] = SUPPORT_GEMS.map((g) => g.id);

export function getSupportGem(id: string): SupportGemDef | undefined {
  return SUPPORT_GEMS.find((g) => g.id === id);
}

/** 神通标签是否命中辅助玉简（命中任意一条 supports 即生效） */
export function gemAffects(gem: SupportGemDef, skillTags: readonly Tag[]): boolean {
  return gem.supports.some((t) => skillTags.includes(t));
}

/**
 * 某个神通被哪些辅助玉简修正，产出完整 Modifier 列表（带 source）。
 * 这是「辅助玉简 → 修正器管线」的唯一入口。
 */
export function gemModifiersFor(
  gems: readonly SupportGemDef[],
  skillTags: readonly Tag[],
): Modifier[] {
  const out: Modifier[] = [];
  for (const gem of gems) {
    if (!gemAffects(gem, skillTags)) continue;
    for (const m of gem.mods) out.push(mod(m.stat, m.op, m.value, EQ, m.tags));
  }
  return out;
}

export function validateSupportGems(list: readonly SupportGemDef[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const g of list) {
    if (seen.has(g.id)) errors.push(`辅助玉简 id 重复：${g.id}`);
    seen.add(g.id);
    if (g.supports.length === 0) errors.push(`${g.id} 没有声明辅助对象`);
    if (g.mods.length === 0) errors.push(`${g.id} 不产出任何修正器`);
    if (g.costMul !== undefined && (!Number.isFinite(g.costMul) || g.costMul <= 0)) {
      errors.push(`${g.id} 的真元消耗倍率必须是正有限数`);
    }
    for (const m of g.mods) {
      if (!Number.isFinite(m.value)) errors.push(`${g.id} 有非有限数值`);
      // 万汇这类负 increased 是合法的（debuff 型），只拦 NaN
    }
  }
  return errors;
}

/**
 * 某个神通被辅助玉简放大后的**真元消耗倍率**（BALANCE §15.4）。
 *
 * 与 `gemModifiersFor` 平行：同一个「命中任意一条 supports」的过滤规则，
 * 但产出的是「代价」而不是「Modifier」——27 个 StatKey 里没有 `manaCost`，
 * 强行塞进 Modifier 会让「改属性」和「改施法成本」两种语义混在一条管线里。
 *
 * 用法（战斗层，两处都要乘）：扣真元时 `skill.manaCost * gemCostMulFor(...)`，
 * 判够不够时也用同一个值，否则会出现「面板说够、点了放不出来」。
 */
export function gemCostMulFor(
  gems: readonly SupportGemDef[],
  skillTags: readonly Tag[],
): number {
  let mul = 1;
  for (const gem of gems) {
    if (gem.costMul === undefined) continue;
    if (!gemAffects(gem, skillTags)) continue;
    mul *= gem.costMul;
  }
  return mul;
}
