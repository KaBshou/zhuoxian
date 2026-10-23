/**
 * 夺造化（divineReforge）专项：满级后 3h 的渊痕花在它身上到底涨多少战力。
 *
 * 为什么要这个工具（lead m02404-3）：
 *   BALANCE §21.10 / data/marks.ts 铁律 1 写的是「有界强化：单件、灵纹 cap 1.3、不可叠加，
 *   3h 后收益必然归零」。但 `item.ts:improveAffixes(item, mul, cap)` 的实现里是 `void cap;`
 *   —— cap 参数**根本没生效**，而 marks-runtime 每次夺造化都调
 *   `improveAffixes(res.item, 1.3, 1.3)`，等价**无限叠加 ×1.3**。
 *   这个工具就是用来量「实际发生了什么」，并给出「按设计应该发生什么」的对照。
 *
 * 口径：
 *   - 角色 = 真 session 一路跑到满级（step 80）那一刻的装备/面板，不手搓装备；
 *   - 战力 = `inventory.characterPower()`（项目唯一战力函数，含 DPS/气血/护体权重）；
 *   - 单次提升 = (power_after - power_before) / power_before；
 *   - 3h 可刷次数 = floor(渊痕/分 × 180 / 1_000_000)，渊痕/分 取实测中位（默认 8881）；
 *   - 对照组 = 同样 100 万渊痕换 10 块洗灵石。**洗灵石是「全部灵纹重洗」= 重置不是叠加**，
 *     所以对同一件洗 10 次，最终战力就是「最后一次随机结果」；这里用 30 次独立单洗的分布
 *     给出「洗一次值多少」，再据此说 100 万换 10 洗的真实价值。
 *
 * 用法：node tools/divine-reforge.mjs [--seeds=3] [--uses=6] [--minutes=900] [--marks-per-min=8881] [--xi-trials=30] [--json=...]
 */
import { writeFileSync } from 'node:fs';
import { openSrc } from './vite-loader.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = /^--([^=]+)=?(.*)$/.exec(a);
    return m ? [m[1], m[2] === '' ? 'true' : m[2]] : [a, 'true'];
  }),
);
const SEEDS = Number(args.seeds ?? 3);
const USES = Number(args.uses ?? 6);
const MINUTES = Number(args.minutes ?? 900);
const MARKS_PER_MIN = Number(args['marks-per-min'] ?? 8881);
const XI_TRIALS = Number(args['xi-trials'] ?? 30);
const DT = 1 / 30;
const BASE_SEED = Number(args['base-seed'] ?? 20261021);
const SEED_STEP = Number(args['seed-step'] ?? 1013);
const JSON_OUT = args.json ?? '';

const src = await openSrc();
const { createSession, startWave, tickSession } = await src.load('src/core/session.ts');
const { spendMarks } = await src.load('src/core/marks-runtime.ts');
const { MARKS_COST } = await src.load('src/data/marks.ts');
const { characterPower, itemPower } = await src.load('src/core/inventory.ts');
const { equippedItems } = await src.load('src/core/character.ts');
const { rerollAffixes, improveAffixes } = await src.load('src/core/item.ts');
const { Rng } = await src.load('src/core/rng.ts');
const { ITEM_BASES } = await src.load('src/data/bases.ts');
const { AFFIXES } = await src.load('src/data/affixes.ts');

const TABLES = { bases: ITEM_BASES, affixes: AFFIXES };
const COST = MARKS_COST.divineReforge;
const USES_IN_3H = Math.floor((MARKS_PER_MIN * 180) / COST);
const MINUTES_PER_USE = COST / MARKS_PER_MIN;

const med = (xs) => {
  const a = [...xs].sort((x, y) => x - y);
  if (a.length === 0) return 0;
  return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
};
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const pct = (x) => `${(x * 100).toFixed(2)}%`;

const bestItemOf = (ch) => {
  let best = null;
  let bp = -Infinity;
  for (const e of equippedItems(ch)) {
    const p = itemPower(e.item);
    if (p > bp) {
      bp = p;
      best = e.item;
    }
  }
  return best;
};
const slotOf = (ch, uid) => equippedItems(ch).find((e) => e.item.uid === uid)?.slot ?? null;
const affixSum = (item) => (item ? item.affixes.reduce((s, a) => s + a.value, 0) : 0);
/** 深拷贝装备（避免对照组改动污染基准） */
const cloneEquipment = (eq) => {
  const out = {};
  for (const [k, v] of Object.entries(eq)) {
    out[k] = v ? { ...v, base: v.base.map((b) => ({ ...b })), affixes: v.affixes.map((a) => ({ ...a })) } : v;
  }
  return out;
};

const rows = [];
for (let i = 0; i < SEEDS; i++) {
  const seed = BASE_SEED + i * SEED_STEP;
  const s = createSession({ classId: 'yujian', seed, tables: TABLES });
  startWave(s);
  const limit = MINUTES * 60;
  let t = 0;
  while (t < limit && s.character.step < 80) {
    tickSession(s, DT);
    t += DT;
  }
  const ch0 = s.character;
  const power0 = characterPower(ch0);
  const best0 = bestItemOf(ch0);
  const bestPower0 = best0 ? itemPower(best0) : 0;
  const bestAffix0 = affixSum(best0);
  const bestSlot0 = best0 ? slotOf(ch0, best0.uid) : null;

  // ── 实际行为：连续用 N 次，逐次记录 ──
  s.character = { ...ch0, marks: COST * (USES + 1) };
  const curve = [{ k: 0, power: power0, bestItemPower: bestPower0, affixSum: bestAffix0, delta: 0, sameItem: true }];
  for (let k = 1; k <= USES; k++) {
    const r = spendMarks(s, 'divineReforge');
    const ch = s.character;
    const best = bestItemOf(ch);
    curve.push({
      k,
      ok: r.ok,
      reason: r.reason ?? '',
      power: characterPower(ch),
      bestItemPower: best ? itemPower(best) : 0,
      affixSum: affixSum(best),
      delta: (characterPower(ch) - power0) / power0,
      sameItem: (best?.uid ?? '') === (best0?.uid ?? ''),
    });
  }
  const affixGrow = bestAffix0 > 0 ? curve[curve.length - 1].affixSum / bestAffix0 : 0;

  // ── 按设计：cap 1.3 真生效 ⇒ 一辈子只能涨一次 ──
  const designed = improveAffixes(best0, 1.3, 1.3);
  const designedPower =
    designed.ok && bestSlot0
      ? characterPower({ ...ch0, equipment: { ...ch0.equipment, [bestSlot0]: designed.item } })
      : power0;

  // ── 对照组：洗灵石单次值多少（30 次独立单洗，同一基准件） ──
  const xiTrials = [];
  for (let tr = 0; tr < XI_TRIALS; tr++) {
    const probe = {
      ...ch0,
      equipment: cloneEquipment(ch0.equipment),
    };
    const out = rerollAffixes(best0, TABLES.affixes, new Rng(seed + tr * 7919));
    const delta = bestSlot0 ? (characterPower({ ...probe, equipment: { ...probe.equipment, [bestSlot0]: out.item } }) - power0) / power0 : 0;
    xiTrials.push(delta);
  }
  rows.push({
    seed,
    maxed: ch0.step >= 80,
    minutesToMax: t / 60,
    power0,
    bestName: best0?.name ?? '（无）',
    bestSlot: bestSlot0 ?? 'none',
    bestRarity: best0?.rarity ?? 'none',
    bestIlvl: best0?.ilvl ?? 0,
    bestAffixCount: best0?.affixes.length ?? 0,
    bestAffix0,
    curve,
    affixGrow,
    designedDelta: (designedPower - power0) / power0,
    xiSingle: { median: med(xiTrials), mean: mean(xiTrials), min: Math.min(...xiTrials), max: Math.max(...xiTrials) },
  });
}
await src.close();

// ── 报告 ────────────────────────────────────────────────
const line = (s) => console.log(s);
const mAt = (k) => med(rows.map((r) => r.curve.find((x) => x.k === k)?.delta ?? 0));
line(`# 夺造化（divineReforge）专项 · 真实 session 跑到满级 · ${new Date().toISOString()}`);
line(`# 种子 ${SEEDS}（${BASE_SEED} 起，步长 ${SEED_STEP}）· 单价 ${COST.toLocaleString('en-US')} 渊痕 · 渊痕/分 ${MARKS_PER_MIN}`);
line('');
line(
  `**3h 预算能刷 ${USES_IN_3H} 次**（${MARKS_PER_MIN}×180=${(MARKS_PER_MIN * 180).toLocaleString('en-US')} 渊痕 ÷ ${COST.toLocaleString('en-US')} = ${((MARKS_PER_MIN * 180) / COST).toFixed(2)}）；1 次需要 ${MINUTES_PER_USE.toFixed(0)} 分钟。`,
);
line('');
line('## 表 1 · 实际行为：每次夺造化都 +30% 灵纹（cap 没生效）');
line('');
line('| 种子 | 满级(min) | 基准战力 | 目标件(槽/品阶/灵纹数) | 用 1 次 Δ | 用 2 次 Δ | 用 3 次 Δ | 用 6 次 Δ | 6 次后灵纹总值 | 始终同一件 |');
line('|---|---:|---:|---|---:|---:|---:|---:|---:|---|');
for (const r of rows) {
  const g = (k) => {
    const x = r.curve.find((s) => s.k === k);
    return x ? pct(x.delta) : '—';
  };
  line(
    `| ${r.seed} | ${r.minutesToMax.toFixed(1)}${r.maxed ? '' : '(未满级)'} | ${r.power0.toFixed(0)} | ${r.bestSlot}/${r.bestRarity}/${r.bestAffixCount} | ${g(1)} | ${g(2)} | ${g(3)} | ${g(6)} | ${r.affixGrow.toFixed(2)}× | ${r.curve.slice(1).every((x) => x.sameItem) ? '是' : '否'} |`,
  );
}
line('');
line('### 中位数（战力量化提升）');
line('| 用 1 次 | 用 2 次 | 用 3 次 | 用 6 次 |');
line('|---:|---:|---:|---:|');
line(`| ${pct(mAt(1))} | ${pct(mAt(2))} | ${pct(mAt(3))} | ${pct(mAt(6))} |`);
line('');
line('## 表 2 · 按设计（灵纹 cap 1.3 真生效）最多就这点');
line('| 种子 | 基准战力 | 用 1 次后 | Δ |');
line('|---|---:|---:|---:|');
for (const r of rows) line(`| ${r.seed} | ${r.power0.toFixed(0)} | — | ${pct(r.designedDelta)} |`);
line('');
line('## 表 3 · 对照组：洗灵石值多少（30 次独立单洗的分布）');
line('| 种子 | 基准战力 | 单洗 中位 Δ | 均值 Δ | 最差 | 最好 |');
line('|---|---:|---:|---:|---:|---:|');
for (const r of rows) {
  line(
    `| ${r.seed} | ${r.power0.toFixed(0)} | ${pct(r.xiSingle.median)} | ${pct(r.xiSingle.mean)} | ${pct(r.xiSingle.min)} | ${pct(r.xiSingle.max)} |`,
  );
}
line('');
line('## 结论');
const one = mAt(1);
const two = mAt(2);
const three = mAt(3);
const six = mAt(6);
const xiMed = med(rows.map((r) => r.xiSingle.median));
const xiWorst = Math.min(...rows.map((r) => r.xiSingle.min));
line(
  `- **单次夺造化 = 战力 +${pct(one)}**（中位）；但离散极大（${rows.map((r) => pct(r.curve.find((x) => x.k === 1)?.delta ?? 0)).join(' / ')}）。原因是「战力最高的那件」按 itemPower 选，而 itemPower 含刷宝类属性权重，可能选到刷宝装而非战斗装。`,
);
line(`- **3h 只够 ${USES_IN_3H} 次** ⇒ 满级后 3h 的实际战力收益 = **${pct(mAt(Math.max(1, USES_IN_3H)))}**；想用第 2 次得再等 ${((2 * COST) / MARKS_PER_MIN).toFixed(0)} 分钟（≈${((2 * COST) / MARKS_PER_MIN / 60).toFixed(1)}h）。`);
line(`- **收益不归零、也不递减**：1/2/3/6 次 = ${pct(one)} / ${pct(two)} / ${pct(three)} / ${pct(six)}；6 次后目标件灵纹总值 ${med(rows.map((r) => r.affixGrow)).toFixed(2)}×（理论 1.3^6=${Math.pow(1.3, 6).toFixed(2)}×）`);
line(`  ⇒ item.ts:improveAffixes 的 cap 被 void cap 吞掉了，×1.3 每次真实叠加，与 data/marks.ts 铁律 1「cap 1.3、不可叠加」直接冲突。`);
line(`- 洗灵石对照：单洗中位 ${pct(xiMed)}，最差 ${pct(xiWorst)}；且「洗」是**全部灵纹重洗 = 重置不是叠加**，同一件洗 10 次只等于「最后一次随机」⇒ 100 万渊痕换 10 洗 ≈ 一次随机重置，价值远低于 1 次夺造化（${pct(one)}，且是定向的）。`);

const out = {
  generatedAt: new Date().toISOString(),
  params: { seeds: SEEDS, uses: USES, minutes: MINUTES, marksPerMin: MARKS_PER_MIN, baseSeed: BASE_SEED, seedStep: SEED_STEP, cost: COST, xiTrials: XI_TRIALS },
  usesIn3h: USES_IN_3H,
  minutesPerUse: MINUTES_PER_USE,
  seeds: rows,
  medians: { use1: one, use2: two, use3: three, use6: six, xiSingle: xiMed },
};
if (JSON_OUT) {
  writeFileSync(JSON_OUT, JSON.stringify(out, null, 2), 'utf8');
  line(`\nJSON 已写入 ${JSON_OUT}`);
}
