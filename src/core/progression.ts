/**
 * 境界与修为成长曲线。
 *
 * 数值已按 `docs/BALANCE.md` §20.11（v4.9，shuzhi 2026-10-22 按**真实 session 进程**定稿，
 * D34 = C″ 案）：
 *
 *   本境总修为 R(k)：显式数组 BREAKTHROUGH_XP（Σ2 805 538）
 *   每一重 = R(k) × 9%    （8 重合计 72%）
 *   渡劫   = R(k) × 28%
 *   满级实付 = ΣR(0..7) + 0.72×R(8) = 2 460 738 ≈ 406 min = 6.8h
 *
 * 【末境渡劫永不支付】step 80 是终点，它的 xpForStep 返回 Infinity，
 * 所以第 9 境的渡劫（0.28×R(8) ≈ 316 684）永远不会被消耗 —— 末境实付只有 72%。
 * 反推数组时末境必须 ÷0.72，否则会固定短 ≈44 min（≈11%）。
 *
 * 结构：9 个大境界 × 9 重 = 81 个台阶。
 *
 * 【为什么是显式数组而不是几何式】
 * 修为/小时是**线性**的（速率 ∝ 层数，而层数是线性推进），几何式的 R(k) 除以
 * 线性速率会让「每境时长」逐境递减 —— 越往后升级越快，与「修仙越往后越难」相反。
 * 实测：几何式 Σ17 265 → 43 分钟满级；`1080×(3k+2)` Σ136 080 → 93 分钟。
 * 显式数组是唯一能同时满足「一境 40~60 分钟」和「末段不重复」的形状。
 *
 * 【为什么数组有 ×2.3 / ×3.3 的台阶（R(3→4)、R(5→6)）】
 * 那不是笔误，是**阶赏金**（D32 拍板 C）：进新阶（层 10、层 19）怪更强，
 * 修为赏金也同比跳一档（xpMul 一阶 1.05 / 二阶 3.275 / 三阶 10.15），
 * 玩家体感是「换阶了，升级明显加快」。归一到 1.0 会让换阶变成纯换皮。
 *
 * 【为什么末三境 45 / 80 / 102 分钟递增】
 * 层 19~27 的修为速率不再上涨（深处卖装备不卖等级），若末三境等长，
 * 玩家会经历 3 段一模一样的「层 27 原地挂机」。改成递增后每境都有新目标。
 */

import { REALM_TERM, REALM_STAGE_TERM, formatRealm } from '../data/glossary';

/** 大境界个数 */
export const REALM_COUNT = 9;
/** 每个大境界内的小台阶数（九重） */
export const STAGES_PER_REALM = 9;
/** 总台阶数 = 81。索引 0 = 练气一重，索引 80 = 渡劫九重 */
export const TOTAL_STEPS = REALM_COUNT * STAGES_PER_REALM;

/**
 * 第 k 个大境界的总修为 R(k)（BALANCE §20.11 / D34 定稿 C″ 案）。
 *
 * 合计 1 513 370 修为 = 406 分钟 = 6.8 小时（真实 session 进程实测口径）。
 * 九境到达时刻（分钟）：32 / 47 / 70 / 104 / 139 / 179 / 224 / 304 / 406。
 *
 * 【改这个数组之前必读】
 * 1. 它必须**单调递增**（越往后越难），单测 `tests/progression.test.ts` 把守。
 * 2. 它换掉之后，24h 四段式的「境界圆满」那一段（GDD 1.7 第 ③ 段）时长跟着变，
 *    必须同步 ceshi 的 `tools/run-timeline.mjs` 验收值。
 * 3. 层数上限还是 27（D36 未做），所以层 27 的速率是硬顶；数组再拉长就只能靠
 *    「深处卖装备不卖等级」来解释。
 */
/**
 * D125 修为回收系数（shuzhi 的棘轮纪律：让时间提前 >5% 的正当改动只能用 XP 门槛回收，不再重标目标）。
 *
 * 起因：A 方案（武器型神通深层补偿 `WEAPON_DEEP_K = 0.4`，D125）让武器型神通伤害占比从 0.09% → 8.8%，
 * 满级中位 259.7 → 231.1min（−11%）。按棘轮纪律不重标 260，而是把门槛抬回来。
 *
 * 1.12 是按实测比值算的初值，跑完 12 种子后按中位回调（目标回到 260）。
 * **改这个数只需重跑 12 种子，不要动 `TARGET_MAX_MINUTES`。**
 */
export const XP_RECOVERY_MUL = 1.3;

export const BREAKTHROUGH_XP: readonly number[] = [
  3200, 8950, 25400, 117600, 180176, 251936, 327131, 659716, 1231429,
].map((x) => Math.round(x * XP_RECOVERY_MUL));

/**
 * 每一重占本境总修为 R(k) 的比例。
 *
 * 必须是 0.09 而不是 0.08：R(k) 的语义是「本境全部台阶之和」，
 * 8 重 + 渡劫 = 8 × 0.09 + 0.28 = 1.00。写 0.08 时只有 8×0.08+0.28 = 0.92，
 * 每境实际只要 92% 的 R(k)，比 BALANCE 的时长预算短 8%（§19.1 踩过这个坑）。
 */
export const STAGE_RATIO = 0.09;
/** 渡劫（第 9 重）占本境总修为 R(k) 的比例 */
export const TRIBULATION_RATIO = 0.28;

/**
 * 第 k 个大境界的总修为 R(k)。超出数组范围时按最后一境算（防未来加境界时崩）
 */
export function realmXp(k: number): number {
  if (!Number.isFinite(k) || k < 0) return BREAKTHROUGH_XP[0];
  const idx = Math.min(BREAKTHROUGH_XP.length - 1, Math.floor(k));
  return BREAKTHROUGH_XP[idx];
}

/**
 * 这是第几个大境界（0~8）
 */
export function realmIndexOf(step: number): number {
  return Math.floor(clampStep(step) / STAGES_PER_REALM);
}

/** 这是本境界的第几重（0~8） */
export function stageIndexOf(step: number): number {
  return clampStep(step) % STAGES_PER_REALM;
}

function clampStep(step: number): number {
  if (!Number.isFinite(step)) return 0;
  return Math.max(0, Math.min(TOTAL_STEPS - 1, Math.floor(step)));
}

/**
 * 从 `step` 突破到 `step + 1` 需要多少修为。
 *
 * 满了（step >= 80）返回 Infinity —— 表示"已到顶，不再需要修为"。
 * 用 Infinity 而不是 0，是为了让「还差多少」的 UI 自己会显示「已圆满」，
 * 而不会显示成「0 / 0」让玩家以为卡住了。
 */
export function xpForStep(step: number): number {
  const s = Math.floor(step);
  // 非法台阶归一化到第一阶（注意走 Math.round，与正常路径同一数值）
  if (!Number.isFinite(s) || s < 0) {
    return Math.round(realmXp(0) * STAGE_RATIO);
  }
  if (s >= TOTAL_STEPS - 1) return Number.POSITIVE_INFINITY;
  const realm = realmIndexOf(s);
  const stage = stageIndexOf(s);
  const r = realmXp(realm);
  // 第 9 重（stage 8）是渡劫，占 28%；前 8 重各占 8%
  return Math.round(r * (stage >= STAGES_PER_REALM - 1 ? TRIBULATION_RATIO : STAGE_RATIO));
}

/** 从 0 升到 step 需要累计多少修为（给「总进度」条用） */
export function totalXpToStep(step: number): number {
  const target = clampStep(step);
  let sum = 0;
  for (let s = 0; s < target; s++) sum += xpForStep(s);
  return sum;
}

// D214：stepLabel / realmName / stageName 已删除。
// 境界命名的唯一出处是 src/data/glossary.ts 的 formatRealm（UI 全用它）。
// 这三个是它的平行实现（各拼一半），只有测试调用过 —— 留着等于「命名有两份答案」，
// 而测试测的是没人用的那份。

/** 是否已经圆满（不能再突破） */
export function isMaxStep(step: number): boolean {
  return clampStep(step) >= TOTAL_STEPS - 1;
}

/** 一次加修为的结果 */
export interface XpGainResult {
  /** 实际落到的台阶 */
  readonly step: number;
  /** 剩余修为（没花完的） */
  readonly xp: number;
  /** 这次一共突破了几重 */
  readonly breakthroughs: number;
}

/**
 * 加修为，处理"一次加太多、连破好几重"的情况。
 *
 * 必须循环而不是只算一次：挂机八小时回来，一次结算可能连破十几重。
 * 如果只算一次，玩家会白丢大量修为（而且这个 bug 只在离线收益时才暴露，很难测）。
 */
export function addXp(step: number, xp: number, gain: number): XpGainResult {
  let cur = clampStep(step);
  let pool = Number.isFinite(xp) && xp > 0 ? xp : 0;
  const add = Number.isFinite(gain) && gain > 0 ? gain : 0;
  pool += add;

  let breakthroughs = 0;
  // 防御性上限：TOTAL_STEPS 次循环足够，防止系数写错时死循环
  let guard = 0;
  while (!isMaxStep(cur) && guard < TOTAL_STEPS + 1) {
    const need = xpForStep(cur);
    if (!Number.isFinite(need) || pool < need) break;
    pool -= need;
    cur += 1;
    breakthroughs += 1;
    guard += 1;
  }

  // 圆满之后多余修为不再累积（避免界面一直显示「溢出的 999 万修为」）
  if (isMaxStep(cur)) pool = 0;

  return { step: cur, xp: pool, breakthroughs };
}

/** 距离下一重还差多少修为；圆满时返回 null */
export function xpToNext(step: number, xp: number): number | null {
  if (isMaxStep(step)) return null;
  const need = xpForStep(step);
  const cur = Number.isFinite(xp) && xp > 0 ? xp : 0;
  return Math.max(0, need - cur);
}

/** 当前台阶的进度（0~1），圆满为 1 */
export function stepProgress(step: number, xp: number): number {
  if (isMaxStep(step)) return 1;
  const need = xpForStep(step);
  if (!Number.isFinite(need) || need <= 0) return 0;
  const cur = Number.isFinite(xp) && xp > 0 ? xp : 0;
  return Math.max(0, Math.min(1, cur / need));
}
