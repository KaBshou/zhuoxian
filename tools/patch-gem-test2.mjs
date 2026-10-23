// 一次性补丁：修正测试里的玉简 id（jinqie → cuijin）。
import fs from 'node:fs';
const p = 'F:/dsh-work/zhuoxian/tests/skills-battle.test.ts';
let c = fs.readFileSync(p, 'utf8');
const old = "['menggong', 'jinqie', 'guantou', 'duanjin']";
if (!c.includes(old)) { console.error('MISS'); process.exit(1); }
c = c.split(old).join("['menggong', 'cuijin', 'guantou', 'duanjin']");
fs.writeFileSync(p, c, 'utf8');
console.log('OK');
