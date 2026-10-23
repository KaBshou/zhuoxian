// E1 冒烟：五个判据 + 层 1 镇守 TTK 实测（ceshi 报「层 1 镇守 900 秒打不死」）
import {
  scaleOfFloor,
  bossHpMul,
  hasBossFloor,
  depthRarityBonus,
  MAX_FLOOR,
  MAIN_FLOOR_END,
  BASE_MONSTER_HP,
  bossOfTier,
  tierOfFloor,
} from '../src/data/monsters';
import { createSession, startWave, tickSession } from '../src/core/session';
import { ITEM_BASES } from '../src/data/bases';
import { AFFIXES } from '../src/data/affixes';

const ok = (name, actual, expect) => {
  const pass = Math.abs(actual - expect) < 0.6 || actual === expect;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}: ${actual} (期望 ${expect})`);
  return pass;
};

let all = true;
all = ok('scaleOfFloor(27).hp', Math.round(scaleOfFloor(27).hp * 10) / 10, 40.9) && all;
all = ok('scaleOfFloor(28).hp', Math.round(scaleOfFloor(28).hp * 10) / 10, 45) && all;
all = ok('scaleOfFloor(36).hp', Math.round(scaleOfFloor(36).hp * 10) / 10, 96.4) && all;
all = ok('bossHpMul(36)', Math.round(bossHpMul(36) * 10) / 10, 10) && all;
all = ok('bossHpMul(28)', Math.round(bossHpMul(28) * 10) / 10, 20) && all;
all = ok('depthRarityBonus(36)', Math.round(depthRarityBonus(36) * 1000) / 1000, 0.45) && all;
all = ok('hasBossFloor(36) 应为 0(false)', hasBossFloor(36) ? 1 : 0, 0) && all;
all = ok('hasBossFloor(45) 应为 1(true)', hasBossFloor(45) ? 1 : 0, 1) && all;
console.log('常量 MAX_FLOOR=' + MAX_FLOOR + ' MAIN_FLOOR_END=' + MAIN_FLOOR_END);

// ── 层 1 镇守 TTK 实测（裸装、起始铁剑）──
const s = createSession({ classId: 'yujian', seed: 7, tables: { bases: ITEM_BASES, affixes: AFFIXES } });
startWave(s);
// 快进到第 10 波（镇守波）之前：直接一路 tick
let guard = 0;
while (s.wave < 9 && guard < 60 * 60 * 30) {
  tickSession(s, 1 / 60);
  guard += 1;
}
console.log(`\n到达第 ${s.wave} 波（层 ${s.floor}），用时 ${(guard / 60).toFixed(0)}s，击杀 ${s.kills}`);
// 跑到第 10 波
while (s.wave % 10 !== 0 && guard < 60 * 60 * 60) {
  tickSession(s, 1 / 60);
  guard += 1;
}
const boss = s.battle.monsters.find((m) => m.rarity === 'boss');
console.log(`镇守出场：${boss ? boss.name + ' 血 ' + Math.round(boss.maxHp) + ' 攻 ' + boss.damage.toFixed(2) + ' 护体 ' + boss.armor : '（没出）'}`);
console.log(`玩家：血 ${Math.round(s.battle.player.hp)}/${Math.round(s.battle.player.maxHp)} 面板伤 ${s.battle.player.damage} 攻速 ${s.battle.player.attackSpeed.toFixed(2)} 破绽 ${(s.battle.player.critChance * 100).toFixed(1)}%`);

const t0 = guard;
let killedAt = null;
let deaths0 = s.battle.deaths;
while (guard < t0 + 60 * 60 * 10) { // 最多等 10 分钟游戏时间
  tickSession(s, 1 / 60);
  guard += 1;
  const b = s.battle.monsters.find((m) => m.rarity === 'boss');
  if (!b || b.hp <= 0) { killedAt = guard; break; }
  if (s.battle.deaths > deaths0) { console.log(`玩家在镇守战死了（第 ${s.battle.deaths} 次）`); deaths0 = s.battle.deaths; }
}
const ttk = killedAt ? ((killedAt - t0) / 60).toFixed(1) : '>600';
console.log(`\n镇守 TTK = ${ttk} 秒`);
console.log(`镇守修为系数：tier=${tierOfFloor(1)} 镇守=${bossOfTier(tierOfFloor(1))?.name}`);

// 逐帧采样前 20 秒的伤害差，判断是不是「打不动」
const s2 = createSession({ classId: 'yujian', seed: 7, tables: { bases: ITEM_BASES, affixes: AFFIXES } });
startWave(s2);
let g2 = 0;
while (s2.wave % 10 !== 0 && g2 < 60 * 60 * 60) { tickSession(s2, 1 / 60); g2 += 1; }
const b2 = s2.battle.monsters.find((m) => m.rarity === 'boss');
const hp0 = b2 ? b2.hp : 0;
for (let i = 0; i < 60 * 20; i++) tickSession(s2, 1 / 60);
const b2b = s2.battle.monsters.find((m) => m.rarity === 'boss');
console.log(`20 秒内镇守血量：${Math.round(hp0)} → ${Math.round(b2b ? b2b.hp : 0)}（掉 ${Math.round(hp0 - (b2b ? b2b.hp : 0))}）`);
console.log(all ? '\nE1 判据全过' : '\nE1 有判据没过');
