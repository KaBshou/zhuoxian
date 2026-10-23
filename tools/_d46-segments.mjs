/** D46/D47 四段下界实测汇总：一阶 ≥30min、二阶 ≥35min、层19→28 ≥40min、层28→满级 ≥180min（三阶占比只记录） */
import { readFileSync } from 'node:fs';

const file = process.argv[2] ?? 'tools/_d46-off-3s.json';
const j = JSON.parse(readFileSync(file, 'utf8'));
const BOUNDS = [
  { key: 'tier1', label: '一阶（层 1~9）停留', min: 30 },
  { key: 'tier2', label: '二阶（层 10~18）停留', min: 35 },
  { key: 'f19_28', label: '层 19 → 28 用时', min: 40 },
  { key: 'f28_max', label: '层 28 → 满级 用时', min: 180 },
];
const med = (xs) => {
  const a = [...xs].sort((x, y) => x - y);
  return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
};
const rows = [];
for (const r of j.runs) {
  const trail = r.floorTrail ?? [];
  const at = (floor) => trail.find((x) => x.floor === floor)?.minute ?? NaN;
  const tierMin = (t) => (r.atMax?.tierMinutes ?? []).find((x) => x.tier === t)?.minutes ?? NaN;
  const f19 = at(19);
  const f28 = at(28);
  const tierSum = (r.atMax?.tierMinutes ?? []).reduce((s, x) => s + x.minutes, 0);
  const t3share = ((tierMin(3) / tierSum) * 100).toFixed(1);
  rows.push({
    seed: r.seed,
    maxedAt: r.maxedAt,
    tier1: tierMin(1),
    tier2: tierMin(2),
    f19_28: f28 - f19,
    f28_max: r.maxedAt - f28,
    t3share,
    f19,
    f28,
  });
}
const line = (s) => console.log(s);
line(`# D46/D47 四段下界实测 · ${file} · ${j.generatedAt ?? ''}`);
line('');
line('| 种子 | 一阶(min) | 二阶(min) | 层19→28(min) | 层28→满级(min) | 三阶占比(仅记录) | 满级(min) |');
line('|---|---:|---:|---:|---:|---:|---:|');
for (const r of rows) {
  line(
    `| ${r.seed} | ${r.tier1.toFixed(1)} | ${r.tier2.toFixed(1)} | ${r.f19_28.toFixed(1)} | ${r.f28_max.toFixed(1)} | ${r.t3share}% | ${r.maxedAt.toFixed(1)} |`,
  );
}
line('');
line('| 段 | 判据 | 中位实测 | 最小~最大 | 判定 |');
line('|---|---:|---:|---:|---|');
for (const b of BOUNDS) {
  const xs = rows.map((r) => r[b.key]);
  const m = med(xs);
  line(
    `| ${b.label} | ≥${b.min}min | **${m.toFixed(1)}min** | ${Math.min(...xs).toFixed(1)}~${Math.max(...xs).toFixed(1)} | ${m >= b.min ? 'PASS' : `FAIL（差 ${(b.min - m).toFixed(1)}min）`} |`,
  );
}
const t3 = med(rows.map((r) => Number(r.t3share)));
line(`| 三阶占比（只记录，不判） | — | ${t3.toFixed(1)}% | ${Math.min(...rows.map((r) => Number(r.t3share))).toFixed(1)}~${Math.max(...rows.map((r) => Number(r.t3share))).toFixed(1)}% | 记录 |`);
line('');
line(`满级中位 ${med(rows.map((r) => r.maxedAt)).toFixed(1)}min（判据 406 中位 ±15%）`);
