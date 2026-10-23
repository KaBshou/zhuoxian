// 深挖层 13/18/27 高死亡：看死在什么怪手里、单只怪的实际伤害。
import { createServer } from 'vite';

const server = await createServer({
  root: 'F:/dsh-work/zhuoxian', configFile: false, appType: 'custom', logLevel: 'error',
  server: { middlewareMode: true, watch: null, hmr: false, open: false },
});

const sess = await server.ssrLoadModule('/src/core/session.ts');
const battleM = await server.ssrLoadModule('/src/core/battle.ts');
const chars = await server.ssrLoadModule('/src/core/character.ts');
const prog = await server.ssrLoadModule('/src/core/progression.ts');
const monsM = await server.ssrLoadModule('/src/data/monsters.ts');
const dmgM = await server.ssrLoadModule('/src/core/damage.ts');
const basesM = await server.ssrLoadModule('/src/data/bases.ts');
const affixM = await server.ssrLoadModule('/src/data/affixes.ts');
const { createSession, startWave, tickSession } = sess;
const tables = { bases: basesM.ITEM_BASES, affixes: affixM.AFFIXES };
const DT = 1 / 60;

function charAtFloor(floor) {
  const realm = Math.ceil(floor / 3);
  const target = Math.min(80, (realm - 1) * 9 + 4);
  let ch = chars.createCharacter('yujian');
  while (ch.step < target) ch = chars.gainXp(ch, prog.xpForStep(ch.step));
  return ch;
}

// 理论入伤：单只怪一次 hit 对该面板玩家多少
for (const floor of [13, 18, 27]) {
  const tier = monsM.tierOfFloor(floor);
  const ch = charAtFloor(floor);
  const s0 = chars.characterStats(ch);
  const realm = Math.ceil(floor / 3);
  console.log(`\n=== floor ${floor} (tier ${tier}) 台阶 ${ch.step} 玩家 life=${s0.life.toFixed(0)} armor=${s0.armor.toFixed(0)} ===`);
  for (const m of monsM.monstersOfTier(tier)) {
    const inst = battleM.spawnMonster(m, floor, 1, 0, 0);
    const defense = { armor: s0.armor, resist: {}, level: ch.step + 1 };
    const res = dmgM.computeDamage({
      base: inst.damage,
      tags: [m.element],
      modifiers: [],
      isCrit: false,
      target: defense,
      roll: 1,
    });
    const interval = m.attackInterval;
    console.log(`  ${m.id}: dmg=${inst.damage.toFixed(1)} hit对玩家=${res.amount.toFixed(1)} 间隔=${interval}s 单只DPS=${(res.amount / interval).toFixed(1)} hp=${inst.maxHp}`);
  }
}
await server.close();
