/**
 * 精英浊物的掷档（REQ §3 第 8 条，数值 shuzhi v4.44 定稿）。
 *
 * 掷档在**生成**侧一次决定三件事：稀有度 → 妖纹条数 → 妖纹具体是哪几条。
 * 三件事放一处才不会出现「掷出 rare 但只给 1 条妖纹」这种自相矛盾的个体。
 * `spawnRing` 只调这一个入口。
 *
 * ## 概率口径（每只独立掷，不是「每波至少一只」）
 * | 段 | magic | rare |
 * |---|---:|---:|
 * | 1~9 | 8% | 1% |
 * | 10~18 | 10% | 2% |
 * | 19~27 | 12% | 3% |
 * | 28~46 | 15% | 4% |
 *
 * 为什么每只独立：按波保底会让段④ 刷层时的精英密度锁死 25%（1/4）、与层数无关，
 * 深层的「越往下越凶」就消失了。独立掷才有层间梯度。
 * 锚是**总击杀率不动**：只有「坚韧」加血，平均血量倍率
 * `0.85×1 + 0.12×1.09 + 0.03×1.22 = 1.018` ⇒ 击杀 −1.8%、满级 +2%（在噪声内）。
 *
 * ## 类互斥
 * 4 类（伤害/防御/速度/经济）各至多 1 条 ⇒ 3~4 条妖纹必然是**不同类别**，
 * 「四条全叠伤害」在生成阶段就不可能发生（结构防死，不靠数值上限堵洞）。
 *
 * ⚠️ 改这里的概率或 `data/monster-affixes.ts` 的数值，必须重跑
 * `node tools/run-timeline.mjs --seeds=6 --minutes=900 --post-cap --talents=off`。
 */

import type { Rng } from './rng';
import {
  affixCountRange,
  affixesForFloor,
  type MonsterAffixCategory,
  type MonsterAffixDef,
} from '../data/monster-affixes';
import type { MonsterRarity } from '../data/monsters';

export interface RarityBracket {
  /** 从第几层起生效（含） */
  readonly minFloor: number;
  readonly magic: number;
  readonly rare: number;
}

export const RARITY_BRACKETS: readonly RarityBracket[] = [
  { minFloor: 1, magic: 0.08, rare: 0.01 },
  { minFloor: 10, magic: 0.1, rare: 0.02 },
  { minFloor: 19, magic: 0.12, rare: 0.03 },
  { minFloor: 28, magic: 0.15, rare: 0.04 },
];

/** 某一层的掷档概率；层号脏值按第 1 层算（生成侧不能因为脏输入崩掉战斗） */
export function rarityBracketAt(floor: number): RarityBracket {
  const f = Number.isFinite(floor) ? Math.max(1, Math.floor(floor)) : 1;
  let picked = RARITY_BRACKETS[0]!;
  for (const b of RARITY_BRACKETS) if (f >= b.minFloor) picked = b;
  return picked;
}

/** 掷一只怪的稀有度。**镇守不经过这里**（由调用方按 `def.boss` 直接给 'boss'）。 */
export function rollMonsterRarity(rng: Rng, floor: number): MonsterRarity {
  const b = rarityBracketAt(floor);
  const roll = rng.float(0, 1);
  if (roll < b.rare) return 'rare';
  if (roll < b.rare + b.magic) return 'magic';
  return 'normal';
}

/** 4 个类别（掷档时按类别抽，保证同类互斥） */
export const MONSTER_AFFIX_CATEGORIES: readonly MonsterAffixCategory[] = [
  'damage',
  'defense',
  'speed',
  'economy',
];

/**
 * 按稀有度抽 N 条**类别互不重复**的妖纹。
 *
 * 实现是「先洗类别、再在每个类别里抽一条」，不是「抽 N 次、撞了就重抽」：
 * 后者在目标 4 条时会退化成一堆重试（第 4 条要撞掉 3 个已用类别），
 * 而且 N 一旦大于类别数就死循环。这里 N ≤ 4 = 类别数，永远不会抽不满。
 */
export function rollMonsterAffixIds(
  rng: Rng,
  floor: number,
  rarity: MonsterRarity,
): readonly string[] {
  const [lo, hi] = affixCountRange(rarity);
  if (hi <= 0) return [];
  const want = Math.min(
    MONSTER_AFFIX_CATEGORIES.length,
    hi <= lo ? lo : rng.int(lo, hi),
  );
  // 洗类别（Fisher-Yates，与 spawnRing 的洗牌同风格）
  const cats = [...MONSTER_AFFIX_CATEGORIES];
  for (let i = cats.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const tmp = cats[i]!;
    cats[i] = cats[j]!;
    cats[j] = tmp;
  }
  // D148：池子按层过滤（深层专属妖纹只在层 28+ 出现）。
  // 注意：**先按层过滤再按类别过滤**，两层过滤都必须发生在抽之前 ——
  // 若先抽到 `磐` 再被层过滤掉，rare 会掉回 3 条，稀有度与条数就对不上了。
  const floorPool = affixesForFloor(floor);
  const picked: string[] = [];
  for (const cat of cats) {
    if (picked.length >= want) break;
    const pool = floorPool.filter((d) => d.category === cat);
    if (pool.length === 0) continue;
    const def: MonsterAffixDef = pool[rng.int(0, pool.length - 1)]!;
    picked.push(def.id);
  }
  return picked;
}

/** 异变体：从第几层起出现（与深层妖纹同段） */
export const VARIANT_MIN_FLOOR = 28;
/** 异变体：每几波出现 1 只 */
export const VARIANT_WAVE_EVERY = 4;
/** 异变体：掉落数量加成（**独立于 `MONSTER_QTY_CAP`**，见 session 的 q 计算） */
export const VARIANT_EXTRA_DROP = 0.1;

/**
 * 这一波要不要出异变体（**纯函数，不耗 rng**；哪一只由 `spawnRing` 用一次 `rng.int` 决定）。
 * 判据三层：层 ≥28（与深层妖纹同段，中段不加尖峰）/ 波号能被 4 整除 / 波号必须 > 0。
 * 镇守波也会出异变体 —— 那正是「尖峰应对」最需要被检验的场合。
 */
export function shouldSpawnVariant(floor: number, wave: number): boolean {
  const f = Number.isFinite(floor) ? Math.floor(floor) : 1;
  const w = Number.isFinite(wave) ? Math.floor(wave) : 0;
  return f >= VARIANT_MIN_FLOOR && w > 0 && w % VARIANT_WAVE_EVERY === 0;
}

/**
 * 给异变体追加「第 2 条同类妖纹」（**突破类别互斥**，这是显式例外）。
 *
 * 两步都用既有池子（`affixesForFloor`）：
 *   - 该怪原本 0 条（normal 异变）⇒ 先从类别池抽 1 条，再从同类抽第 2 条（0 → 2 正是尖峰来源）
 *   - 原本 ≥1 条 ⇒ 从它**已有的类别**里挑一个，再抽一条同类（可能抽到同一条，效果翻倍）
 * 不复制数值，只复制 id —— 数值仍是 `sumMonsterAffixes` 一个出口。
 */
export function addVariantAffix(
  rng: Rng,
  floor: number,
  affixIds: readonly string[],
): readonly string[] {
  const pool = affixesForFloor(floor);
  const pickFrom = (cat: MonsterAffixCategory): string | null => {
    const list = pool.filter((d) => d.category === cat);
    if (list.length === 0) return null;
    return list[rng.int(0, list.length - 1)]!.id;
  };
  if (affixIds.length === 0) {
    const cats = [...MONSTER_AFFIX_CATEGORIES];
    const first = pickFrom(cats[rng.int(0, cats.length - 1)]!);
    if (first === null) return [];
    const catOfFirst = pool.find((d) => d.id === first)?.category;
    const second = catOfFirst ? pickFrom(catOfFirst) : null;
    return second === null ? [first] : [first, second];
  }
  const have = affixIds
    .map((id) => pool.find((d) => d.id === id)?.category)
    .filter((c): c is MonsterAffixCategory => c !== undefined);
  if (have.length === 0) return affixIds;
  const cat = have[rng.int(0, have.length - 1)]!;
  const extra = pickFrom(cat);
  return extra === null ? affixIds : [...affixIds, extra];
}

/** 一只怪的稀有度 + 妖纹一起掷（生成侧的唯一入口） */
export function rollMonsterIdentity(
  rng: Rng,
  floor: number,
  isBoss: boolean,
  /** 是否是异变体（true 时额外带 1 条同类妖纹；镇守也可以是异变体） */
  variant = false,
): { readonly rarity: MonsterRarity; readonly affixIds: readonly string[] } {
  if (isBoss) return { rarity: 'boss', affixIds: variant ? addVariantAffix(rng, floor, []) : [] };
  const rarity = rollMonsterRarity(rng, floor);
  const base = rollMonsterAffixIds(rng, floor, rarity);
  return { rarity, affixIds: variant ? addVariantAffix(rng, floor, base) : base };
}
