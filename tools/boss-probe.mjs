// 临时探针：验证镇守「出手 1 次/5 秒」与「战内每 10 秒自回 10%」是否真的生效。
// 用完即删（ceshi）。
import { openSrc } from './vite-loader.mjs';

const { load, close } = await openSrc();
try {
  const battle = await load('src/core/battle.ts');
  const monsters = await load('src/data/monsters.ts');
  const character = await load('src/core/character.ts');
  const turbid = await load('src/core/turbid.ts');
  const { Rng } = await load('src/core/rng.ts');

  const ch = character.createCharacter('yujian');
  const p = battle.playerBattleFromCharacter(ch);
  const t = turbid.createTurbid();
  const state = battle.createBattle(p, t, ch);

  const floor = 1;
  const boss = monsters.bossOfTier(monsters.tierOfFloor(floor));
  const m = battle.spawnMonster(boss, floor, 1, p.x + 40, p.y, 'boss');
  state.monsters.push(m);

  const rng = new Rng(20261021);
  const dt = 0.05;
  const seconds = 120;
  let regenEvents = 0;
  let regenHp = 0;
  let bossStrikes = 0;
  let lastPlayerHp = p.hp;
  const regenAt = [];
  const strikeAt = [];
  const hpSamples = [];

  for (let i = 0; i < seconds / dt; i++) {
    const beforeHp = m.hp;
    battle.tickBattle(state, dt, rng);
    if (m.hp > beforeHp + 0.5) {
      regenEvents++;
      regenHp += m.hp - beforeHp;
      regenAt.push(Math.round(i * dt));
    }
    if (p.hp < lastPlayerHp - 0.01) {
      bossStrikes++;
      strikeAt.push(Math.round(i * dt * 10) / 10);
      lastPlayerHp = p.hp;
    }
    if (i % 200 === 0) hpSamples.push(`${Math.round(i * dt)}s: bossHp ${m.hp.toFixed(0)}/${m.maxHp} playerHp ${p.hp.toFixed(1)}`);
  }

  console.log(`镇守：${m.name}（${boss.id}） 层 ${floor}`);
  console.log(`血量 ${m.maxHp}  攻 ${m.damage.toFixed(2)}  attackInterval ${m.attackInterval}s  attackRange ${m.attackRange}  玩家射程 ${p.range}`);
  console.log(`${seconds}s 内：玩家打掉 ${(m.maxHp - m.hp).toFixed(1)} 血；boss 自回 ${regenEvents} 次（共 +${regenHp.toFixed(1)} 血）`);
  console.log(`自回触发秒数：${regenAt.length ? regenAt.join(', ') : '（无）'}`);
  console.log(`boss 出手 ${bossStrikes} 次，秒数：${strikeAt.length ? strikeAt.join(', ') : '（无）'}`);
  console.log(hpSamples.join('\n'));
} finally {
  await close();
}
