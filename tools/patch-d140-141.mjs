// D140：24h 链验收补两条结构线（shuzhi D140/D141 采纳）
//  ① 单调线：cycleTime(N+1)/cycleTime(N) >= 1.05（血 ×1.35^N 的必然推论；防「某轮变快」的 bug）
//  ② 比例式死亡线：死亡/小时 <= 15（死数是计数，会随时长线性涨，不能用绝对阈值判两轮）
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve('.');
const p = 'tools/check-cycle-24h.mjs';
const raw = fs.readFileSync(path.join(ROOT, p), 'utf8');
const crlf = raw.includes('\r\n');
let t = raw.replace(/\r\n/g, '\n');

t = t.replace(
  "const CHAIN_TOLERANCE = 0.15;",
  [
    'const CHAIN_TOLERANCE = 0.15;',
    '/** 相邻周目必须变慢：血 ×1.35^N 的必然推论（D140）。某轮比上一轮快 = 倍率/装备接错了。 */',
    'const CYCLE_GROWTH_MIN = 1.05;',
    '/** 死亡是计数、随时长线性涨 ⇒ 只能按比例判（D141）。c3 实测 10.86/小时。 */',
    'const DEATHS_PER_HOUR_MAX = 15;',
  ].join('\n'),
);

const oldCheck = [
  'const sum = rows.reduce((a, r) => a + r.med, 0);',
  'const ok = sum >= LO && sum <= HI;',
].join('\n');
const newCheck = [
  'const sum = rows.reduce((a, r) => a + r.med, 0);',
  'const ok = sum >= LO && sum <= HI;',
  '',
  '// ① 单调线：相邻周目比值',
  'const growth = [];',
  'for (let i = 1; i < rows.length; i += 1) {',
  '  const ratio = rows[i - 1].med > 0 ? rows[i].med / rows[i - 1].med : NaN;',
  '  growth.push({ from: rows[i - 1].cycle, to: rows[i].cycle, ratio, ok: Number.isFinite(ratio) && ratio >= CYCLE_GROWTH_MIN });',
  '}',
  'const growthOk = growth.every((g) => g.ok);',
  '',
  '// ② 比例式死亡线：死亡/小时',
  'const deathRates = rows.map((r) => ({',
  '  cycle: r.cycle,',
  '  perHour: Number.isFinite(r.deaths) && r.med > 0 ? r.deaths / (r.med / 60) : NaN,',
  '}));',
  'for (const d of deathRates) d.ok = Number.isFinite(d.perHour) && d.perHour <= DEATHS_PER_HOUR_MAX;',
  'const deathRateOk = deathRates.every((d) => d.ok);',
].join('\n');
if (!t.includes(oldCheck)) throw new Error('MISS check');
t = t.replace(oldCheck, newCheck);

const oldPrint = [
  'console.log(',
  '  `- 说明：单轮满级窗口只对 c0 生效（c≥1 只记录），因为 260min 是初临的目标；周目的需求是「24h 之后还有内容」，判的是累计。`,',
  ');',
  'if (!ok) process.exitCode = 1;',
].join('\n');
const newPrint = [
  'console.log(',
  '  `- 说明：单轮满级窗口只对 c0 生效（c≥1 只记录），因为 260min 是初临的目标；周目的需求是「24h 之后还有内容」，判的是累计。`,',
  ');',
  '',
  'console.log("");',
  'console.log(`- 单调线（硬线，D140）：相邻周目比值 ≥ ${CYCLE_GROWTH_MIN}`);',
  'for (const g of growth) {',
  '  console.log(`  - c${g.from} → c${g.to}：${Number.isFinite(g.ratio) ? g.ratio.toFixed(3) : "—"} ${g.ok ? "✓" : "❌ 某轮变快了（倍率或装备接错）"}`);',
  '}',
  '',
  'console.log(`- 死亡比例（硬线，D141）：≤ ${DEATHS_PER_HOUR_MAX} 次/小时`);',
  'for (const d of deathRates) {',
  '  console.log(`  - c${d.cycle}：${Number.isFinite(d.perHour) ? d.perHour.toFixed(2) : "—"} 次/小时 ${d.ok ? "✓" : "❌"}`);',
  '}',
  '',
  'if (!growthOk || !deathRateOk) {',
  '  console.log("");',
  '  console.log(`❌ 结构线未通过（单调 ${growthOk ? "✓" : "❌"} / 死亡比例 ${deathRateOk ? "✓" : "❌"}）`);',
  '}',
  '',
  'if (!ok || !growthOk || !deathRateOk) process.exitCode = 1;',
].join('\n');
if (!t.includes(oldPrint)) throw new Error('MISS print');
t = t.replace(oldPrint, newPrint);

if (t.length < raw.length) throw new Error('SHRINK');
fs.writeFileSync(path.join(ROOT, p), crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
console.log(`patched ${p}`);
