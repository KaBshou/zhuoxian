// 一次性补丁：battle.test.ts 镇守断言从 ×25 改 ×8（BOSS_HP_MUL）。跑完即弃。
import fs from 'node:fs';

const p = 'tests/battle.test.ts';
let c = fs.readFileSync(p, 'utf8');
let misses = [];

function repl(old, neu, tag) {
  if (!c.includes(old)) {
    misses.push(tag);
    return;
  }
  c = c.split(old).join(neu);
}

repl(
  "  it('镇守 = 同层普通浊物 ×25 血 ×4 攻（BALANCE §11.1）', () => {\n    for (const t of [1, 2, 3] as const) {\n      const boss = bossOfTier(t)!;\n      expect(boss.hpMul, `tier ${t} hp`).toBe(25);\n      expect(boss.dmgMul, `tier ${t} dmg`).toBe(4);\n    }\n  });",
  "  it('镇守 = 同层普通浊物 ×8 血 ×4 攻（BOSS_HP_MUL，BALANCE §11.1 修订版）', () => {\n    // ×25 与「60~90 秒一场」自相矛盾（层 1 玩家 dps 9.8 打 2250 血要 230s），\n    // 已修订为 ×8：层 1 镇守 720 血 ≈ 73s 正好落窗。\n    for (const t of [1, 2, 3] as const) {\n      const boss = bossOfTier(t)!;\n      expect(boss.hpMul, `tier ${t} hp`).toBe(BOSS_HP_MUL);\n      expect(boss.hpMul, `tier ${t} hp val`).toBe(8);\n      expect(boss.dmgMul, `tier ${t} dmg`).toBe(BOSS_DMG_MUL);\n    }\n  });",
  'boss',
);

repl(
  '  FLOOR_DAMAGE_MUL,',
  '  BOSS_DMG_MUL,\n  BOSS_HP_MUL,\n  FLOOR_DAMAGE_MUL,',
  'imp',
);

if (misses.length > 0) {
  console.error('MISS:', misses.join(', '));
  process.exit(1);
}
fs.writeFileSync(p, c, 'utf8');
console.log('OK');
