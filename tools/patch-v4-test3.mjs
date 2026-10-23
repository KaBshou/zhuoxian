// v4 测试迁移第三步：伤害地板 + 标题。前两处（maxHp/dmg）已迁移。
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/tests/battle.test.ts';
let c = fs.readFileSync(p, 'utf8');
let miss = 0;
function repl(oldS, neu, tag) {
  if (!c.includes(oldS)) { console.error('MISS: ' + tag); miss++; return; }
  c = c.replace(oldS, neu);
  console.log('OK: ' + tag);
}

repl(
  "it('spawnMonster 按层放大血和攻击（层 1 = 基准 90/3）', () => {",
  "it('spawnMonster 按层放大血和攻击（层 1 = 基准，v4 归一）', () => {",
  'title',
);
repl(
  'expect(a.damage).toBeCloseTo(BASE_MONSTER_DAMAGE * def.dmgMul, 6);',
  "// v4: BASE_MONSTER_DAMAGE=1.0 × dmgMul 0.8 = 0.8，但 spawnMonster 有 Math.max(1,…) 地板，实际是 1\n    expect(a.damage).toBeCloseTo(Math.max(1, BASE_MONSTER_DAMAGE * def.dmgMul), 6);",
  'dmg assert floor',
);
repl(
  'expect(a.xp).toBe(2); // 每杀修为 = 2 × 层',
  'expect(a.xp).toBe(2 * 1); // 每杀修为 = XP_PER_KILL_PER_FLOOR × 层',
  'xp assert',
);

if (miss > 0) process.exit(1);
fs.writeFileSync(p, c, 'utf8');
console.log('written');
