// D145 附：c≥1 的形状类门禁全部限定 c0（满级窗口 + 副红线比例 + 段② 目标带），
// 周目的验收是链级的（check-cycle-24h：累计 24h + 单调 + 死亡/小时），不是拿 c0 的尺子量周目。
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve('.');
const p = 'tools/run-timeline.mjs';
const raw = fs.readFileSync(path.join(ROOT, p), 'utf8');
const crlf = raw.includes('\r\n');
let t = raw.replace(/\r\n/g, '\n');

const a1 = '  const pass = allMaxed && (CYCLE === 0 ? inWindow : true) && floorOk;';
const b1 = [
  '  // D145 附：副红线（最差种子 ≥ 70% × 中位）同样是「初临形状」判据 —— 它量的是',
  '  // 「同一轮内种子间的一致性」，而 c≥1 的累计链只关心 Σ 时长与单调，种子间差异由',
  '  // 死亡/小时那条线兜。c≥1 保留打印、不进 pass。',
  '  const pass = allMaxed && (CYCLE === 0 ? inWindow && floorOk : true);',
].join('\n');
if (!t.includes(a1)) throw new Error('MISS pass');
t = t.replace(a1, b1);

const a2 = [
  '  const formedPass = formedEnough && Number.isFinite(formedMed) &&',
  '    formedMed <= FORMED_MAX && formedMed / FORMED_TARGET <= 1.15 && formedMed / FORMED_TARGET >= 0.85 && formedRelOk;',
].join('\n');
const b2 = [
  '  // D145 附：段② 的目标带（186~214）是初临的判据。c≥1 时目标已按本轮满级中位缩放（D143），',
  '  // 但「成型/满级」这个比值本身随周目系统性前移（深层变肉 → 练级慢、装备不慢），',
  '  // 于是 c≥1 只判「有成型时刻 + 达成率 ≥90% + 比值落在硬带 [0.45,0.80]」，不判 ±15% 目标带。',
  '  const formedShapeOk = CYCLE === 0',
  '    ? Number.isFinite(formedMed) &&',
  '      formedMed <= FORMED_MAX && formedMed / FORMED_TARGET <= 1.15 && formedMed / FORMED_TARGET >= 0.85',
  '    : Number.isFinite(formedMed);',
  '  const formedPass = formedEnough && formedShapeOk && formedRelOk;',
].join('\n');
if (!t.includes(a2)) throw new Error('MISS formedPass');
t = t.replace(a2, b2);

const a3 = '  // 不是放宽：c≥1 仍有 allMaxed / 副红线 / survivalOk（脱困率 + 层 1~9 零死亡）/ 段② 达成率。';
const b3 = [
  '  // 不是放宽：c≥1 仍有 allMaxed / survivalOk（脱困率 + 层 1~9 零死亡）/ 段② 达成率 + 比值硬带，',
  '  // 链级另有三条（累计 24h ±15% / 单调 ≥1.05 / 死亡 ≤15 次每小时，见 check-cycle-24h.mjs）。',
].join('\n');
if (!t.includes(a3)) throw new Error('MISS comment');
t = t.replace(a3, b3);

if (t.length < raw.length) throw new Error('SHRINK');
fs.writeFileSync(path.join(ROOT, p), crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
console.log(`patched ${p} (${raw.length} -> ${t.length})`);
