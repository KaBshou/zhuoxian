// 一次性小补丁：validateMonsters 断言文案从「血量」改为「hpMul」。跑完即弃。
import fs from 'node:fs';

const p = 'tests/battle.test.ts';
let c = fs.readFileSync(p, 'utf8');
const old = "expect(problems.some((p) => p.includes('血量'))).toBe(true);";
if (!c.includes(old)) {
  console.error('MISS');
  process.exit(1);
}
c = c.replace(old, "expect(problems.some((p) => p.includes('hpMul'))).toBe(true); // 血量倍率");
fs.writeFileSync(p, c, 'utf8');
console.log('OK');
