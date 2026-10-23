// 底栏加键位提示（不用反引号锚点，避开 patch 脚本模板嵌套问题）
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/src/render/battle-renderer.ts';
const orig = fs.readFileSync(p, 'utf8');
let c = orig;
fs.writeFileSync('F:/dsh-work/zhuoxian/tools/_bak/battle-renderer.ts.' + Date.now() + '.bak', orig, 'utf8');

const oldText = '　←→ 回刷';
const newText = '　←→ 回刷　1/2/3 渊痕　E 法宝　D 详解';
const n = c.split(oldText).length - 1;
if (n !== 1) throw new Error('MISS(' + n + ')');
c = c.replace(oldText, newText);
fs.writeFileSync(p, c, 'utf8');
console.log('ok: footer-hint', c.length, 'B');
