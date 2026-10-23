/**
 * 数值诊断 —— 把「玩家能打多少、怪有多硬」摊开看，用来对照 BALANCE.md。
 *
 * 用法：npx vite-node tools/diag-numbers.mjs
 */

import { createCharacter, characterStats, weaponDamage } from '../src/core/character.ts';
import { playerBattleFromCharacter } from '../src/core/battle.ts';
import { computeDamage } from '../src/core/damage.ts';
import { getMonster, monstersOfTier, scaleOfTier } from '../src/data/monsters.ts';
import { xpForStep } from '../src/core/progression.ts';

const ch = createCharacter('yujian');
const st = characterStats(ch);
const pb = playerBattleFromCharacter(ch);
const wd = weaponDamage(ch);

console.log('=== 玩家（开局，只有起始铁剑） ===');
console.log(`武器基础伤害 ${wd}　面板 damage 加成 ${st.damage}　攻速 ${st.attackSpeed.toFixed(2)}/s`);
console.log(`气血 ${st.life}　护体 ${st.armor}　破绽率 ${(st.critChance * 100).toFixed(1)}%`);
console.log(`战斗态：maxHp ${pb.maxHp} damage ${pb.damage} atkSpeed ${pb.attackSpeed.toFixed(2)} range ${pb.range}`);

// 对一只一阶普通怪算期望 DPS
const sample = monstersOfTier(1)[0];
if (sample) {
  const sc = scaleOfTier(1);
  const hp = sample.hp * sc.hp;
  const dmg = computeDamage({
    base: wd,
    tags: pb.tags,
    modifiers: pb.modifiers,
    isCrit: false,
    target: { armor: sample.armor, resist: sample.resist, level: 1 },
    roll: null,
  });
  const dps = dmg.raw * pb.attackSpeed * (1 + st.critChance * (1.5 - 1));
  console.log('');
  console.log(`=== 一阶 ${sample.name} ===`);
  console.log(`气血 ${hp.toFixed(0)}　护体 ${sample.armor}　攻伐 ${(sample.damage * sc.damage).toFixed(1)}　攻速间隔 ${sample.attackInterval}s`);
  console.log(`单次伤害（不暴击）${dmg.raw.toFixed(2)} → 取整 ${dmg.amount}`);
  console.log(`期望 DPS ${dps.toFixed(2)}`);
  console.log(`TTK ${(hp / dps).toFixed(1)} 秒　（BALANCE 目标 9.2s）`);
  console.log(`一波 3 只 = ${(3 * (hp / dps)).toFixed(0)} 秒　（目标 75s，但那是 8 只）`);
}

console.log('');
console.log('=== 一阶怪全体（scaleOfTier(1) 后） ===');
const sc = scaleOfTier(1);
for (const m of monstersOfTier(1)) {
  console.log(`${m.name.padEnd(6, '　')} 气血 ${(m.hp * sc.hp).toFixed(0).padStart(4)}　攻伐 ${(m.damage * sc.damage).toFixed(1).padStart(4)}　护体 ${m.armor}`);
}

console.log('');
console.log('=== 修为门槛（前 12 重） ===');
for (let i = 0; i < 12; i++) console.log(`台阶 ${i} → ${i + 1}: ${xpForStep(i).toFixed(0)}`);
