// 一次性补丁：测试里的 'menggong' → 'mengong'（猛攻的真实 id，打错一个 g）。
import fs from 'node:fs';
const p = 'F:/dsh-work/zhuoxian/tests/skills-battle.test.ts';
let c = fs.readFileSync(p, 'utf8');
if (!c.includes("'menggong'")) { console.error('MISS'); process.exit(1); }
c = c.split("'menggong'").join("'mengong'");
fs.writeFileSync(p, c, 'utf8');
console.log('OK');
