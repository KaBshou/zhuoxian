/**
 * 万汇 costMul 接线（shuzhi 已在 support-gems.ts 加 `costMul` 字段 + `gemCostMulFor`；
 * 这里补 battle.ts：预计算表 + 施放扣费/判定两处乘算）。
 *
 * 纪律（shuzhi 提醒的坑）：预计算一张 `gemCostMulBySkill`，别在 4 个地方各算一次 ——
 * 那是当年 MANA_REGEN_PER_SEC 写死两处的同一个坑。
 *
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

// 0) import gemCostMulFor + getSupportGem + characterGemLoadout
edit(B,
  "import { gemModifiersFor, SUPPORT_GEMS } from '../data/support-gems';",
  "import { gemModifiersFor, gemCostMulFor, getSupportGem } from '../data/support-gems';",
  'import-gcm');

edit(B,
  "import { CharacterState } from './character';",
  "import { CharacterState, characterGemLoadout } from './character';",
  'import-ch');

// 1) BattleState 加预计算表
edit(B,
  '  readonly gemModsBySkill: Readonly<Record<string, readonly Modifier[]>>;',
  '  readonly gemModsBySkill: Readonly<Record<string, readonly Modifier[]>>;\n  /** 每神通的真元代价倍率（预计算，读这张表；别在施放处现算） */\n  readonly gemCostMulBySkill: Readonly<Record<string, number>>;',
  'state-field');

// 2) createBattle 预计算（同时把玉简来源收口成装配表 —— 槽位 4 的另一半）
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

// 3) 施放扣费乘 costMul
edit(B,
  '    p.mana -= skill.manaCost;',
  '    p.mana -= skill.manaCost * (state.gemCostMulBySkill[skill.id] ?? 1);',
  'spend');

// 4) pickNextSkillRaw 的够不够判定乘 costMul
edit(B,
  '    if (mana < skill.manaCost) continue;',
  '    if (mana < skill.manaCost * costMul) continue;',
  'can-cast');

// 5) pickNextSkillRaw 签名与调用点带 costMul
edit(B,
  `function pickNextSkillRaw(
  rotation: readonly ActiveSkillDef[],
  mana: number,
  cooldowns: Readonly<Record<string, number>>,
): ActiveSkillDef | null {`,
  `function pickNextSkillRaw(
  rotation: readonly ActiveSkillDef[],
  mana: number,
  cooldowns: Readonly<Record<string, number>>,
  costMuls: Readonly<Record<string, number>>,
): ActiveSkillDef | null {`,
  'fn-sig');

edit(B,
  'const skill = pickNextSkillRaw(state.skillRotation, p.mana, state.castCooldowns);',
  'const skill = pickNextSkillRaw(state.skillRotation, p.mana, state.castCooldowns, state.gemCostMulBySkill);',
  'call-site');

edit(B,
  '    if ((cooldowns[skill.id] ?? 0) > 0) continue;\n    if (mana < skill.manaCost * costMul) continue;',
  '    if ((cooldowns[skill.id] ?? 0) > 0) continue;\n    if (mana < skill.manaCost * (costMuls[skill.id] ?? 1)) continue;',
  'fix-ref');

console.log('DONE');
