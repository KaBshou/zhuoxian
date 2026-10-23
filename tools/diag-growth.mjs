// 一次性诊断：玩家成长曲线 step 0 vs step 80。跑完即弃（.mjs 里不写 TS 类型标注）。
// 用法：node tools/diag-growth.mjs
import { openSrc } from './vite-loader.mjs';

const src = await openSrc();
const { createCharacter, characterAttrs, characterStats, baseDamage } = await src.load('/src/core/character.ts');

function dpsOf(s) {
  const crit = 1 + Math.min(1, s.critChance) * (s.critMulti - 1);
  // s.damage 是「攻伐%」的百分点数值（8 = +8%），换算成倍率要 /100
  return baseDamage() * (1 + s.damage / 100) * s.attackSpeed * crit;
}

const ch = createCharacter('yujian');
console.log('attrs@0 ', characterAttrs(ch));
const s0 = characterStats(ch);
console.log(
  'step0 : dmg%', s0.damage.toFixed(3),
  'atkSpd', s0.attackSpeed.toFixed(3),
  'life', s0.life,
  'armor', s0.armor,
  'crit', s0.critChance.toFixed(3),
);
console.log('step0 无装备 DPS ≈', dpsOf(s0).toFixed(1), '（BALANCE 层 1 标定 ≈ 9.8）');

const ch80 = { ...ch, step: 80 };
console.log('attrs@80 ', characterAttrs(ch80));
const s80 = characterStats(ch80);
console.log(
  'step80: dmg%', s80.damage.toFixed(3),
  'atkSpd', s80.attackSpeed.toFixed(3),
  'life', s80.life,
  'armor', s80.armor,
  'crit', s80.critChance.toFixed(3),
);
console.log('step80 无装备 DPS ≈', dpsOf(s80).toFixed(1));
console.log('气血倍率 step80/step0 =', (s80.life / s0.life).toFixed(3), '×');

await src.close();
