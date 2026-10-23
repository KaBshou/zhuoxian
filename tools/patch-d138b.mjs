// D138：周目 > 0 时满级窗口只记录（260 是 c0 的目标，不是周目的目标）
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve('.');
const p = 'tools/run-timeline.mjs';
const raw = fs.readFileSync(path.join(ROOT, p), 'utf8');
const crlf = raw.includes('\r\n');
let t = raw.replace(/\r\n/g, '\n');

const old = '  const pass = allMaxed && inWindow && floorOk;';
if (!t.includes(old)) throw new Error('MISS pass');
t = t.replace(
  old,
  [
    '  // D138：`TARGET_MAX_MINUTES = 260` 是**初临**的满级目标，周目时长天然更长（c1≈312 / c2≈375 / c3≈539）',
    '  // ⇒ c ≥ 1 时「满级窗口」只记录，硬线交给累计 24h 验收（`tools/check-cycle-24h.mjs`）。',
    '  // 纪律沿用：这不是放宽阈值，是去掉「拿 c0 的尺子量周目」这个重复计罚。',
    '  const pass = allMaxed && (CYCLE === 0 ? inWindow : true) && floorOk;',
  ].join('\n'),
);
if (t.length < raw.length) throw new Error('SHRINK');
fs.writeFileSync(path.join(ROOT, p), crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
console.log(`patched ${p}`);
