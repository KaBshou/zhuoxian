/**
 * 技能层 —— 角色装了哪些神通/玉简、战斗里怎么施放。
 *
 * 设计纪律：
 * - 第一版**自动施放**：全部解锁的神通按优先级列表自动放（放置游戏的根本约束）。
 * - 神通不打断普攻节律：普攻照旧，神通在冷却好且真元够时插一次（也占出手）。
 * - 修正器过滤唯一入口是 `gemModifiersFor`（support-gems.ts），这里不许再写标签匹配。
 */
import type { ActiveSkillDef } from '../data/skills';
import { ACTIVE_SKILLS, getActiveSkill } from '../data/skills';
import { SUPPORT_GEMS, gemModifiersFor, getSupportGem, gemCostMulFor } from '../data/support-gems';
import { characterStats, characterGemLoadout } from './character';
import type { CharacterState } from './character';
import type { Modifier } from './modifier';

/** 玩家当前可用的神通（按解锁台阶过滤 + 固定顺序） */
export function unlockedSkills(ch: CharacterState): ActiveSkillDef[] {
  return ACTIVE_SKILLS.filter((s) => ch.step >= s.unlockStep);
}

/** 玩家当前可用的辅助玉简 */
export function unlockedGems(ch: CharacterState) {
  return SUPPORT_GEMS.filter((g) => ch.step >= g.unlockStep);
}

/** 某神通按**装配表**装上的玉简产出的修正器（槽位上限 GEM_SLOTS=4）。
 *  装配表由 characterGemLoadout 归一（解锁过滤/去重/截断）。
 *  旧版「解锁即全开」是零决策 —— 12 选 4 才是第一版的 build 核心。 */
export function skillModifiers(ch: CharacterState, skill: ActiveSkillDef): Modifier[] {
  const gems = characterGemLoadout(ch, skill.id)
    .map((id) => getSupportGem(id))
    .filter((g) => g !== undefined);
  return gemModifiersFor(gems, skill.tags);
}

/** 某神通装配表的真元消耗倍率（D14：每神通各自装配，战斗层扣费/判定两处都要用） */
export function skillCostMul(ch: CharacterState, skill: ActiveSkillDef): number {
  const gems = characterGemLoadout(ch, skill.id)
    .map((id) => getSupportGem(id))
    .filter((g) => g !== undefined);
  return gemCostMulFor(gems, skill.tags);
}

/** 神通单次期望伤害（未含暴击/护甲/随机 roll，战斗层再补） */
export function skillBaseDamage(ch: CharacterState, skill: ActiveSkillDef): number {
  if (skill.damageType === 'weapon') return 0; // 武器型吃 p.damage，这里补 0
  return skill.baseDamage;
}

/** 神通当前冷却（秒）——数据表值，战斗内再乘冷却缩减（第一版没有冷却缩减词条） */
export function skillCooldown(skill: ActiveSkillDef): number {
  return skill.cooldown;
}

/** 能否施放：解锁 / 冷却好 / 真元够 */
export function canCast(
  ch: CharacterState,
  skill: ActiveSkillDef,
  mana: number,
  cooldownLeft: number,
): boolean {
  return (
    ch.step >= skill.unlockStep &&
    cooldownLeft <= 0 &&
    mana >= skill.manaCost &&
    skill.cooldown > 0 // cooldown=0 的神通第一版当普攻增强处理，不单独施放
  );
}

/** 按优先级挑下一个该放的神通（列表顺序 = 优先级，第一版） */
export function pickNextSkill(
  ch: CharacterState,
  mana: number,
  cooldowns: Readonly<Record<string, number>>,
): ActiveSkillDef | null {
  for (const skill of unlockedSkills(ch)) {
    if (canCast(ch, skill, mana, cooldowns[skill.id] ?? 0)) return skill;
  }
  return null;
}

/** 神通是否存在（存档里的 id 必须能查到表，否则丢弃） */
export function knownSkill(id: string): ActiveSkillDef | undefined {
  return getActiveSkill(id);
}

/** 面板用：角色神通总览（含是否解锁） */
export function skillOverview(ch: CharacterState) {
  const s = characterStats(ch);
  return ACTIVE_SKILLS.map((skill) => ({
    skill,
    unlocked: ch.step >= skill.unlockStep,
    manaCost: skill.manaCost,
    manaOk: s.mana >= skill.manaCost,
  }));
}
