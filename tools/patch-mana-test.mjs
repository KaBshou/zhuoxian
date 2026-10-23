// 一次性补丁：skills-battle.test.ts 真元基线 2→4（shuzhi 已改 stats.ts base，测试是旧口径）。
import fs from 'node:fs';
const p = 'F:/dsh-work/zhuoxian/tests/skills-battle.test.ts';
let c = fs.readFileSync(p, 'utf8');
const old = "it('常量：真元回复 2/s（BALANCE §11.5）', () => {\n    expect(MANA_REGEN_PER_SEC).toBe(2);\n  });";
const neu = "it('常量：真元回复 4/s（BALANCE §11.5 B1，基线收口在 STAT_META.manaRegen.base）', () => {\n    expect(MANA_REGEN_PER_SEC).toBe(4);\n  });";
if (!c.includes(old)) { console.error('MISS'); process.exit(1); }
c = c.split(old).join(neu);
fs.writeFileSync(p, c, 'utf8');
console.log('OK');
