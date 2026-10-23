// D138：周目 > 0 时「满级窗口」只记录（260 是 c0 的目标，不是周目的目标）；
// 24h 验收改成「累计 c0..cN 中位 ∈ 24h ±15%」的独立脚本。
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve('.');
const p = 'tools/run-timeline.mjs';
const raw = fs.readFileSync(path.join(ROOT, p), 'utf8');
let t = raw.replace(/\r\n/g, '\n');

const old = '  const pass = allMaxed && inWindow && floorOk;';
const neu = [
  '  // D138：`TARGET_MAX_MINUTES = 260` 是**初临**的满级目标，周目时长天然更长（c1≈312 / c2≈375 / c3≈539）',
  '  // ⇒ c ≥ 1 时「满级窗口」只记录，硬线交给累计 24h 验收（`tools/check-cycle-24h.mjs`）。',
  '  // 纪律沿用：这不是放宽阈值，是去掉「拿 c0 的尺子量周目」这个重复计罚。',
  '  const pass = allMaxed && (CYCLE === 0 ? inWindow : true) && floorOk;',
].join('\n');
if (!t.includes(old)) throw new Error('MISS pass');
t = t.replace(old, neu);

const oldPrint = '  console.log(\n    `- 满级（主门禁：窗口 [';
if (!t.includes(oldPrint)) throw new Error('MISS print');
t = t.replace(oldPrint, '  console.log(\n    `- 满级（主门禁：窗口 [');

// 在 verdict 里加 cycle 字段，便于链式脚本读
const oldVerdict = ['        wallGateActive,', '        survivalOk,'].join('\n');
const newVerdict = ['        wallGateActive,', '        cycle: CYCLE,', '        survivalOk,'].join('\n');
if (!t.includes(oldVerdict)) throw new Error('MISS verdict');
t = t.replace(oldVerdict, newVerdict);

fs.writeFileSync(path.join(ROOT, p), t, 'utf8');
console.log(`patched ${p} (${t.length})`);
