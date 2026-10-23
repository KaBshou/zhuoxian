#!/usr/bin/env node
/**
 * v4.37 常量重标（shuzhi 定稿）：
 *  - 满级目标 330 → 300（= GDD 段③ 5h；D78 修好 castSpeed 后实测中位 297.6 = −0.8%）
 *  - 窗口 [300,385] → [270,345]（−10%/+15%，不对称）
 *  - 副红线 290 → 250（261 只剩 4min 余量，换种子必红；250 有 15min = 5.7%）
 *  - FORMED_RATIO 0.62 保持 → 目标自动 = 186；段② 窗口上沿改成 1.15× 目标（214）
 *  - 段② 相对红线：逐种子 0.85（噪声开关）→ **中位比值 ≤0.75 + 逐种子 ≤0.98 兜底**
 *    （该比值跨种子摆 0.44~0.89 = 45pp，逐种子 0.85 只剩 5pp 余量）
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const P = 'tools/run-timeline.mjs';
const raw = readFileSync(P, 'utf8');
const crlf = raw.includes('\r\n');
let c = raw.replace(/\r\n/g, '\n');
const before = c.length;

function rep(oldText, newText, tag) {
  if (!c.includes(oldText)) throw new Error('MISS ' + tag);
  c = c.replace(oldText, newText);
}

// 1) 满级目标 + 窗口
rep(
  [
    '// D64：满级目标 330min（GDD 1.7 的 5h=300min 是毛估，406 从不是需求值）。',
    '// 传奇效果把中位从 351.3 压到 322.2 之后重标：**改目标而不是放宽窗口** ——',
    '// 只放宽窗口等于把「变快了」记成「还在窗口里」，那这套门禁就只剩装饰作用。',
    '// 窗口取 shuzhi 定的显式上下界 [300, 385]，不用 ±15% 对称区间（不对称）。',
    'const TARGET_MAX_MINUTES = 330;',
    'const MAX_MIN_MINUTES = 300;',
    'const MAX_MAX_MINUTES = 385;',
  ].join('\n'),
  [
    '// D79（shuzhi v4.37）：满级目标 330 → **300** —— 300 就是 GDD 段③ 的 5h 需求值，',
    '// 之前用 330 是 D64 为「传奇让玩家变快」做的让步；D78 修好 castSpeed 后实测中位 297.6，',
    '// 与 300 差 −0.8%，正好落回需求值 —— 不再需要让步。',
    '// 窗口显式 [270, 345]（−10% / +15%），不用 ±15% 对称区间（实测分布偏左）。',
    '// 纪律（D64 沿用）：**改目标而不是只放宽窗口** —— 只放宽窗口等于把「变快了」记成「还在窗口里」。',
    'const TARGET_MAX_MINUTES = 300;',
    'const MAX_MIN_MINUTES = 270;',
    'const MAX_MAX_MINUTES = 345;',
  ].join('\n'),
  'target/window',
);

// 2) 副红线 290 → 250
rep(
  [
    '// 副红线（D64）：任一种子跌破 290min 就算红 —— 中位好看但某个种子飞快，',
    '// 说明这条曲线在种子维度上不稳。',
    'const FLOOR_MIN_MINUTES = 290;',
  ].join('\n'),
  [
    '// 副红线（D79）：任一种子跌破 250min 就算红 —— 中位好看但某个种子飞快，',
    '// 说明这条曲线在种子维度上不稳。',
    '// 为什么不是 261（= 300×0.87）：实测最差 265，261 只剩 4min（1.4%）余量，换种子必红；',
    '// 250 给 15min（5.7%）余量，同时仍能抓住「某颗种子快到离谱」这种真事故。',
    'const FLOOR_MIN_MINUTES = 250;',
  ].join('\n'),
  'floor-min',
);

// 3) 段② 绝对上限：260 硬编码 → 按目标窗口上沿
rep(
  [
    '// 绝对上限只作「明显失控」的粗筛，不当中位窗口用；真正的红线是下面的相对线。',
    'const FORMED_MAX = 260;',
  ].join('\n'),
  [
    '// 绝对上限 = 目标 × 1.15（D79：目标随 TARGET_MAX_MINUTES 缩放，这里也只许跟着算，不许写死）。',
    '// 它仍只作「明显失控」的粗筛；真正的红线是下面的相对线。',
    'const FORMED_MAX = Math.round(FORMED_TARGET * 1.15);',
  ].join('\n'),
  'formed-max',
);

// 4) 段② 相对红线：逐种子 0.85 → 中位 0.75 + 逐种子 0.98
rep(
  [
    '// **相对副红线**：段② 必须给段③ 留出 ≥15% 的时间。',
    '// 为什么不设绝对线：6 种子成型 148.3~254.6（CV 20%），设 240 → 2/6 假红；设 260 → 把真烂尾放行。',
    '// 相对线随种子同向漂移，噪声自消（实测最差 0.788，余量 6.2pp）。',
    'const FORMED_MAX_REL = 0.85;',
  ].join('\n'),
  [
    '// **相对副红线**（shuzhi v4.37 改判）：段② 必须给段③ 留出 ≥25% 的时间。',
    '// 为什么不设绝对线：6 种子成型 148.3~254.6（CV 20%），设 240 → 2/6 假红；设 260 → 把真烂尾放行。',
    '// 为什么不逐种子卡 0.85：这个比值**跨种子摆 0.44~0.89（45pp）**（成型由最倒霉的那个部位决定，',
    '// 与满级不同源），逐种子 0.85 只剩 5pp、0.90 只剩 1pp —— 都是噪声开关，不是判据。',
    '// 改法：主判 **中位比值 ≤ 0.75**（实测 0.617，余 13pp），副判逐种子 ≤ 0.98（只抓真事故：',
    '// 成型贴在满级上 / 成型晚于满级）。',
    'const FORMED_REL_MEDIAN_MAX = 0.75;',
    'const FORMED_REL_SEED_MAX = 0.98;',
  ].join('\n'),
  'formed-rel-const',
);

rep(
  [
    '  const formedRelWorst = formedRel.reduce((a, b) => (!Number.isFinite(a.ratio) ? b : !Number.isFinite(b.ratio) ? a : b.ratio > a.ratio ? b : a), { ratio: 0, seed: 0 });',
    '  const formedRelOk = formedRel.every((x) => !Number.isFinite(x.maxed) || x.ratio <= FORMED_MAX_REL);',
  ].join('\n'),
  [
    '  const formedRelWorst = formedRel.reduce((a, b) => (!Number.isFinite(a.ratio) ? b : !Number.isFinite(b.ratio) ? a : b.ratio > a.ratio ? b : a), { ratio: 0, seed: 0 });',
    '  const formedRelMed = med(formedRel.map((x) => x.ratio));',
    '  const formedRelMedOk = Number.isFinite(formedRelMed) && formedRelMed <= FORMED_REL_MEDIAN_MAX;',
    '  const formedRelSeedOk = formedRel.every((x) => !Number.isFinite(x.maxed) || x.ratio <= FORMED_REL_SEED_MAX);',
    '  const formedRelOk = formedRelMedOk && formedRelSeedOk;',
  ].join('\n'),
  'formed-rel-calc',
);

rep(
  [
    '    `- 段② 相对副红线（成型/满级 ≤ ${FORMED_MAX_REL}）：最差 ${Number.isFinite(formedRelWorst.ratio) ? pct(formedRelWorst.ratio) : "—"}` +',
    '      `（种子 ${formedRelWorst.seed}）→ **${formedRelOk ? "通过" : "不通过"}**（绝对上限 ${FORMED_MAX}min 只记录）`,',
  ].join('\n'),
  [
    '    `- 段② 相对副红线（中位 成型/满级 ≤ ${FORMED_REL_MEDIAN_MAX}，逐种子 ≤ ${FORMED_REL_SEED_MAX} 兜底）：` +',
    '      `中位 ${Number.isFinite(formedRelMed) ? pct(formedRelMed) : "—"}、最差 ${Number.isFinite(formedRelWorst.ratio) ? pct(formedRelWorst.ratio) : "—"}` +',
    '      `（种子 ${formedRelWorst.seed}）→ **${formedRelOk ? "通过" : "不通过"}**（绝对上限 ${FORMED_MAX}min 只记录）`,',
  ].join('\n'),
  'formed-rel-print',
);

if (c.length < before * 0.9) throw new Error('长度断言失败：输出明显变短，拒绝写盘');
mkdirSync('tools/_bak', { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
copyFileSync(P, join('tools/_bak', 'run-timeline.mjs.' + stamp + '.bak'));
writeFileSync(P, crlf ? c.replace(/\n/g, '\r\n') : c, 'utf8');
console.log('patched ' + P + '：' + before + ' → ' + c.length + ' chars' + (crlf ? '（CRLF 保留）' : ''));
