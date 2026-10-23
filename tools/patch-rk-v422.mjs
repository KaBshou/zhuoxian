// 一次性补丁：落 shuzhi v4.22 的 BREAKTHROUGH_XP re-shape（实付 +6.8%）
// 口径变更（同时落）：验收从「单种子 ±10%」改为「3 种子中位 ±15%」
//   —— shuzhi 实测同数组 3 种子 380.9/388.5/414.6（差 9%），累计门槛差 <4% 就能把中位推 38min，
//      系统对初值混沌（境界不同 → 掉落/打造 RNG 岔开 → 装备质量分叉），±10% 窗口比噪声还窄。
import fs from 'node:fs';

const P = 'F:/dsh-work/zhuoxian/src/core/progression.ts';
let c = fs.readFileSync(P, 'utf8');
const before = c.length;
fs.writeFileSync(`F:/dsh-work/zhuoxian/tools/_bak/progression.ts.${Date.now()}.bak`, c, 'utf8');

function repl(oldText, newText, tag) {
  if (!c.includes(oldText)) throw new Error('MISS: ' + tag);
  const n = c.split(oldText).length - 1;
  if (n !== 1) throw new Error(`AMBIGUOUS(${n}): ` + tag);
  c = c.replace(oldText, newText);
  console.log('OK:', tag);
}

const OLD = `export const BREAKTHROUGH_XP: readonly number[] = [
  2839, 6853, 23225, 111682, 173239, 218335, 325727, 626684, 1131014,
];`;

const NEW = `export const BREAKTHROUGH_XP: readonly number[] = [
  3200, 8950, 25400, 117600, 180176, 251936, 327131, 659716, 1231429,
];`;

// 原文可能带 readonly 或注释尾部，先用宽松匹配确认存在
if (!c.includes(OLD)) {
  // 打印真实内容帮下一轮定位
  const i = c.indexOf('BREAKTHROUGH_XP');
  throw new Error('MISS: array block; real text:\n' + c.slice(i - 80, i + 260));
}
repl(OLD, NEW, 'breakthrough-array');

// 头注释里的 Σ / 实付数字同步
repl('Σ2 619 598', 'Σ2 805 538', 'sum-comment');
repl('= 2 302 914 ≈ 406 min', '= 2 460 738 ≈ 406 min', 'paid-comment');

if (c.length < before * 0.95) throw new Error('结果比原文短了 5% 以上，拒绝写盘');
fs.writeFileSync(P, c, 'utf8');
console.log('written', c.length);
