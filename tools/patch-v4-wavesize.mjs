// v4 落地第二步：session.ts WAVE_SIZE 10→6（BALANCE v4 D18：命中/波 ∝ 同屏数，
// 波 10 实测 62 下/波，波 6 = 26 下）。
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/src/core/session.ts';
let c = fs.readFileSync(p, 'utf8');
let miss = 0;
function repl(oldS, neu, tag) {
  if (!c.includes(oldS)) { console.error('MISS: ' + tag); miss++; return; }
  c = c.replace(oldS, neu);
  console.log('OK: ' + tag);
}

repl(
  `/** 一波几只普通怪。
 *  ceshi diag-floor 实测（2026-10-22）：18 只同屏入伤 195.6~654.4/波 vs 气血 142~358，
 *  2~4 秒团灭；层 1/13/18/27 十分钟清波 0 次 → 波末回气永远触发不了（死循环，
 *  层 27 十分钟 75 死、击杀 0）。压到 10（= BALANCE §8 表 G 原始口径）：入伤 −44%，
 *  击杀率基本不变（玩家逐只杀，波容量不限制杀怪速度）。 */
export const WAVE_SIZE = 10;`,
  `/** 一波几只普通怪。v4 D18 定稿 6：命中/波 ≈ 平方于同屏人数（shuzhi 实测
 *  波 4 = 11.3 下、波 6 = 26.0、波 8 = 41.2、波 10 = 62.4），表 G 假设的
 *  「8 下/波」在波 10 下实际是 62~79 下，差 8~10 倍。波 4 太松（层 18 只 3%）、
 *  波 8 起压不住，6 是唯一落窗值。 */
export const WAVE_SIZE = 6;`,
  'WAVE_SIZE',
);

if (miss > 0) process.exit(1);
fs.writeFileSync(p, c, 'utf8');
console.log('written');
