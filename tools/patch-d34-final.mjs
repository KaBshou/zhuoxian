// 一次性补丁：落 shuzhi D34 定稿数组（v4.12，含回馈项 + 末境 ÷0.72）（跑完即弃）
import fs from 'node:fs';

const prog = 'F:/dsh-work/zhuoxian/src/core/progression.ts';
let c = fs.readFileSync(prog, 'utf8');

function repl(src, old, neu, tag) {
  const n = src.split(old).length - 1;
  if (n !== 1) throw new Error(`MISS(${n}): ${tag}`);
  console.log('ok:', tag);
  return src.replace(old, neu);
}

c = repl(
  c,
  `export const BREAKTHROUGH_XP: readonly number[] = [
  5609, 16195, 37214, 121739, 149139, 183474, 200000, 350000, 450000,
];`,
  `export const BREAKTHROUGH_XP: readonly number[] = [
  2839, 6853, 23225, 111682, 173239, 218335, 325727, 626684, 1131014,
];`,
  'array',
);

// 头注释里的合计 / 时长要跟着改
c = repl(
  c,
  ` *   本境总修为 R(k)：显式数组 BREAKTHROUGH_XP（合计 1 513 370 ≈ 406 min = 6.8h）
 *   每一重 = R(k) × 9%    （9 重合计 81%）
 *   渡劫   = R(k) × 28%   ← 不对：见下方 STAGE_RATIO 注释`,
  ` *   本境总修为 R(k)：显式数组 BREAKTHROUGH_XP（Σ2 619 598）
 *   每一重 = R(k) × 9%    （8 重合计 72%）
 *   渡劫   = R(k) × 28%
 *   满级实付 = ΣR(0..7) + 0.72×R(8) = 2 302 914 ≈ 406 min = 6.8h
 *
 * 【末境渡劫永不支付】step 80 是终点，它的 xpForStep 返回 Infinity，
 * 所以第 9 境的渡劫（0.28×R(8) ≈ 316 684）永远不会被消耗 —— 末境实付只有 72%。
 * 反推数组时末境必须 ÷0.72，否则会固定短 ≈44 min（≈11%）。`,
  'header',
);

fs.writeFileSync(prog, c, 'utf8');

const t = 'F:/dsh-work/zhuoxian/tests/character.test.ts';
let tc = fs.readFileSync(t, 'utf8');
tc = repl(
  tc,
  `    expect(sum).toBe(1513370);`,
  `    expect(sum).toBe(2619598);`,
  'test-sum',
);
fs.writeFileSync(t, tc, 'utf8');
console.log('done');
