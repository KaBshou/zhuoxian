// 一次性补丁：修「铁剑伤害双算」。
// 根因：weaponDamage() 把法器 base 的 flat damage 加进基础值（5+8=13），
// 而 itemModifiers() 又把同一条 base push 成 flat 8 修正器 → computeDamage 里 base 13 + flat 8 = 21。
// 修法（唯一真相原则）：武器 base damage 只走修正器管线；基础值只留拳脚 UNARMED_DAMAGE。
import fs from 'node:fs';

function patch(p, pairs) {
  let c = fs.readFileSync(p, 'utf8');
  for (const [old, neu, tag] of pairs) {
    if (!c.includes(old)) {
      console.error(`MISS [${p}] ${tag}`);
      process.exit(1);
    }
    c = c.split(old).join(neu);
  }
  fs.writeFileSync(p, c, 'utf8');
  console.log('OK ' + p);
}

// ── character.ts：weaponDamage 只留拳脚 ──
patch('src/core/character.ts', [
  [
    `/**
 * 武器基础伤害 = 拳脚 + 法器上所有「附加伤害」。
 *
 * 注意这里只取 \`base\`，不取 \`affixes\`：
 * 灵纹是加成（increased / flat 词条），会由修正器系统在伤害管线里统一结算。
 * 如果这里把灵纹也加进基础值，就会**重复计算**一遍。
 */
export function weaponDamage(ch: CharacterState): number {
  const weapon = ch.equipment.sword;
  if (!weapon) return UNARMED_DAMAGE;
  let flat = 0;
  for (const b of weapon.base) {
    if (b.stat === 'damage' && Number.isFinite(b.value)) flat += b.value;
  }
  return Math.max(UNARMED_DAMAGE, UNARMED_DAMAGE + flat);
}`,
    `/**
 * 玩家的基础伤害 = 拳脚。
 *
 * ⚠️ 法器 base 里的 flat damage **不在这里算** —— 它由 itemModifiers() 转成
 * flat 修正器、走全项目唯一的伤害管线结算。之前这里把 base 也加了一遍
 * （5+8=13），管线里又加一遍（+8=21），铁剑伤害凭空多了 60%。
 * 教训：一个数值只能有一个来源。基础值归基础值，加成归修正器。
 */
export function baseDamage(): number {
  return UNARMED_DAMAGE;
}`,
    'weapon-damage',
  ],
]);

// ── battle.ts：改用 baseDamage ──
patch('src/core/battle.ts', [
  ['  weaponDamage,', '  baseDamage,', 'imp'],
  ['    damage: weaponDamage(ch),', '    damage: baseDamage(),', 'use'],
]);

// ── inventory.ts：characterPower 的 DPS 改用面板 st.damage（含武器基底 flat，经管线算一次） ──
patch('src/core/inventory.ts', [
  [
    `import {
  weaponDamage,`,
    `import {
  UNARMED_DAMAGE,`,
    'imp',
  ],
  [
    `/**
 * 角色当前战力。
 *
 * 注意它用 \`weaponDamage\` 而不是面板 \`damage\` —— 面板 damage 是加成项，
 * 武器基底才是基础值。用错了会导致"换更好的剑战力不变"。
 */
export function characterPower(ch: CharacterState): number {
  const st = resolveAllStats(characterModifiers(ch));
  const weapon = weaponDamage(ch);
  const dps = weapon * st.attackSpeed * (1 + st.critChance * (st.critMulti - 1));`,
    `/**
 * 角色当前战力。
 *
 * DPS 的基础值 = 拳脚 + 武器基底 flat（后者已由修正器管线算进 \`st.damage\`，
 * 包括基底和「伤害提高」灵纹，各算一次）。直接用 st.damage + 拳脚即可，
 * 不要再把武器 base 手加一遍 —— 那是「铁剑伤害双算」事故的根源。
 */
export function characterPower(ch: CharacterState): number {
  const st = resolveAllStats(characterModifiers(ch));
  const dps = (UNARMED_DAMAGE + st.damage) * st.attackSpeed * (1 + st.critChance * (st.critMulti - 1));`,
    'power',
  ],
]);

// ── tests/character.test.ts：去掉 weaponDamage 导入 ──
patch('tests/character.test.ts', [
  ['  weaponDamage,\n  UNARMED_DAMAGE,', '  UNARMED_DAMAGE,', 'test-imp'],
]);

console.log('done');
