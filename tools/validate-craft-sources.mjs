#!/usr/bin/env node
/**
 * validate-craft-sources.mjs —— 通货「三种来源是否都通」审计（lead 高优先任务）
 *
 * 要回答的问题：
 *   1. 黄阶 / 灭 / 洗 三种通货，是不是都真的在产出？（`rollCurrency` 有 `minFloor`，
 *      洗灵石 minFloor=3 —— 有没有可能被饿死在某段，玩家到层 19 都没见过某个石头？）
 *   2. 权重 黄45 / 灭40 / 洗15，实际产出比例是否贴合？（宽松判据：洗/黄 ∈ [0.25, 0.45]，
 *      理论值 15/45 = 0.333）
 *   3. 每一层段（1~9 / 10~18 / 19~27）各自是否都有三种产出？
 *
 * 方法：真 createSession + startWave + tickSession 跑 2h（默认 3 种子），
 *      用 tools/session-runner.mjs 逐帧按「当前所在层」记账（口袋增量 = 产出），
 *      不重算任何掉率公式——只观测 session 自己发出来的东西。
 *
 * 用法：
 *   node tools\validate-craft-sources.mjs                       # 2h × 3 种子
 *   node tools\validate-craft-sources.mjs --minutes=120 --seeds=3 --json=tools\_craft-sources.json
 *
 * 退出码：0 = 全部硬判据通过；1 = 有硬判据失败（便于以后进 CI）。
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

const MINUTES = Math.max(1, Number(args.minutes ?? 120));
const SEEDS = Math.max(1, Number(args.seeds ?? 3));
const BASE_SEED = Number(args['base-seed'] ?? 20261021);
const STEP_SEED = Number(args['seed-step'] ?? 1013);
const DT = Number(args.dt ?? 1 / 30);
const CLASS_ID = args.class ?? 'yujian';
// lead m01845：session 默认 autoTalents=true（自动点天赋，真实玩家体验）；
// 与事故前定稿对照时用 none（天赋点攒着不花）。默认 none，保证历史口径可复现。
const TALENTS_RAW = (args.talents ?? 'none').trim();
const AUTO_TALENTS = !(TALENTS_RAW === 'none' || TALENTS_RAW === 'off' || TALENTS_RAW === '0');
const TALENT_LABEL = AUTO_TALENTS ? 'auto（自动点天赋）' : 'none（不点天赋）';
const JSON_OUT = args.json ?? null;

// 判据
const RATIO_MIN = 0.25; // 洗/黄 下界
const RATIO_MAX = 0.45; // 洗/黄 上界
const BANDS = [
  { id: '层 1~9', lo: 1, hi: 9 },
  { id: '层 10~18', lo: 10, hi: 18 },
  { id: '层 19~27', lo: 19, hi: 27 },
];
const IDS = /** @type {const} */ (['huang', 'mie', 'xi']);
const NAME = { huang: '黄阶灵石', mie: '灭灵石', xi: '洗灵石' };

const f = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const med = (xs) => {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (v.length === 0) return NaN;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

const { load, close } = await openSrc();
let failedHard = false;
const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok, detail });
  if (!ok) failedHard = true;
};

try {
  const sessionMod = await load('src/core/session.ts');
  const craftMod = await load('src/core/crafting.ts');
  const progMod = await load('src/core/progression.ts');
  const monstersMod = await load('src/data/monsters.ts');
  const currencyMod = await load('src/data/currency.ts');
  const { CURRENCIES } = currencyMod;
  // currency.ts 导出的是数组；按 id 建索引方便查 weight / minFloor
  const CUR = Object.fromEntries(CURRENCIES.map((c) => [c.id, c]));
  const { Rng } = await load('src/core/rng.ts');
  const { ITEM_BASES } = await load('src/data/bases.ts');
  const { AFFIXES } = await load('src/data/affixes.ts');
  const TABLES = { bases: ITEM_BASES, affixes: AFFIXES };
  const mods = { sessionMod, craftMod, progMod, monstersMod };

  const runs = [];
  for (let i = 0; i < SEEDS; i++) {
    const seed = BASE_SEED + i * STEP_SEED;
    const r = runInstrumentedSession(mods, {
      classId: CLASS_ID,
      seed,
      tables: TABLES,
      autoTalents: AUTO_TALENTS,
      minutes: MINUTES,
      dt: DT,
      stopAtMaxStep: true,
    });
    if (args['json-runs']) fs.writeFileSync(args['json-runs'], JSON.stringify(r, null, 2), 'utf8');
    runs.push(r);
    process.stderr.write(
      `  seed ${seed}: ${f(r.minutes, 0)}min · 层 ${r.floor} · 黄 ${r.currencyProduced.huang} / 灭 ${r.currencyProduced.mie} / 洗 ${r.currencyProduced.xi}\n`,
    );
  }

  // 汇总（按层段 + 全局）：计数用「跨种子求和」，时长用中位
  const bandAgg = BANDS.map((b) => ({
    id: b.id,
    minutes: med(
      runs.map((r) => {
        const x = r.bandStats.find((s) => s.id === b.id);
        return x ? x.minutes : 0;
      }),
    ),
    produced: Object.fromEntries(
      IDS.map((id) => [id, runs.reduce((a, r) => {
        const x = r.bandStats.find((s) => s.id === b.id);
        return a + (x ? x.produced[id] : 0);
      }, 0)]),
    ),
  }));
  const globalProduced = Object.fromEntries(IDS.map((id) => [id, runs.reduce((a, r) => a + r.currencyProduced[id], 0)]));
  const totalMinutes = runs.reduce((a, r) => a + r.minutes, 0);

  // 「层 ≥ 洗灵石 minFloor」口径：层 1~2 按配置不可能产出洗灵石，会把全局分母稀释
  const XI_MIN_FLOOR = CUR.xi.minFloor;
  const postFloors = runs.flatMap((r) => r.floorStats.filter((x) => x.floor >= XI_MIN_FLOOR));
  const lowFloors = runs.flatMap((r) => r.floorStats.filter((x) => x.floor < XI_MIN_FLOOR));
  const postProduced = Object.fromEntries(IDS.map((id) => [id, postFloors.reduce((a, x) => a + x.produced[id], 0)]));
  const postMinutes = postFloors.reduce((a, x) => a + x.minutes, 0);
  const lowMinutes = lowFloors.reduce((a, x) => a + x.minutes, 0);
  const postRatio = postProduced.huang > 0 ? postProduced.xi / postProduced.huang : NaN;
  const postShare = postProduced.xi / (postProduced.huang + postProduced.mie + postProduced.xi);

  // 权重直测：绕开 session，直接对 rollCurrency 抽大样本，验证权重本身没被写错
  const DRAW = 100000;
  const direct = Object.fromEntries(
    [1, 2, 5, 20].map((fl) => {
      const rng = new Rng(20261021 + fl);
      const c = { huang: 0, mie: 0, xi: 0 };
      for (let i = 0; i < DRAW; i++) {
        const cur = currencyMod.rollCurrency(rng, fl);
        if (cur) c[cur.id] += 1;
      }
      return [fl, c];
    }),
  );

  // 首次出现层
  const firstFloor = Object.fromEntries(
    IDS.map((id) => {
      const floors = runs.flatMap((r) => r.floorStats.filter((x) => x.produced[id] > 0).map((x) => x.floor));
      return [id, floors.length ? Math.min(...floors) : NaN];
    }),
  );

  // --- 输出 ---
  console.log(`# 通货来源审计（三种是否都通）· ${new Date().toISOString()}`);
  console.log(`# ${SEEDS} 种子 × ${MINUTES}min · dt=${f(DT, 4)}s · class=${CLASS_ID} · talents=${TALENT_LABEL} · 真 session（不重算掉率公式）`);
  console.log(
    `# 权重（currency.ts）：${IDS.map((id) => `${NAME[id]} ${CUR[id].weight}`).join(' / ')}` +
      `；minFloor：${IDS.map((id) => `${NAME[id]} ${CUR[id].minFloor}`).join(' / ')}`,
  );
  console.log(
    `# 判据：每种 × 每层段 产出 > 0（硬）；洗/黄 ∈ [${RATIO_MIN}, ${RATIO_MAX}]（硬，理论 15/45=0.333）`,
  );
  console.log(
    `# 注意口径：洗灵石 minFloor=3，层 1~2 按设计不出它；rollCurrency 会先按 minFloor 过滤再归一权重。` +
      `所以洗/黄 的硬判据取「层 ≥ 3」口径，全局口径并列展示（会被低层时长稀释，仅参考）。`,
  );
  console.log('');

  console.log('## 表 1 · 按层段分列产出（跨种子求和）');
  console.log('');
  console.log(`| 层段 | 停留时长(min·中位) | ${NAME.huang} | ${NAME.mie} | ${NAME.xi} | 合计 | 洗/黄 | 每分钟合计 | 判定 |`);
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|---|');
  const bandVerdicts = [];
  for (const b of bandAgg) {
    const total = IDS.reduce((a, id) => a + b.produced[id], 0);
    const ratio = b.produced.huang > 0 ? b.produced.xi / b.produced.huang : NaN;
    const allPositive = IDS.every((id) => b.produced[id] > 0);
    const ok = allPositive;
    bandVerdicts.push({ id: b.id, allPositive, ratio, ok });
    console.log(
      `| ${b.id} | ${f(b.minutes, 1)} | ${b.produced.huang} | ${b.produced.mie} | ${b.produced.xi} | ${total} | ` +
        `${f(ratio, 3)} | ${f(b.minutes > 0 ? total / (b.minutes * SEEDS) : NaN, 2)} | ${ok ? '✓ 三种都有' : '✗ 有饿死'} |`,
    );
  }
  console.log(
    `| **全局** | ${f(totalMinutes, 1)} | ${globalProduced.huang} | ${globalProduced.mie} | ${globalProduced.xi} | ` +
      `${IDS.reduce((a, id) => a + globalProduced[id], 0)} | ${f(globalProduced.xi / globalProduced.huang, 3)} | ` +
      `${f(IDS.reduce((a, id) => a + globalProduced[id], 0) / totalMinutes, 2)} | — |`,
  );

  console.log('');
  console.log('## 表 2 · 首次出现层（每种通货最早在第几层掉出来）');
  console.log('');
  console.log(`| 通货 | minFloor(currency.ts) | 实测首次出现层 | 说明 |`);
  console.log('|---|---:|---:|---|');
  for (const id of IDS) {
    const mf = CUR[id].minFloor;
    const ff = firstFloor[id];
    const note = !Number.isFinite(ff) ? '整轮没出现过' : ff <= mf ? '符合配置' : `比配置晚 ${ff - mf} 层（正常，随机）`;
    console.log(`| ${NAME[id]} | ${mf} | ${Number.isFinite(ff) ? ff : '未出现'} | ${note} |`);
  }

  console.log('');
  console.log('## 表 3 · 逐种子产出');
  console.log('');
  console.log(`| 种子 | 时长(min) | 到达层 | ${NAME.huang} | ${NAME.mie} | ${NAME.xi} | 洗/黄 |`);
  console.log('|---|---:|---:|---:|---:|---:|---:|');
  for (const r of runs) {
    const ratio = r.currencyProduced.huang > 0 ? r.currencyProduced.xi / r.currencyProduced.huang : NaN;
    console.log(
      `| ${r.seed} | ${f(r.minutes, 1)} | ${r.floor} | ${r.currencyProduced.huang} | ${r.currencyProduced.mie} | ` +
        `${r.currencyProduced.xi} | ${f(ratio, 3)} |`,
    );
  }

  console.log('');
  console.log(`## 表 4 · 口径修正：层 ≥ ${XI_MIN_FLOOR}（洗灵石 minFloor）`);
  console.log('');
  console.log(`| 口径 | 停留时长(min) | ${NAME.huang} | ${NAME.mie} | ${NAME.xi} | 洗/黄 | 洗占比 |`);
  console.log('|---|---:|---:|---:|---:|---:|---:|');
  console.log(
    `| 层 < ${XI_MIN_FLOOR}（按配置无洗） | ${f(lowMinutes, 1)} | ${IDS.map((id) => lowFloors.reduce((a, x) => a + x.produced[id], 0)).join(' | ')} | — | — |`,
  );
  console.log(
    `| 层 ≥ ${XI_MIN_FLOOR}（硬判据口径） | ${f(postMinutes, 1)} | ${postProduced.huang} | ${postProduced.mie} | ` +
      `${postProduced.xi} | ${f(postRatio, 3)} | ${f(postShare * 100, 1)}% |`,
  );
  console.log(
    `| 全局（含层 < ${XI_MIN_FLOOR}，仅参考） | ${f(totalMinutes, 1)} | ${globalProduced.huang} | ${globalProduced.mie} | ` +
      `${globalProduced.xi} | ${f(globalProduced.xi / globalProduced.huang, 3)} | ` +
      `${f((globalProduced.xi / (globalProduced.huang + globalProduced.mie + globalProduced.xi)) * 100, 1)}% |`,
  );
  console.log(
    `- 稀释说明：层 < ${XI_MIN_FLOOR} 占 ${f((lowMinutes / totalMinutes) * 100, 1)}% 时长，却按设计 100% 不出洗灵石 → ` +
      `全局 洗/黄 会被系统性拉低；理论全局值 ≈ 0.333 × (1 − 低层时长占比)。`,
  );

  console.log('');
  console.log(`## 表 5 · 权重直测（绕开 session，直接抽 rollCurrency ${DRAW.toLocaleString()} 次/层）`);
  console.log('');
  console.log(`| 层 | ${NAME.huang} | ${NAME.mie} | ${NAME.xi} | 洗/黄 | 洗占比 | 理论 |`);
  console.log('|---:|---:|---:|---:|---:|---:|---|');
  for (const fl of [1, 2, 5, 20]) {
    const c = direct[fl];
    const tot = c.huang + c.mie + c.xi;
    const usable = CURRENCIES.filter((x) => fl >= x.minFloor);
    const wTot = usable.reduce((a, x) => a + x.weight, 0);
    const theory = IDS.filter((id) => usable.some((x) => x.id === id))
      .map((id) => `${NAME[id]} ${f((CUR[id].weight / wTot) * 100, 1)}%`)
      .join(' / ');
    console.log(
      `| ${fl} | ${c.huang} | ${c.mie} | ${c.xi} | ${f(tot > 0 ? c.xi / c.huang : NaN, 3)} | ` +
        `${f(tot > 0 ? (c.xi / tot) * 100 : NaN, 1)}% | ${theory} |`,
    );
  }

  // --- 硬判据 ---
  check('每种通货全局产出 > 0', IDS.every((id) => globalProduced[id] > 0), JSON.stringify(globalProduced));
  for (const b of bandVerdicts) {
    check(`层段 ${b.id} 三种都 > 0`, b.allPositive, JSON.stringify(b));
  }
  check(
    `层 ≥ ${XI_MIN_FLOOR} 洗/黄 ∈ [${RATIO_MIN}, ${RATIO_MAX}]`,
    postRatio >= RATIO_MIN && postRatio <= RATIO_MAX,
    `实测 ${f(postRatio, 3)}（理论 15/45=0.333；样本 洗 ${postProduced.xi} 个）`,
  );
  const d5 = direct[5];
  const d5Ratio = d5.xi / d5.huang;
  check(
    `权重直测 @层5 洗/黄 ∈ [0.30, 0.37]`,
    d5Ratio >= 0.3 && d5Ratio <= 0.37,
    `实测 ${f(d5Ratio, 3)}（黄 ${d5.huang} / 洗 ${d5.xi}，${DRAW} 抽）`,
  );
  check(
    `权重直测 @层2 洗灵石 = 0（minFloor 生效）`,
    direct[2].xi === 0 && direct[2].huang > 0,
    JSON.stringify(direct[2]),
  );

  // 全局口径只作「参考软判据」：被低层时长稀释，不影响通过与否
  const globalRatio = globalProduced.xi / globalProduced.huang;
  const globalOk = globalRatio >= RATIO_MIN && globalRatio <= RATIO_MAX;
  const softChecks = [
    {
      name: `全局 洗/黄 ∈ [${RATIO_MIN}, ${RATIO_MAX}]（软·参考）`,
      ok: globalOk,
      detail:
        `实测 ${f(globalRatio, 3)}${globalOk ? '' : `；低于下界但属预期稀释（层 < ${XI_MIN_FLOOR} 占 ` +
          `${f((lowMinutes / totalMinutes) * 100, 1)}% 时长）`}`,
    },
  ];

  console.log('');
  console.log('## 判定');
  console.log('');
  console.log('| # | 判据 | 结果 | 实测 |');
  console.log('|---:|---|---|---|');
  checks.forEach((c, i) => console.log(`| ${i + 1} | ${c.name} | ${c.ok ? '✓' : '✗'} | ${c.detail} |`));
  softChecks.forEach((c, i) => console.log(`| S${i + 1} | ${c.name} | ${c.ok ? '✓' : '⚠'} | ${c.detail} |`));
  console.log('');
  console.log(`- 综合判定：**${failedHard ? '不通过' : '通过'}**（硬判据 ${checks.filter((c) => c.ok).length}/${checks.length}）`);
  if (!failedHard) {
    console.log(
      `- 层 ≥ ${XI_MIN_FLOOR} 口径：洗/黄 ${f(postRatio, 3)}（带内）、洗占比 ${f(postShare * 100, 1)}%（理论 15%）` +
        `；三阶（玩家 76.8% 时间所在）洗 ${bandAgg[2].produced.xi} / 黄 ${bandAgg[2].produced.huang}`,
    );
  }

  if (JSON_OUT) {
    const payload = {
      generatedAt: new Date().toISOString(),
      params: { minutes: MINUTES, seeds: SEEDS, baseSeed: BASE_SEED, dt: DT, classId: CLASS_ID, autoTalents: AUTO_TALENTS },
      criteria: { ratioMin: RATIO_MIN, ratioMax: RATIO_MAX, ratioScope: `floor >= ${XI_MIN_FLOOR}` },
      weights: Object.fromEntries(IDS.map((id) => [id, { weight: CUR[id].weight, minFloor: CUR[id].minFloor }])),
      globalProduced,
      globalRatio,
      postProduced,
      postRatio,
      postShare,
      postMinutes,
      lowMinutes,
      direct,
      bandAgg,
      firstFloor,
      runs: runs.map((r) => ({
        seed: r.seed,
        minutes: r.minutes,
        floor: r.floor,
        produced: r.currencyProduced,
        bandStats: r.bandStats,
        floorStats: r.floorStats,
      })),
      checks,
      softChecks,
      pass: !failedHard,
    };
    fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
    fs.writeFileSync(JSON_OUT, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`\nJSON 已写入 ${JSON_OUT}`);
  }
} finally {
  await close();
}

if (failedHard) process.exitCode = 1;
