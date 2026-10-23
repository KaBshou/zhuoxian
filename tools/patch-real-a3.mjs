// 一次性补丁 A3：session.ts 补 hasBossFloor 的 import
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/src/core/session.ts';
const orig = fs.readFileSync(p, 'utf8');
let c = orig;
const i = c.indexOf("from '../data/monsters';");
if (i < 0) throw new Error('找不到 monsters import');
const start = c.lastIndexOf('import', i);
const block = c.slice(start, i + "from '../data/monsters';".length);
console.log('原 import 块：\n' + block);
if (!block.includes('hasBossFloor')) {
  const patched = block.replace('{', '{\n  hasBossFloor,');
  c = c.slice(0, start) + patched + c.slice(i + "from '../data/monsters';".length);
}
if (c.length < orig.length * 0.98) throw new Error('拒绝写盘');
fs.writeFileSync(p, c, 'utf8');
console.log('done', c.length, 'B');
