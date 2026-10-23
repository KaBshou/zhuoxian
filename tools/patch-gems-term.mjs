// 一次性补丁：support-gems.ts 的 TERM.xxx 引用改成 TAG_NAME.xxx（TERM 没有标签名）。
import fs from 'node:fs';

const p = 'src/data/support-gems.ts';
let c = fs.readFileSync(p, 'utf8');

c = c.split("import { TERM } from './glossary';").join("import { TAG_NAME } from './tags';");
for (const k of ['attack', 'spell', 'metal', 'fire', 'water', 'area']) {
  c = c.split('${TERM.' + k + '}').join('${TAG_NAME.' + k + '}');
}

fs.writeFileSync(p, c, 'utf8');
console.log('leftover TERM refs:', (c.match(/TERM\./g) || []).length);
