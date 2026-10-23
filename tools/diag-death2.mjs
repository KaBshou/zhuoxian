// 临时诊断：为什么死亡测试里 2000 帧（33s）没打死玩家
import { createBattle, createPlayerBattle, spawnMonster, tickBattle } from '../src/core/battle';
import { createTurbid } from '../src/core/turbid';
import { getMonster, BATTLE_W, BATTLE_H } from '../src/data/monsters';
import { Rng } from '../src/core/rng';

const def = getMonster('boss-xuanming');
const s = createBattle(
  createPlayerBattle({ maxHp: 30, level: 1, armor: 0, damage: 0.001, attackSpeed: 0.1, critChance: 0, range: 1 }),
  createTurbid(),
);
s.monsters = [spawnMonster(def, 3, 1, BATTLE_W / 2 + 20, BATTLE_H / 2)];
const rng = new Rng(11);
let guard = 0, hits = 0, dmgSum = 0, hpBefore = s.player.hp;
while (s.deaths === 0 && guard++ < 2000) {
  const b = s.player.hp;
  tickBattle(s, 1 / 60, rng);
  if (s.player.hp < b) { dmgSum += b - s.player.hp; hits++; }
}
console.log('guard', guard, 'deaths', s.deaths, 'hits', hits, 'dmgSum', dmgSum.toFixed(2),
  'hp', s.player.hp.toFixed(2), 'monDmg', s.monsters[0]?.damage, 'interval', s.monsters[0]?.attackInterval);
