// D137（续 4）：M 面板每档说明行（定渊语义变了，玩家看不出「解锁锁层」）
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve('.');
const p = 'src/render/marks-panel.ts';
const raw = fs.readFileSync(path.join(ROOT, p), 'utf8');
const crlf = raw.includes('\r\n');
let t = raw.replace(/\r\n/g, '\n');

const oldHint = 'const SINKS: readonly MarkSink[] = [';
if (!t.includes(oldHint)) throw new Error('MISS sinks');
t = t.replace(
  oldHint,
  [
    '/** 每档的一句话说明（D137 起「定渊」语义变了：不再是跳层，而是解锁锁层挂机） */',
    'const SINK_HINT: Readonly<Record<MarkSink, string>> = {',
    "  rerollCurrency: '买洗灵石 ×1（打造材料）',",
    "  setStartFloor: '一次性永久：解锁锁层挂机（按 L 在本层反复刷）',",
    "  divineReforge: '把最强的一件的灵纹拔到淬炼上限',",
    '};',
    '',
    'const SINKS: readonly MarkSink[] = [',
  ].join('\n'),
);

const oldRow = [
  "    ctx.fillStyle = can ? C.ok : C.no;",
  '    ctx.fillText(sinkStatusText(marks, sink), x + W - PAD, ly);',
  "    ctx.textAlign = 'left';",
  '    ly += ROW_H;',
].join('\n');
const newRow = [
  "    ctx.fillStyle = can ? C.ok : C.no;",
  '    ctx.fillText(sinkStatusText(marks, sink), x + W - PAD, ly);',
  "    ctx.textAlign = 'left';",
  '    ctx.font = \'11px "Noto Sans SC", sans-serif\';',
  '    ctx.fillStyle = C.dim;',
  '    ctx.fillText(SINK_HINT[sink], x + PAD + 26, ly + 11);',
  '    ly += ROW_H;',
].join('\n');
if (!t.includes(oldRow)) throw new Error('MISS row');
t = t.replace(oldRow, newRow);

if (t.length < raw.replace(/\r\n/g, '\n').length) throw new Error('SHRINK');
fs.writeFileSync(path.join(ROOT, p), crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
console.log(`patched ${p}`);
