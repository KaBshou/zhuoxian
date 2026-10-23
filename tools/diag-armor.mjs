// 验证 armorReduction 的 level 语义修复实际生效：
// 怪打玩家 hit 值，修前 vs 修后（层 13/18/27）。
import { createServer } from 'vite';

const server = await createServer({
  root: 'F:/dsh-work/zhuoxian', configFile: false, appType: 'custom', logLevel: 'error',
  server: { middlewareMode: true, watch: null, hmr: false, open: false },
});

const battleM = await server.ssrLoadModule('/src/core/battle.ts');
const chars = await server.ssrLoadModule('/src/core/character.ts');
const prog = await server.ssrLoadModule('/src/core/progression.ts');
const monsM = await server.ssrLoadModule('/src/data/monsters.ts');
const dmgM = await server.ssrLoadModule('/src/core/damage.ts');

function charAtFloor(floor) {
  const realm = Math.ceil(floor / 3);
  const target = Math.min(80, (realm - 1) * 9 + 4);
  let ch = chars.createCharacter('yujian');
  while (ch.step < target) ch = chars.gainXp(ch, prog.xpForStep(ch.step));
  return ch;
}

for (const floor of [13, 18, 27]) {
  const tier = monsM.tierOfFloor(floor);
  const ch = charAtFloor(floor);
  const s0 = chars.characterStats(ch);
  console.log(`=== floor ${floor} 台阶 ${ch.step} life=${s0.life.toFixed(0)} armor=${s0.armor.toFixed(0)} ===`);
  for (const m of monsM.monstersOfTier(tier).slice(0, 2)) {
    const inst = battleM.spawnMonster(m, floor, 1, 0, 0);
    // 修后语义：怪(攻方 level=floor) 打玩家(defense level 不再参与 k，k 随攻方 level)
    const resNew = dmgM.computeDamage({
      base: inst.damage,
      tags: [m.element],
      modifiers: [],
      isCrit: false,
      target: { armor: s0.armor, resist: {}, level: 1 },
      roll: 1,
    });
    // 等效于 armorReduction(armor, 攻方level=floor)
    const red = dmgM.armorReduction(s0.armor, floor);
    const redOld = dmgM.armorReduction(s0.armor, ch.step + 1);
    console.log(`  ${m.id}: 怪dmg=${inst.damage.toFixed(1)} 减伤率(修后,lv=${floor})=${(red * 100).toFixed(1)}% vs (修前,lv=${ch.step + 1})=${(redOld * 100).toFixed(1)}% hit=${resNew.amount.toFixed(1)}`);
  }
}
await server.close();
