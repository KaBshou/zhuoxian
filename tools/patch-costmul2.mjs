/**
 * 万汇 costMul 接线（第二轮：修正 import 写法）。
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

// 1) character import 加 characterGemLoadout
edit(B,
  `import {
  characterModifiers,
  characterStats,
  baseDamage,
  type CharacterState,
} from './character';`,
  `import {
  characterModifiers,
  characterStats,
  baseDamage,
  characterGemLoadout,
  type CharacterState,
} from './character';`,
  'import-ch');

// 2) createBattle 预计算（装配表 + costMul）
edit(B,
  `  const gemMods: Record<string, readonly Modifier[]> = {};
  for (const skill of rotation) {
    gemMods[skill.id] = ch
      ? gemModifiersFor(SUPPORT_GEMS.filter((g) => ch.step >= g.unlockStep), skill.tags)
      : [];
  }`,
  `  const gemMods: Record<string, readonly Modifier[]> = {};
  const gemCostMul: Record<string, number> = {};
  // 装配表（characterGemLoadout：解锁过滤 + 去重 + 截到 GEM_SLOTS=4），
  // 不是「解锁即全开」—— 槽位是第一版的核心 build 决策。
  const loadout = ch
    ? characterGemLoadout(ch).map((id) => getSupportGem(id)).filter((g) => g !== undefined)
    : [];
  for (const skill of rotation) {
    gemMods[skill.id] = gemModifiersFor(loadout, skill.tags);
    gemCostMul[skill.id] = gemCostMulFor(loadout, skill.tags);
  }`,
  'createBattle');

console.log('DONE');
