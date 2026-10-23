// 一次性补丁 2：progression.ts 换 BREAKTHROUGH_XP 显式数组（shuzhi 定稿 BALANCE v2 §4）。
// 数组合计 158617 = 336min = 5.6h（表 C 时长分配的归一化结果）。
// 几何式 180×1.56^k 合计只有 154min（差 45%），作废。
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/src/core/progression.ts';
let c = fs.readFileSync(p, 'utf8');

const oldConst = `/** R(k) 的起始常数（BALANCE §4：起始 179，取整 180） */
export const STEP_BASE_XP = 180;
/** 跨一个大境界的倍率（BALANCE §4 反算底数 1.562，取 1.56） */
export const REALM_XP_MUL = 1.56;
/** 每一重占本境总修为 R(k) 的比例（9 重合计 72%） */
export const STAGE_RATIO = 0.08;`;
const neuConst = `/** 每个大境界的总修为（BALANCE v2 §4，shuzhi 2026-10-22 定稿的显式数组）。
 * 合计 158617，按修为/小时曲线摊出 336 分钟 ≈ 5.6 小时「境界圆满」。
 * 旧几何式 180×1.56^k 合计只有 154 分钟，与表 C 差 45% —— 修为/小时是线性曲线，
 * 几何式 R÷线性速率的比值必然递减，硬套底数永远对不上表，所以直接给显式数组。 */
export const BREAKTHROUGH_XP: readonly number[] = [
  783, 2796, 5816, 10149, 15658, 21389, 27960, 34083, 39983,
];
/** 每一重占本境总修为 R(k) 的比例（9 重合计 72%） */
export const STAGE_RATIO = 0.08;`;
if (!c.includes(oldConst)) { console.error('MISS const'); process.exit(1); }
c = c.split(oldConst).join(neuConst);

const oldFn = `export function realmXp(k: number): number {
  if (!Number.isFinite(k) || k < 0) return STEP_BASE_XP;
  return Math.round(STEP_BASE_XP * Math.pow(REALM_XP_MUL, Math.floor(k)));
}`;
const neuFn = `export function realmXp(k: number): number {
  if (!Number.isFinite(k) || k < 0) return BREAKTHROUGH_XP[0];
  const i = Math.max(0, Math.min(REALM_COUNT - 1, Math.floor(k)));
  return BREAKTHROUGH_XP[i];
}`;
if (!c.includes(oldFn)) { console.error('MISS fn'); process.exit(1); }
c = c.split(oldFn).join(neuFn);

const oldHead = `  *   本境突破所需修为 R(k) = 180 × 1.56^k   （k = 大境界序号 0~8）
  *   每一重 = R(k) × 8%    （9 重合计 72%）
  *   渡劫   = R(k) × 28%`;
const neuHead = `  *   本境总修为 R(k)：显式数组 BREAKTHROUGH_XP（合计 158617 ≈ 336min = 5.6h）
  *   每一重 = R(k) × 8%    （9 重合计 72%）
  *   渡劫   = R(k) × 28%`;
if (!c.includes(oldHead)) { console.error('MISS head'); process.exit(1); }
c = c.split(oldHead).join(neuHead);

fs.writeFileSync(p, c, 'utf8');
console.log('OK');
