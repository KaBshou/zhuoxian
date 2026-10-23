// 一次性补丁：破绽通道改量纲（shuzhi 方案，我负责 support-gems.ts 两条）。
// 贯头 critChance increased 0.3 → flat 0.06（+30% increased 在 5% 基数上 = +1.5 个百分点，白条）。
// 断筋 critMulti increased 0.25 保留（加算通道，与灵纹断念 inc 0.20 叠成 +45%）。
// affixes.ts 的破军/断念归 shuzhi 改。
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/src/data/support-gems.ts';
let c = fs.readFileSync(p, 'utf8');

const old1 = "mods: [{ stat: 'critChance', op: 'increased', value: 0.3 }],";
const neu1 = "mods: [{ stat: 'critChance', op: 'flat', value: 0.06 }],";
if (!c.includes(old1)) { console.error('MISS 1'); process.exit(1); }
c = c.split(old1).join(neu1);

fs.writeFileSync(p, c, 'utf8');
console.log('OK');
