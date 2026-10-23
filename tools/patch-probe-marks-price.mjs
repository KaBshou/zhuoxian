// 一次性：probe-marks.mjs 按新定价更新（聚灵 20 万 / 定渊 40 万 / 夺造化 150 万）
import fs from 'node:fs';

const P = 'F:/dsh-work/tools/probe-marks.mjs';
let c = fs.readFileSync(P, 'utf8');
const before = c.length;

function repl(a, b, tag) {
  if (!c.includes(a)) throw new Error('MISS: ' + tag);
  const n = c.split(a).length - 1;
  if (n !== 1) throw new Error(`AMBIGUOUS(${n}): ${tag}`);
  c = c.replace(a, b);
  console.log('OK:', tag);
}

repl('s.character.marks=300000', 's.character.marks=600000', 'seed-marks');

repl(
  `  check('按 1 扣 10 万渊痕', after1.marks === before.marks - 100000,`,
  `  check('按 1 扣 20 万渊痕', after1.marks === before.marks - 200000,`,
  'assert-1',
);

repl(
  `    '按 2 扣了 20 万渊痕（300000-100000-200000=0）',`,
  `    '按 2 扣了 40 万渊痕（600000-200000-400000=0）',`,
  'assert-2',
);

if (c.length < before * 0.95) throw new Error('结果比原文短，拒绝写盘');
fs.writeFileSync(P, c, 'utf8');
console.log('written', before, '->', c.length);
