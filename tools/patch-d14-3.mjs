/**
 * D14 落地第三批：skills-runtime.ts + battle.ts 改成每神通各自装配表。
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

const R = 'F:/dsh-work/zhuoxian/src/core/skills-runtime.ts';
const B = 'F:/dsh-work/zhuoxian/src/core/battle.ts';

// ── skills-runtime.ts ──
edit(R,
  `export function skillModifiers(ch: CharacterState, skill: ActiveSkillDef): Modifier[] {
  const gems = characterGemLoadout(ch)
    .map((id) => getSupportGem(id))
    .filter((g) => g !== undefined);
  return gemModifiersFor(gems, skill.tags);
}`,
  `export function skillModifiers(ch: CharacterState, skill: ActiveSkillDef): Modifier[] {
  const gems = characterGemLoadout(ch, skill.id)
    .map((id) => getSupportGem(id))
    .filter((g) => g !== undefined);
  return gemModifiersFor(gems, skill.tags);
}`,
  'runtime-loadout');

edit(R,
  `import { SUPPORT_GEMS, gemModifiersFor, getSupportGem } from '../data/support-gems';
import { characterStats, characterGemLoadout } from './character';`,
  `import { SUPPORT_GEMS, gemModifiersFor, getSupportGem, gemCostMulFor } from '../data/support-gems';
import { characterStats, characterGemLoadout } from './character';`,
  'runtime-import');

// 新增：某神通装配表的真元消耗倍率（battle.ts 扣费用）
edit(R,
  `/** 神通单次期望伤害（未含暴击/护甲/随机 roll，战斗层再补） */`,
  `/** 某神通装配表的真元消耗倍率（D14：每神通各自装配，战斗层扣费/判定两处都要用） */
export function skillCostMul(ch: CharacterState, skill: ActiveSkillDef): number {
  const gems = characterGemLoadout(ch, skill.id)
    .map((id) => getSupportGem(id))
    .filter((g) => g !== undefined);
  return gemCostMulFor(gems, skill.tags);
}

/** 神通单次期望伤害（未含暴击/护甲/随机 roll，战斗层再补） */`,
  'runtime-costmul');

// ── battle.ts：createBattle 按每神通各自装配 ──
edit(B,
  `  const loadout = ch
    ? characterGemLoadout(ch).map((id) => getSupportGem(id)).filter((g) => g !== undefined)
    : [];
  for (const skill of rotation) {
    gemMods[skill.id] = gemModifiersFor(loadout, skill.tags);
    gemCostMul[skill.id] = gemCostMulFor(loadout, skill.tags);
  }`,
  `  for (const skill of rotation) {
    // D14：每神通各自 4 槽装配（不是全局共享）——共享表火系只保 57%，
    // 装不下三套（1速度+1元素+拷皮+万汇 是全类最优，猛攻只对 attack 有效）。
    const loadout = ch
      ? characterGemLoadout(ch, skill.id).map((id) => getSupportGem(id)).filter((g) => g !== undefined)
      : [];
    gemMods[skill.id] = gemModifiersFor(loadout, skill.tags);
    gemCostMul[skill.id] = gemCostMulFor(loadout, skill.tags);
  }`,
  'battle-per-skill');

console.log('DONE');
