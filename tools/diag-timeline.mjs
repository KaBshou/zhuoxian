/**
 * 时间线诊断 —— 打印每一波的真实经过，用来解释「为什么 10 分钟只杀了 N 只」。
 *
 * 用法：node tools/diag-timeline.mjs
 */
import { openSrc } from './vite-loader.mjs';

const src = await openSrc();
const { createSession, startWave, tickSession } = await src.load('/src/core/session.ts');
const { AFFIXES } = await src.load('/src/data/affixes.ts');
const { ITEM_BASES } = await src.load('/src/data/bases.ts');

const TABLES = { bases: ITEM_BASES, affixes: AFFIXES };
const DT = 1 / 60;

const s = createSession({ classId: 'yujian', seed: 1, tables: TABLES });
startWave(s);

console.log('=== 开局状态 ===');
console.log(
  `玩家 hp ${s.battle.player.hp}/${s.battle.player.maxHp} damage ${s.battle.player.damage} ` +
    `atkSpeed ${s.battle.player.attackSpeed.toFixed(2)} range ${s.battle.player.range}`,
);
console.log(`怪数 ${s.battle.monsters.length}`);
for (const m of s.battle.monsters) {
  console.log(
    `  ${m.name} hp ${m.hp} dmg ${m.damage} 距玩家 ${Math.hypot(m.x - s.battle.player.x, m.y - s.battle.player.y).toFixed(0)}`,
  );
}
console.log('');

let lastWave = s.wave;
let lastKills = 0;
let lastDeaths = 0;
let ticks = 0;

// 每 0.25 秒采样一次，跑 120 秒
const sampleEvery = 15;
for (let i = 0; i < 120 * 60; i++) {
  tickSession(s, DT);
  ticks++;
  if (ticks % sampleEvery !== 0) continue;

  if (s.wave !== lastWave) {
    console.log(
      `t≈${(ticks * DT).toFixed(1)}s  波次 ${lastWave} → ${s.wave}` +
        `（击杀 ${s.battle.kills - lastKills}、死亡 ${s.battle.deaths - lastDeaths}）`,
    );
    lastWave = s.wave;
    lastKills = s.battle.kills;
    lastDeaths = s.battle.deaths;
  }
}

console.log('');
console.log('=== 前 120 秒的死亡/换波时间线（前 40 条） ===');
const s2 = createSession({ classId: 'yujian', seed: 1, tables: TABLES });
startWave(s2);
let prevDeaths = 0;
let prevWave = s2.wave;
let t = 0;
const timeline = [];
for (let i = 0; i < 120 * 60; i++) {
  t += DT;
  tickSession(s2, DT);
  if (s2.battle.deaths > prevDeaths) {
    timeline.push(
      `t=${t.toFixed(1)}s 死亡（波 ${s2.wave}，场上怪 ${s2.battle.monsters.length}，层 ${s2.floor}）`,
    );
    prevDeaths = s2.battle.deaths;
  }
  if (s2.wave !== prevWave) {
    timeline.push(
      `t=${t.toFixed(1)}s 波次 ${prevWave} → ${s2.wave}，累计击杀 ${s2.battle.kills}，累计死亡 ${s2.battle.deaths}，层 ${s2.floor}`,
    );
    prevWave = s2.wave;
  }
}
for (const l of timeline.slice(0, 40)) console.log(l);

console.log('');
console.log('=== 120 秒总结 ===');
console.log(
  `击杀 ${s2.battle.kills}　死亡 ${s2.battle.deaths}　波次 ${s2.wave}　层 ${s2.floor}　台阶 ${s2.character.step}`,
);
console.log(
  `平均每波 ${(120 / Math.max(1, s2.wave)).toFixed(1)} 秒，其中 ${(s2.battle.kills / Math.max(1, s2.wave)).toFixed(2)} 只/波`,
);

await src.close();
