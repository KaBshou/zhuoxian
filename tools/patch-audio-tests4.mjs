import fs from 'node:fs';
const P = 'F:/dsh-work/zhuoxian/tests/hud-buttons.test.ts';
let c = fs.readFileSync(P, 'utf8');
const old = "it('按钮之间不重叠，且顺序与底部提示行一致（E D T G K J M S）', () => {";
if (!c.includes(old)) throw new Error('MISS title');
c = c.replace(old, "it('按钮之间不重叠，且顺序与底部提示行一致（E D T G K J M S V）', () => {");
fs.writeFileSync(P, c, 'utf8');
console.log('OK');
