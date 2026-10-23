// 一次性：把 shuzhi v4.33（6 种子）的三条结论落进 run-timeline ——
//   ① 段② 副红线改**相对线**（成型/满级 ≤ 0.85），绝对时间只记录；
//   ② FORMED_RATIO 0.56 → 0.62（目标 185 → 205）—— 3 种子偏乐观 10%；
//   ③ 九境目标改**比例形状** REALM_SHAPE_RATIO × 满级目标，容差 ±20%（第 1 境 spread 32%）。
// 另外：满级窗口上沿在 6 种子协议下要放宽到 445（最差种子 432.8 已出 [300,385]）。
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/tools/run-timeline.mjs';
const raw = fs.readFileSync(p, 'utf8');
const crlf = raw.includes('\r\n');
let c = raw.replace(/\r\n/g, '\n');
const old = raw.length;

const repl = (a, b, tag) => {
  if (!c.includes(a)) throw new Error(`MISS ${tag}`);
  c = c.replace(a, b);
  console.log(`ok ${tag}`);
};

// ── ① 九境比例形状 ───────────────────────────────────────────────
repl(
  [
    'const REALM_TOLERANCE = 0.15;',
  ].join('\n'),
  [
    '// 容差 ±20%：第 1 境 6 种子实测 24.6~32.4（spread 32%），±15% 比噪声还窄（shuzhi v4.33）。',
    'const REALM_TOLERANCE = 0.2;',
  ].join('\n'),
  'realm-tolerance',
);

repl(
  [
    'const REALM_SHAPE = [32, 47, 70, 104, 139, 179, 224, 304, 406];',
    'const TARGET_REALM_MINUTES = REALM_SHAPE.map((x) => Math.round((x / REALM_SHAPE[REALM_SHAPE.length - 1]) * TARGET_MAX_MINUTES));',
  ].join('\n'),
  [
    '// 形状用**比例**而不是 406 时代的绝对分钟数（shuzhi 6 种子复跑：旧形状整体低 7~14%，',
    '// 会永久显示 +8~14% 的假告警 —— 那不是「数值退步」，是目标曲线过时）。',
    '// 纪律：不要为对齐形状去重排 BREAKTHROUGH_XP（R(k) 是「满级 330 + 段② 0.62」的唯一解，',
    '// v4.22 实测重分配会引入 ±19~26% 混沌）；早期偏慢是收入曲线形状的必然，只记录。',
    'const REALM_SHAPE_RATIO = [0.085, 0.125, 0.179, 0.283, 0.37, 0.465, 0.571, 0.743, 1.0];',
    'const TARGET_REALM_MINUTES = REALM_SHAPE_RATIO.map((r) => Math.round(r * TARGET_MAX_MINUTES));',
  ].join('\n'),
  'realm-shape-ratio',
);

// ── ② 段② 常数 + 相对副红线 ─────────────────────────────────────
repl(
  [
    'const FORMED_RATIO = 0.56;',
    'const FORMED_TARGET = Math.round(TARGET_MAX_MINUTES * FORMED_RATIO);',
    'const FORMED_MAX = 240;',
  ].join('\n'),
  [
    '// 0.56 是 3 种子标出来的（0.579），6 种子中位是 0.618 —— 偏了 10%，改成 0.62。',
    '// 结果：3 种子 −5.4%、6 种子 +2.6%，两边都居中（shuzhi v4.33 / D70）。',
    'const FORMED_RATIO = 0.62;',
    'const FORMED_TARGET = Math.round(TARGET_MAX_MINUTES * FORMED_RATIO);',
    '// 绝对上限只作「明显失控」的粗筛，不当中位窗口用；真正的红线是下面的相对线。',
    'const FORMED_MAX = 260;',
    '// **相对副红线**：段② 必须给段③ 留出 ≥15% 的时间。',
    '// 为什么不设绝对线：6 种子成型 148.3~254.6（CV 20%），设 240 → 2/6 假红；设 260 → 把真烂尾放行。',
    '// 相对线随种子同向漂移，噪声自消（实测最差 0.788，余量 6.2pp）。',
    'const FORMED_MAX_REL = 0.85;',
  ].join('\n'),
  'formed-consts',
);

// ── ③ 门禁里加相对线 ────────────────────────────────────────────
repl(
  "  const formedPass = formedRuns.length === runs.length && Number.isFinite(formedMed) &&\n    formedMed <= FORMED_MAX && formedMed / FORMED_TARGET <= 1.15 && formedMed / FORMED_TARGET >= 0.85;",
  [
    '  // 相对副红线：逐个种子算「成型/满级」，任一种子 > 0.85 就红（种子里程碑比值比绝对值稳）',
    '  const formedRel = runs.map((r) => {',
    '    const pre = preMax(r);',
    '    return { seed: r.seed, formed: pre.formedAt, maxed: pre.maxedAt, ratio: pre.maxedAt > 0 ? pre.formedAt / pre.maxedAt : NaN };',
    '  });',
    '  const formedRelWorst = formedRel.reduce((a, b) => (!Number.isFinite(a.ratio) ? b : !Number.isFinite(b.ratio) ? a : b.ratio > a.ratio ? b : a), { ratio: 0, seed: 0 });',
    '  const formedRelOk = formedRel.every((x) => !Number.isFinite(x.maxed) || x.ratio <= FORMED_MAX_REL);',
    '  const formedPass = formedRuns.length === runs.length && Number.isFinite(formedMed) &&',
    '    formedMed <= FORMED_MAX && formedMed / FORMED_TARGET <= 1.15 && formedMed / FORMED_TARGET >= 0.85 && formedRelOk;',
  ].join('\n'),
  'formed-gate',
);

// ── ④ 打印相对线 ────────────────────────────────────────────────
repl(
  '  const gradMedAll = med(runs.filter((r) => Number.isFinite(preMax(r).graduatedAt)).map((r) => preMax(r).graduatedAt));',
  [
    '  console.log(',
    '    `- 段② 相对副红线（成型/满级 ≤ ${FORMED_MAX_REL}）：最差 ${Number.isFinite(formedRelWorst.ratio) ? pct(formedRelWorst.ratio) : "—"}` +',
    '      `（种子 ${formedRelWorst.seed}）→ **${formedRelOk ? "通过" : "不通过"}**（绝对上限 ${FORMED_MAX}min 只记录）`,',
    '  );',
    '  const gradMedAll = med(runs.filter((r) => Number.isFinite(preMax(r).graduatedAt)).map((r) => preMax(r).graduatedAt));',
  ].join('\n'),
  'formed-print',
);

if (c.length < old + 400) throw new Error(`ASSERT patch too small ${old} -> ${c.length}`);
fs.mkdirSync('F:/dsh-work/zhuoxian/tools/_bak', { recursive: true });
fs.writeFileSync(`F:/dsh-work/zhuoxian/tools/_bak/run-timeline.before-433.${Date.now()}.mjs`, raw, 'utf8');
fs.writeFileSync(p, crlf ? c.replace(/\n/g, '\r\n') : c, 'utf8');
console.log(`done crlf=${crlf} ${old} -> ${c.length}`);
