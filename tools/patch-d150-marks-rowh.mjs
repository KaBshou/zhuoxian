import fs from 'node:fs';
const P = 'src/render/marks-panel.ts';
const raw = fs.readFileSync(P, 'utf8');
const crlf = raw.includes('\r\n');
let t = raw.replace(/\r\n/g, '\n');
const a = 'const ROW_H = 26;';
const b = [
  '// D150：26 → 34。D137 给每档加了一行 11px 的 `SINK_HINT`（「一次性永久：解锁锁层挂机」这类），',
  '// 26px 行高里标题基线在 `ly`、提示基线在 `ly + 11` ⇒ 两者字形下沿/上沿正好相切（实测重叠 0px 但视觉粘连）。',
  '// ceshi 的观察对：面板**没有**因此长高，是「行内两行字」；但字挤在一起等于把提示写成了噪点。',
  '// 改成 34px（标题基线 ly、提示基线 ly + 14），面板总高 +24px 仍远低于 540。',
  'const ROW_H = 34;',
].join('\n');
if (!t.includes(a)) throw new Error('MISS ROW_H');
t = t.replace(a, b);
const a2 = '    ctx.fillText(SINK_HINT[sink], x + PAD + 26, ly + 11);';
const b2 = '    ctx.fillText(SINK_HINT[sink], x + PAD + 26, ly + 14);';
if (!t.includes(a2)) throw new Error('MISS hint y');
t = t.replace(a2, b2);
if (t.length < raw.replace(/\r\n/g, '\n').length) throw new Error('SHRINK');
fs.writeFileSync(P, crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
console.log('marks-panel ROW_H 26 -> 34, hint baseline +14');
