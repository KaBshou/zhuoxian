#!/usr/bin/env node
/**
 * craft-econ.mjs —— 2 小时真 session 的通货收支验收（D28 之后，lead m01453 派活）
 *
 * 问题背景（BALANCE/D28）：改前 2 小时里黄阶灵石只花掉 46%，pocket 无限堆积。
 * D28 改了：①黄阶权重 45/灭 40/洗 15；②craftAddAffix 在「全员满条」时降级成
 * craftReforgeWorstAffix（重掷战力权重最低的那条，PoE chaos orb 语义）。
 *
 * 本工具**不自己重算任何公式**：打造一律走 src/core/crafting.ts 的 runCraftPlan
 * （计划由 session.craftPlanFromPocket 生成，与线上自动打造同一套），只是把
 * 「session 内部每 15 秒的自动打造」搬到 tools 循环里以便观测（见 session-runner.mjs）。
 *
 * 验收目标（lead m01453，D28 后的新预期）：
 *   - 黄阶灵石 花掉率 ≥85%（改前 46%）
 *   - 灭灵石 / 洗灵石 花掉率 ≥95%
 *
 * 用法：
 *   node tools\craft-econ.mjs                         # 2h × 3 种子
 *   node tools\craft-econ.mjs --minutes=60 --seeds=1  # 冒烟
 *   node tools\craft-econ.mjs --json=tools\_craft-econ.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { openSrc } from './vite-loader.mjs';
import { runInstrumentedSession } from './session-runner.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v === undefined ? '1' : v];
  }),
);

const SEEDS = Math.max(1, Number(args.seeds ?? 3));
const BASE_SEED = Number(args['base-seed'] ?? 20261021);
const STEP_SEED = Number(args['seed-step'] ?? 1013);
const MINUTES = Math.max(1, Number(args.minutes ?? 120));
const DT = Number(args.dt ?? 1 / 30);
const CLASS_ID = args.class ?? 'yujian';
const TALENTS = (args.talents ?? '').split(',').map((x) => x.trim()).filter(Boolean);
const JSON_OUT = args.json ?? null;

const CURRENCY_IDS = ['huang', 'mie', 'xi'];
const CURRENCY_NAME = { huang: '黄阶灵石', mie: '灭灵石', xi: '洗灵石' };
// 验收目标（lead m01453）
const TARGET_SPEND_RATE = { huang: 0.85, mie: 0.95, xi: 0.95 };

const f = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const pct = (x) => (Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : '—');
const med = (xs) => {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return NaN;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
};

const { load, close } = await openSrc();
try {
  const sessionMod = await load('src/core/session.ts');
  const craftMod = await load('src/core/crafting.ts');
  const progMod = await load('src/core/progression.ts');
  const { ITEM_BASES } = await load('src/data/bases.ts');
  const { AFFIXES } = await load('src/data/affixes.ts');
  const { CURRENCIES } = await load('src/data/currency.ts');
  const TABLES = { bases: ITEM_BASES, affixes: AFFIXES };
  const mods = { sessionMod, craftMod, progMod };

  const runs = [];
  for (let i = 0; i < SEEDS; i++) {
    const seed = BASE_SEED + i * STEP_SEED;
    const t0 = Date.now();
    const r = runInstrumentedSession(mods, {
      classId: CLASS_ID,
      seed,
      tables: TABLES,
      talentIds: TALENTS,
      minutes: MINUTES,
      dt: DT,
      stopAtMaxStep: false, // 2h 内满级也继续跑完（要看完整收支）
    });
    r.wallMs = Date.now() - t0;
    runs.push(r);
    process.stderr.write(
      `  seed ${seed}: ${f(r.minutes, 1)}min · 层 ${r.floor} · step ${r.step} · 死 ${r.deaths} · ` +
        `黄 ${r.currencyProduced.huang}/${r.currencySpent.huang} · 灭 ${r.currencyProduced.mie}/${r.currencySpent.mie} · ` +
        `洗 ${r.currencyProduced.xi}/${r.currencySpent.xi} · ${r.wallMs}ms\n`,
    );
  }

  const spendRate = (produced, spent) => (produced > 0 ? spent / produced : NaN);

  console.log(`# 通货收支验收（D28 后）· 真实 session 全程模拟 · ${new Date().toISOString()}`);
  console.log(
    `# ${SEEDS} 种子 · ${MINUTES}min/种子 · dt=${f(DT, 4)}s · class=${CLASS_ID} · talents=${TALENTS.length ? TALENTS.join(',') : '无'}`,
  );
  console.log(
    `# 权重：${CURRENCIES.map((c) => `${c.name} ${c.weight}`).join(' / ')}（数据来自 src/data/currency.ts）`,
  );
  console.log(
    `# 判据：黄阶 花掉率 ≥${pct(TARGET_SPEND_RATE.huang)}（改前 46%）、灭/洗 ≥${pct(TARGET_SPEND_RATE.mie)} / ${pct(TARGET_SPEND_RATE.xi)}`,
  );
  console.log('');

  // ── 表 1 · 全局收支（多种子中位数） ──
  console.log('## 表 1 · 全局收支（多种子中位数）');
  console.log('');
  console.log('| 通货 | 产出 | 花掉 | 花掉率 | 池底(期末) | 产出/min | 判定 |');
  console.log('|---|---:|---:|---:|---:|---:|---|');
  const overall = {};
  for (const id of CURRENCY_IDS) {
    const produced = med(runs.map((r) => r.currencyProduced[id]));
    const spent = med(runs.map((r) => r.currencySpent[id]));
    const pool = med(runs.map((r) => r.pocketEnd[id] ?? 0));
    const rate = spendRate(produced, spent);
    overall[id] = { produced, spent, pool, rate };
    const ok = Number.isFinite(rate) && rate >= TARGET_SPEND_RATE[id];
    console.log(
      `| ${CURRENCY_NAME[id]} | ${f(produced, 0)} | ${f(spent, 0)} | ${pct(rate)} | ${f(pool, 0)} | ` +
        `${f(produced / med(runs.map((r) => r.minutes)), 2)} | ${ok ? '✓' : '**✗**'} |`,
    );
  }

  // ── 表 2 · 分层段收支 ──
  console.log('');
  console.log('## 表 2 · 分层段收支（时段归属：按该 15 秒结算时玩家所在层）');
  console.log('');
  console.log('| 层段 | 时长(min) | 法宝 | 玉简 | 通货产出 | 通货花掉 | 花掉率 | 该段净沉淀 |');
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|');
  const bandIds = runs[0].bandStats.map((b) => b.id);
  for (const bandId of bandIds) {
    const bands = runs.map((r) => r.bandStats.find((b) => b.id === bandId));
    const bandMinutes = med(bands.map((b) => b.minutes));
    let produced = 0;
    let spent = 0;
    for (const id of CURRENCY_IDS) {
      produced += med(bands.map((b) => b.produced[id]));
      spent += med(bands.map((b) => b.spent[id]));
    }
    const items = med(bands.map((b) => b.itemDrops));
    const gems = med(bands.map((b) => b.gems));
    console.log(
      `| ${bandId} | ${f(bandMinutes, 1)} | ${f(items, 0)} | ${f(gems, 0)} | ${f(produced, 0)} | ` +
        `${f(spent, 0)} | ${pct(spendRate(produced, spent))} | ${f(produced - spent, 0)} |`,
    );
  }

  // ── 表 3 · 逐种子明细 ──
  console.log('');
  console.log('## 表 3 · 逐种子明细');
  console.log('');
  console.log('| 种子 | 时长(min) | 到达层 | step | 死亡 | 法宝 | 玉简 | 通货产出 | 通货花掉 | 打造有效/空转 |');
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|---|');
  for (const r of runs) {
    const produced = CURRENCY_IDS.reduce((a, id) => a + r.currencyProduced[id], 0);
    const spent = CURRENCY_IDS.reduce((a, id) => a + r.currencySpent[id], 0);
    console.log(
      `| ${r.seed} | ${f(r.minutes, 1)} | ${r.floor} | ${r.step} | ${r.deaths} | ${r.itemDrops} | ${r.gemProduced} | ` +
        `${produced} | ${spent} | ${r.craftLog.executed}/${r.craftLog.failedTicks} |`,
    );
  }

  // ── 表 4 · 逐种子逐通货花掉率（看离散度） ──
  console.log('');
  console.log('## 表 4 · 逐种子花掉率（看离散度）');
  console.log('');
  console.log(`| 种子 | ${CURRENCY_IDS.map((id) => CURRENCY_NAME[id]).join(' | ')} |`);
  console.log(`|---|${CURRENCY_IDS.map(() => '---:').join('|')}|`);
  for (const r of runs) {
    const cells = CURRENCY_IDS.map((id) => {
      const rate = spendRate(r.currencyProduced[id], r.currencySpent[id]);
      return `${pct(rate)} (${r.currencyProduced[id]}/${r.currencySpent[id]})`;
    });
    console.log(`| ${r.seed} | ${cells.join(' | ')} |`);
  }

  const pass = CURRENCY_IDS.every((id) => Number.isFinite(overall[id].rate) && overall[id].rate >= TARGET_SPEND_RATE[id]);
  console.log('');
  console.log(
    `- 综合判定：**${pass ? '通过' : '不通过'}** — ` +
      CURRENCY_IDS.map((id) => `${CURRENCY_NAME[id]} ${pct(overall[id].rate)}（目标 ${pct(TARGET_SPEND_RATE[id])}）`).join('、'),
  );
  if (!pass) {
    const huang = overall.huang.rate;
    console.log(
      `- ⚠ 黄阶花掉率 ${pct(huang)} 未达标：按 lead m01453，这说明 \`craftReforgeWorstAffix\` 的触发条件写窄了` +
        `（候选取 \`craftTargets\` = 身上 + 背包战力前 ${craftMod.CRAFT_BAG_TOP}；满条才降级）。` +
        `下一步可查：①候选里「有灵纹但未满条」的件数是否长期为 0；②\`rerollAffixAt\` 是否常因池子/标签不匹配返回失败。`,
    );
  }

  if (JSON_OUT) {
    const payload = {
      generatedAt: new Date().toISOString(),
      params: { seeds: SEEDS, baseSeed: BASE_SEED, minutes: MINUTES, dt: DT, classId: CLASS_ID, talents: TALENTS },
      targets: TARGET_SPEND_RATE,
      overall,
      verdict: { pass },
      runs,
    };
    fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
    fs.writeFileSync(JSON_OUT, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`\nJSON 已写入 ${JSON_OUT}`);
  }
} finally {
  await close();
}
