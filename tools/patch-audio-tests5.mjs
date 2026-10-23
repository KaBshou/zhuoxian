import fs from 'node:fs';
const P = 'F:/dsh-work/zhuoxian/tests/hud-buttons.test.ts';
let c = fs.readFileSync(P, 'utf8');
const old = "expect(bs.map((b) => b.key)).toEqual(['E', 'D', 'T', 'G', 'K', 'J', 'M', 'S']);";
if (!c.includes(old)) throw new Error('MISS keys');
c = c.replace(old, "expect(bs.map((b) => b.key)).toEqual(['E', 'D', 'T', 'G', 'K', 'J', 'M', 'S', 'V']);");
fs.writeFileSync(P, c, 'utf8');
console.log('OK');
