/**
 * 万汇 costMul 接线（第三轮：补扣费与判定两处乘算 —— shuzhi 报的「死代码」bug）。
 * 一次性补丁，跑完即弃。
 */
import fs from 'node:fs';

function edit(p, old, neu, tag) {
  let c = fs.readFileSync(p, 'utf8');
  if (!c.includes(old)) { console.error('MISS ' + tag); process.exit(1); }
  c = c.split(old).join(neu);
  fs.writeFileSync(p, c, 'utf8');
  console.log('OK ' + tag);
}

const B = 'F:/dsh-work/zhuoxian/src/core/battle.ts';

// 1) 施放扣费乘 costMul
edit(B,
  '    p.mana -= skill.manaCost;',
  '    p.mana -= skill.manaCost * (state.gemCostMulBySkill[skill.id] ?? 1);',
  'spend');

// 2) pickNextSkillRaw：签名带 costMuls、判定乘上
edit(B,
  `function pickNextSkillRaw(
  rotation: readonly ActiveSkillDef[],
  mana: number,
  cooldowns: Readonly<Record<string, number>>,
): ActiveSkillDef | null {
  for (const skill of rotation) {
    if (skill.cooldown <= 0) continue; // cooldown=0 的当普攻形态，不独立施放
    if ((cooldowns[skill.id] ?? 0) > 0) continue;
    if (mana < skill.manaCost) continue;`,
  `function pickNextSkillRaw(
  rotation: readonly ActiveSkillDef[],
  mana: number,
  cooldowns: Readonly<Record<string, number>>,
  costMuls: Readonly<Record<string, number>>,
): ActiveSkillDef | null {
  for (const skill of rotation) {
    if (skill.cooldown <= 0) continue; // cooldown=0 的当普攻形态，不独立施放
    if ((cooldowns[skill.id] ?? 0) > 0) continue;
    if (mana < skill.manaCost * (costMuls[skill.id] ?? 1)) continue;`,
  'fn');

// 3) 调用点传表
edit(B,
  'const skill = pickNextSkillRaw(state.skillRotation, p.mana, state.castCooldowns);',
  'const skill = pickNextSkillRaw(state.skillRotation, p.mana, state.castCooldowns, state.gemCostMulBySkill);',
  'call');

console.log('DONE');
