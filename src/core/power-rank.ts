/**
 * 部位归一化战力 + 品阶内分位（D89）。
 *
 * 为什么需要这个文件：
 *   判据 C 的分母是「同部位、同灵蕴下宝品的 itemPower 中位」，而 itemPower 的量纲
 *   因部位而异（玉佩中位是戒指的 7.4 倍）⇒ 玩家看到「战力 128」根本不知道自己这件
 *   算好算坏。所以面板要显示 `1.03×`，而**这个比值必须和判据 C 是同一个数**
 *   （D89 口径 1：一致性 > 好看）—— 两套算法各算一遍，等于天天用一个数验收、
 *   给玩家看另一个数。
 *
 * 数据来自 `src/data/slot-power-table.json`，由 `tools/gen-slot-base.mjs` 生成。
 * 那张表**失效是静默的**（分母失真不报错，只让比值悄悄偏移），所以：
 *   改 `src/data/bases.ts` / `affixes.ts` / `item.ts` 的 itemPower / loot 稀有度权重
 *   → **必须重跑 `node tools/gen-slot-base.mjs`**。
 */
import type { Item } from './item';
import { itemPower } from './inventory';
import type { SlotKind } from '../data/slots';
import { RARITY_NAME, type Rarity } from '../data/rarity';
import TABLE from '../data/slot-power-table.json';

interface RarityQuantiles {
  readonly minCount: number;
  readonly p10: readonly number[];
  readonly p50: readonly number[];
  readonly p90: readonly number[];
}

interface SlotTable {
  readonly ilvlStep: number;
  readonly quantSamples: number;
  readonly grid: readonly number[];
  readonly slotBase: Readonly<Record<string, readonly number[]>>;
  readonly quantiles: Readonly<Record<string, Readonly<Record<string, RarityQuantiles>>>>;
}

const T = TABLE as unknown as SlotTable;

export const SLOT_POWER_ILVL_STEP = T.ilvlStep;
export const SLOT_POWER_GRID = T.grid;
/** 分位显示的最低样本数：低灵蕴的仙品每格只有 ~60 个，再少就只是噪声 */
export const QUANTILE_MIN_SAMPLES = 30;

/** 在按灵蕴分档的数组上做线性插值（两端夹取） */
function interpAt(grid: readonly number[], values: readonly number[], ilvl: number): number {
  if (values.length === 0) return 0;
  const first = grid[0];
  const last = grid[grid.length - 1];
  if (!Number.isFinite(ilvl) || ilvl <= first) return values[0];
  if (ilvl >= last) return values[values.length - 1];
  const span = grid[1] - grid[0];
  const pos = (ilvl - first) / span;
  const i = Math.min(values.length - 2, Math.floor(pos));
  const t = pos - i;
  return values[i] + (values[i + 1] - values[i]) * t;
}

/**
 * 判据 C 的分母：同部位、同灵蕴下「宝品 itemPower 中位」。
 * 未知部位返回 0（调用方据此跳过显示，而不是拿 NaN 去画）。
 */
export function slotBasePower(kind: SlotKind, ilvl: number): number {
  const row = T.slotBase[kind];
  if (!row) return 0;
  return interpAt(T.grid, row, ilvl);
}

/** 归一化战力 = itemPower / 判据 C 分母。分母为 0 时返回 0（不显示，而不是 Infinity） */
export function powerRatio(item: Item): number {
  const base = slotBasePower(item.slot, item.ilvl);
  if (!(base > 0)) return 0;
  return itemPower(item) / base;
}

/** `1.03×`（比值保留两位；分母缺失时返回空串） */
export function powerRatioText(item: Item): string {
  const r = powerRatio(item);
  if (!(r > 0)) return '';
  return `${r.toFixed(2)}×`;
}

/**
 * 品阶内分位（0~100，越大越强）。
 * 用 p10/p50/p90 三点分段线性反推 —— 分布右偏，p90 以上只能给到「接近 100」，
 * 所以上尾封在 [90,100]，不假装知道真正的极值。
 */
export function rarityPercentile(item: Item): number | null {
  const q = T.quantiles[item.slot]?.[item.rarity];
  if (!q || q.minCount < QUANTILE_MIN_SAMPLES) return null;
  const v = itemPower(item);
  const p10 = interpAt(T.grid, q.p10, item.ilvl);
  const p50 = interpAt(T.grid, q.p50, item.ilvl);
  const p90 = interpAt(T.grid, q.p90, item.ilvl);
  if (!(p90 > p10)) return null;
  let pct: number;
  if (v <= p10) pct = p10 > 0 ? (v / p10) * 10 : 0;
  else if (v <= p50) pct = 10 + ((v - p10) / (p50 - p10)) * 40;
  else if (v <= p90) pct = 50 + ((v - p50) / (p90 - p50)) * 40;
  else pct = 90 + Math.min(1, (v - p90) / (p90 - p50)) * 10;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

/** `宝品 · 前 30%` / `宝品 · 中位` / `宝品 · 后 30%`（分位数据不足时只给品阶名） */
export function rarityRankText(item: Item): string {
  const name = RARITY_NAME[item.rarity as Rarity] ?? item.rarity;
  const pct = rarityPercentile(item);
  if (pct === null) return name;
  if (pct >= 70) return `${name} · 前 ${Math.max(1, 100 - pct)}%`;
  if (pct <= 30) return `${name} · 后 ${Math.max(1, pct)}%`;
  return `${name} · 中位`;
}

/**
 * 和身上同部位那件比：`+12%` / `-8%` / `空位`。
 * 这是给人做换装决策的数；`powerRatioText` 是给「这件达标没」的判据 C 数。
 * 两个都要显示，但**不许混用同一个名字**。
 */
export function powerDeltaText(item: Item, current: Item | null | undefined): string {
  if (!current) return '空位';
  const base = itemPower(current);
  if (!(base > 0)) return '';
  const pct = Math.round(((itemPower(item) - base) / base) * 100);
  if (pct === 0) return '持平';
  return `${pct > 0 ? '+' : ''}${pct}%`;
}
