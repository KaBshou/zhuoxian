#!/usr/bin/env node
/**
 * 24h 验收（D138）：周目链的**总时长**才是需求值，单轮满级不是。
 *
 * 为什么要有这个脚本：`TARGET_MAX_MINUTES = 260` 是初临（c0）的满级目标；周目时长天然更长
 * （c1≈312 / c2≈375 / c3≈539），拿 c0 的尺子去量周目 = 重复计罚（D101 第五条：聚合判据只能有一个出口）。
 * 需求（REQ 24h）真正说的是「玩满 24 小时之后还有东西」，所以判据是**累计**：
 *
 *   Σ 各周目满级中位 ∈ 24h ±15%（即 [1224, 1656] min）
 *
 * 用法：
 *   node tools/check-cycle-24h.mjs                     # 默认读 tmp/v137-c{0..3}.json
 *   node tools/check-cycle-24h.mjs a.json b.json c.json d.json
 */
import fs from 'node:fs';
import path from 'node:path';

const CHAIN_TARGET_MINUTES = 24 * 60;
const CHAIN_TOLERANCE = 0.15;
/** 相邻周目必须变慢：血 ×1.35^N 的必然推论（D140）。某轮比上一轮快 = 倍率/装备接错了。 */
const CYCLE_GROWTH_MIN = 1.05;
/** 死亡是计数、随时长线性涨 ⇒ 只能按比例判（D141）。c3 实测 10.86/小时。 */
const DEATHS_PER_HOUR_MAX = 15;
/** D150：单次死亡重做时长（半层 ≈ 0.9min）。死亡时间占比 = 次数 × 该值 ÷ 满级时长。
 *  为什么加这条：`死亡/小时` 的分母是爬升速度（D149.1 实测降怪血会让它变差），
 *  而这条的分子分母都是分钟 ⇒ 直接回答「我多少时间花在重做已经做过的事上」。
 *  适用域：c0~c3 记录；**c4+ 超 30% 才是「该动机制」的信号**。 */
const REWORK_MIN_PER_DEATH = 0.9;
const REWORK_SIGNAL_MAX = 0.3;
const LO = CHAIN_TARGET_MINUTES * (1 - CHAIN_TOLERANCE);
const HI = CHAIN_TARGET_MINUTES * (1 + CHAIN_TOLERANCE);

const files = process.argv.slice(2);
const paths = files.length
  ? files
  : [0, 1, 2, 3].map((c) => path.join('tmp', `v137-c${c}.json`));

const rows = [];
for (const p of paths) {
  if (!fs.existsSync(p)) {
    console.error(`❌ 找不到 ${p}`);
    process.exit(1);
  }
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  const v = j.verdict ?? {};
  const cycle = Number.isFinite(v.cycle) ? v.cycle : rows.length;
  const med = v.maxedMed;
  if (!Number.isFinite(med)) {
    console.error(`❌ ${p} 没有 maxedMed（是不是没跑 --post-cap？）`);
    process.exit(1);
  }
  rows.push({
    cycle,
    med,
    min: v.maxedMin,
    max: v.maxedMax,
    deaths: v.deathMed,
    wall: v.firstWallMin,
    pass: v.pass,
    rework: Number.isFinite(v.reworkMed) ? v.reworkMed : NaN,
    file: path.basename(p),
  });
}

const sum = rows.reduce((a, r) => a + r.med, 0);
const ok = sum >= LO && sum <= HI;

// ① 单调线：相邻周目比值
const growth = [];
for (let i = 1; i < rows.length; i += 1) {
  const ratio = rows[i - 1].med > 0 ? rows[i].med / rows[i - 1].med : NaN;
  growth.push({ from: rows[i - 1].cycle, to: rows[i].cycle, ratio, ok: Number.isFinite(ratio) && ratio >= CYCLE_GROWTH_MIN });
}
const growthOk = growth.every((g) => g.ok);

// ② 比例式死亡线：死亡/小时
const deathRates = rows.map((r) => ({
  cycle: r.cycle,
  perHour: Number.isFinite(r.deaths) && r.med > 0 ? r.deaths / (r.med / 60) : NaN,
}));
for (const d of deathRates) d.ok = Number.isFinite(d.perHour) && d.perHour <= DEATHS_PER_HOUR_MAX;
const deathRateOk = deathRates.every((d) => d.ok);

console.log('# 24h 周目链验收（D138）');
console.log('');
console.log('| 周目 | 满级中位(min) | (h) | min/max | 死亡中位 | 首次撞墙层 | 来源 |');
console.log('|---|---:|---:|---|---:|---:|---|');
for (const r of rows) {
  console.log(
    `| c${r.cycle} | ${r.med.toFixed(1)} | ${(r.med / 60).toFixed(2)} | ${fmt(r.min)}/${fmt(r.max)} | ${fmt(r.deaths)} | ${fmt(r.wall)} | ${r.file} |`,
  );
}
console.log('');
console.log(
  `- 累计：**${(sum / 60).toFixed(2)}h**（${rows.length} 轮）｜目标 ${CHAIN_TARGET_MINUTES / 60}h，窗口 [${(LO / 60).toFixed(1)}, ${(HI / 60).toFixed(1)}]h → **${ok ? '通过' : '不通过'}**`,
);
console.log(
  `- 说明：单轮满级窗口只对 c0 生效（c≥1 只记录），因为 260min 是初临的目标；周目的需求是「24h 之后还有内容」，判的是累计。`,
);

console.log(`- 死亡时间占比（**D150 记录项，同量纲**）：${rows.map((r) => "c" + r.cycle + " " + (Number.isFinite(r.rework) ? (r.rework * 100).toFixed(1) + "%" : "—")).join(" / ")}` + `（分子分母都是分钟；c4+ 超 ${(REWORK_SIGNAL_MAX * 100).toFixed(0)}% 才是「该动机制」的信号，c0~c3 只记录）`);
console.log("");
console.log(`- 单调线（硬线，D140）：相邻周目比值 ≥ ${CYCLE_GROWTH_MIN}`);
for (const g of growth) {
  console.log(`  - c${g.from} → c${g.to}：${Number.isFinite(g.ratio) ? g.ratio.toFixed(3) : "—"} ${g.ok ? "✓" : "❌ 某轮变快了（倍率或装备接错）"}`);
}

console.log(`- 死亡比例（硬线，D141）：≤ ${DEATHS_PER_HOUR_MAX} 次/小时`);
for (const d of deathRates) {
  console.log(`  - c${d.cycle}：${Number.isFinite(d.perHour) ? d.perHour.toFixed(2) : "—"} 次/小时 ${d.ok ? "✓" : "❌"}`);
}

if (!growthOk || !deathRateOk) {
  console.log("");
  console.log(`❌ 结构线未通过（单调 ${growthOk ? "✓" : "❌"} / 死亡比例 ${deathRateOk ? "✓" : "❌"}）`);
}

if (!ok || !growthOk || !deathRateOk) process.exitCode = 1;

function fmt(x) {
  return Number.isFinite(x) ? String(Math.round(x * 10) / 10) : '—';
}
