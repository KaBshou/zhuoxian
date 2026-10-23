// 修复 D136 补丁插入位置错位（多出一个 console.log( 且 首次撞墙层 少了 console.log(）
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve('.');
const p = 'tools/run-timeline.mjs';
let t = fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

const dup = '  console.log(\n  console.log(\n    `- 周目渐入（';
if (!t.includes(dup)) throw new Error('MISS dup');
t = t.replace(dup, '  console.log(\n    `- 周目渐入（');

const orphan = "  );\n    `- 首次撞墙层（";
if (!t.includes(orphan)) throw new Error('MISS orphan');
t = t.replace(orphan, '  );\n  console.log(\n    `- 首次撞墙层（');

fs.writeFileSync(path.join(ROOT, p), t, 'utf8');
console.log(`repaired ${p} (${t.length})`);
