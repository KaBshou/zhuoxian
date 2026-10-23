// 验证镇守自回每帧计时（diag 用，跑完即弃）
import { createServer } from 'vite';

const server = await createServer({
  root: 'F:/dsh-work/zhuoxian', configFile: false, appType: 'custom', logLevel: 'error',
  server: { middlewareMode: true, watch: null, hmr: false, open: false },
});
const bM = await server.ssrLoadModule('/src/core/battle.ts');
const monM = await server.ssrLoadModule('/src/data/monsters.ts');
const rngM = await server.ssrLoadModule('/src/core/rng.ts');
const { createBattle, tickBattle, spawnMonster } = bM;
const rng = new rngM.Rng(12345);
const player = { hp: 9000, maxHp: 9000, shield: 0, level: 9, armor: 0, resist: {}, damage: 1, attackSpeed: 1.14, castSpeed: 1, critChance: 0.078, critMulti: 1.5, range: 150, tags: [], modifiers: [], x: 480, y: 400, mana: 100, maxMana: 100 };
const state = createBattle(player, { value: 0, phase: 'calm', phaseLeft: 0 });
spawnMonster(monM.BOSSES[0], 1, 1, 480, 200, 'boss');
// spawnMonster 只返回怪不进 state（session 负责把 spawnRing 的数组赋进去）
const boss = spawnMonster(monM.BOSSES[0], 1, 2, 480, 200, 'boss');
state.monsters.push(boss);
const hp0 = boss.hp;
let regens = 0, lastHp = boss.hp;
for (let f = 0; f < 25 * 60; f++) {
  tickBattle(state, 1 / 60, rng);
  if (boss.hp > lastHp + 0.001) regens++;
  lastHp = boss.hp;
}
console.log(`boss hp0=${hp0.toFixed(0)} hpEnd=${boss.hp.toFixed(0)} maxHp=${boss.maxHp} regen events in 25s: ${regens} (expect ~2)`);
await server.close();
