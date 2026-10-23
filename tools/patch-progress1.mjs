// 一次性补丁：progression.ts 换 BREAKTHROUGH_XP 显式数组（shuzhi 定稿 BALANCE v2 §4）。
// R(k) = 180×1.56^k 合计只有 154min；表 C 25638min 不自洽（相邻比值非常数）；
// shuzhi 最终给数组 158617 = 336min = 5.6h。跑完即弃。
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/src/core/progression.ts';
let c = fs.readFileSync(p, 'utf8');

const oldConst = `export const STEP_BASE_XP = 100;
export const REALM_XP_MUL = 2.6;
export const STAGE_XP_MUL = 1.1;`;
const neuConst = `/** 每个大境界的总修为（BALANCE v2 §4，shuzhi 2026-10-22 定稿的显式数组）。
 * 合计 158617，按修为/小时曲线摊出 336 分钟 ≈ 5.6 小时「境界圆满」。
 * 旧的 100×2.6^realm×1.1^stage 在 step 9 处跌破前值（199→160），已作废；
 * 几何式 180×1.56^k 合计只有 154 分钟，与表 C 差 45%，也作废 —— 显式数组最稳。 */
export const BREAKTHROUGH_XP: readonly number[] = [
  783, 2796, 5816, 10149, 15658, 21389, 27960, 34083, 39983,
];
/** 每重占本境总修为的比例（渡劫 = 最后一重） */
export const STAGE_RATIO = 0.08;
export const TRIBULATION_RATIO = 0.28;`;
if (!c.includes(oldConst)) { console.error('MISS const'); process.exit(1); }
c = c.split(oldConst).join(neuConst);
fs.writeFileSync(p, c, 'utf8');
console.log('OK step1');
