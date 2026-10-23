#!/usr/bin/env node
/**
 * timeline-recommend.mjs —— 从 run-timeline.mjs 的 JSON 里反推「修为数组该怎么定」
 *
 * 背景：满级时长取决于两件事的比值——「每境需要多少修为」（progression.BREAKTHROUGH_XP）
 * 与「玩家每分钟能挣多少修为」（取决于层数/怪组/xpMul/击杀率，与数组无关）。
 * 所以数组定标不是拍脑袋乘系数，而是：
 *     数组[i] = 实测该境修为/min × 目标该境时长(min)
 *
 * 关键口径（2026-10-22 08:2x 落实，与 lead/shuzhi 都核对过）：
 *   - STAGE_RATIO = 0.09、TRIBULATION_RATIO = 0.28 → 前 8 境每境实付 8×0.09+0.28 = 1.00 × BREAKTHROUGH_XP
 *   - **末境例外**：TOTAL_STEPS = 81，step 80 的 xpForStep 是 Infinity，所以第 9 境的渡劫
 *     （0.28 × BREAKTHROUGH_XP[8]）永远不会被支付；末境实付只有 8×0.09 = 0.72 × BREAKTHROUGH_XP[8]。
 *   - 因此「满级消耗」= ΣBREAKTHROUGH[0..7] + 0.72×BREAKTHROUGH[8]，不是 Σ。
 *     反推末境数组值时要把「需要的消耗」除以 0.72 才是数组值。
 *
 * 用法：
 *   node tools\timeline-recommend.mjs                                   # 默认读 tools\_timeline-v50.json
 *   node tools\timeline-recommend.mjs --json=tools\_timeline-xxx.json
 *
 * 注意（一阶近似）：换数组后玩家在同一层的 step 会不同 → 战力/装备节奏变 → 收入变，
 * 所以推荐值只是起点，落地后必须重跑 run-timeline.mjs 复核。
 */
import fs from 'node:fs';
import { openSrc } from './vite-loader.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v === undefined ? '1' : v];
  }),
);
const FILE = args.json ?? 'tools/_timeline-v50.json';
const d = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const TARGET = d.targets.realmMinutes;
const segTarget = TARGET.map((x, i) => (i === 0 ? x : x - TARGET[i - 1]));
const med = (xs) => {
  const v = [...xs].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

// 读真实常量，别手抄
const { load, close } = await openSrc();
let finalRealmPaid = 0.72;
let sumArray = 0;
let maxStepXp = 0;
try {
  const p = await load('src/core/progression.ts');
  sumArray = p.BREAKTHROUGH_XP.reduce((a, b) => a + b, 0);
  finalRealmPaid = ((p.STAGES_PER_REALM - 1) * p.STAGE_RATIO) / ((p.STAGES_PER_REALM - 1) * p.STAGE_RATIO + p.TRIBULATION_RATIO);
  maxStepXp = p.totalXpToStep(p.TOTAL_STEPS - 1);
  console.log(`# 口径：STAGE_RATIO=${p.STAGE_RATIO} TRIBULATION_RATIO=${p.TRIBULATION_RATIO} STAGES_PER_REALM=${p.STAGES_PER_REALM}`);
  console.log(`# ΣBREAKTHROUGH_XP=${sumArray.toLocaleString()}；满级（step ${p.TOTAL_STEPS - 1}）实际消耗=${maxStepXp.toLocaleString()}`);
  console.log(
    `# 末境渡劫 ${(p.BREAKTHROUGH_XP[p.BREAKTHROUGH_XP.length - 1] * p.TRIBULATION_RATIO).toLocaleString()} 不被支付 → 末境实付比例 ${(finalRealmPaid * 100).toFixed(1)}%`,
  );
  console.log('');
} finally {
  await close();
}

// 第 j 境圆满（j=1..8）落在 realmArrivals[j]，第 9 境圆满 = 满级
const seg = [];
for (let j = 1; j <= 9; j++) {
  const xs = [];
  const ms = [];
  for (const r of d.runs) {
    const prevMin = j === 1 ? 0 : j === 9 ? r.realmArrivals[8] : r.realmArrivals[j - 1];
    const prevXp = j === 1 ? 0 : j === 9 ? r.realmCumXp[8] : r.realmCumXp[j - 1];
    const curMin = j === 9 ? r.maxedAt : r.realmArrivals[j];
    const curXp = j === 9 ? r.cumXp : r.realmCumXp[j];
    xs.push(curXp - prevXp);
    ms.push(curMin - prevMin);
  }
  seg.push({ xp: med(xs), min: med(ms) });
}

console.log(`# 修为定标反推 · 数据源 ${FILE}（${d.runs.length} 种子）`);
console.log('');
console.log('| 第几境 | 目标该境时长(min) | 实测该境时长(min) | 实测该境修为 | 实测修为/min | 该境需要的消耗 | 定标数组值 |');
console.log('|---|---:|---:|---:|---:|---:|---:|');
const recommended = [];
for (let j = 1; j <= 9; j++) {
  const rate = seg[j - 1].xp / seg[j - 1].min;
  const need = Math.round(rate * segTarget[j - 1]);
  const arrayValue = j === 9 ? Math.round(need / finalRealmPaid) : need;
  recommended.push(arrayValue);
  console.log(
    `| ${j} | ${segTarget[j - 1]} | ${seg[j - 1].min.toFixed(1)} | ${seg[j - 1].xp.toLocaleString()} | ` +
      `${rate.toFixed(0)} | ${need.toLocaleString()} | ${arrayValue.toLocaleString()} |`,
  );
}
const recSum = recommended.reduce((a, b) => a + b, 0);
console.log('');
console.log('推荐 BREAKTHROUGH_XP：');
console.log(JSON.stringify(recommended));
console.log(`Σ 数组值 ${recSum.toLocaleString()}（其中末境按 ${(finalRealmPaid * 100).toFixed(0)}% 实付折算）`);
console.log(`落到 src 后满级实际消耗 ≈ ${(recSum - recommended[8] + recommended[8] * finalRealmPaid).toLocaleString()}`);
console.log(`目标收入口径：满级消耗 / 406min = ${Math.round((recSum - recommended[8] + recommended[8] * finalRealmPaid) / 406).toLocaleString()} 修为/min`);
console.log('');
console.log('逐境偏差归因（当前 D34 数组 vs 实测收入）：');
console.log('| 第几境圆满 | 当前数组 | 该境实付 | 实付消耗 | 实测收入/min | 预测该境时长 | 预测累计 | 目标累计 |');
console.log('|---|---:|---:|---:|---:|---:|---:|---:|');
let t = 0;
let curTotal = 0;
const curArray = [5609, 16195, 37214, 121739, 149139, 183474, 200000, 350000, 450000];
for (let j = 1; j <= 9; j++) {
  const rate = seg[j - 1].xp / seg[j - 1].min;
  const paid = j === 9 ? curArray[8] * finalRealmPaid : curArray[j - 1];
  const mins = paid / rate;
  t += mins;
  curTotal += segTarget[j - 1];
  console.log(
    `| ${j} | ${curArray[j - 1].toLocaleString()} | ${j === 9 ? `${(finalRealmPaid * 100).toFixed(0)}%` : '100%'} | ` +
      `${Math.round(paid).toLocaleString()} | ${rate.toFixed(0)} | ${mins.toFixed(1)} | ${t.toFixed(1)} | ${curTotal} |`,
  );
}
console.log('');
console.log('注：一阶近似。收入随层数/step 变化，换数组后玩家在同一层的 step 会变，落地后必须重跑 run-timeline.mjs 复核。');
