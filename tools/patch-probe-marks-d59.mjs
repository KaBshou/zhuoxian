// 一次性：渊痕定价 ×2.5 之后同步探针（D59）
// 坑：这个文件是 CRLF，直接拿 \n 拼的锚点会全 MISS —— 统一先归一化再还原。
import fs from 'node:fs';

const p = 'F:/dsh-work/tools/probe-marks.mjs';
const raw = fs.readFileSync(p, 'utf8');
const crlf = raw.includes('\r\n');
let c = raw.replace(/\r\n/g, '\n');
const before = c.length;

const repl = (oldText, newText, tag) => {
  if (!c.includes(oldText)) throw new Error(`MISS ${tag}`);
  c = c.replace(oldText, newText);
};

repl(
  "check('按 1 扣 20 万渊痕', after1.marks === before.marks - 200000,",
  "check('按 1 扣 25 万渊痕', after1.marks === before.marks - 250000,",
  'd1',
);

repl(
  "    '按 2 扣了 75 万渊痕（1250000-500000-250000-500000=0）',\n    after2.marks === 0,",
  "    '按 2 扣 50 万渊痕（1250000 − 250000 聚灵 − 500000 定渊 = 500000）',\n    after2.marks === 500000,",
  'd2',
);

repl(
  "check('深渊痕不足时按 3 被拒绝', after3.marks === 0 &&",
  "check('渊痕不足时按 3 被拒绝', after3.marks === 500000 &&",
  'd3',
);

fs.writeFileSync(p, crlf ? c.replace(/\n/g, '\r\n') : c, 'utf8');
console.log(`ok crlf=${crlf} ${before} -> ${c.length}`);
