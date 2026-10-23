// 一次性补丁（第 3 部分）：修 SKILL_ROTATION / skillModifiers 签名不匹配。跑完即弃。
// - pickNextSkillRaw 需要「已解锁的神通列表」：战斗态里加 skillRotation: ActiveSkillDef[]
//   （createBattle 时按角色解锁表算好，之后每帧不再查角色）。
// - skillModifiers(p, skill) 的第一参数要 CharacterState，但战斗里只有 PlayerBattle。
//   玉简解锁也依赖角色台阶 → 同样在 createBattle 时预计算，存进战斗态：
//   gemModsBySkill: Record<string, Modifier[]>。
import fs from 'node:fs';

const p = 'src/core/battle.ts';
let c = fs.readFileSync(p, 'utf8');
let misses = [];

function repl(old, neu, tag) {
  if (!c.includes(old)) {
    misses.push(tag);
    return;
  }
  c = c.split(old).join(neu);
}

// imports：ACTIVE_SKILLS + unlockedSkills 替代
repl(
  "import { pickNextSkill, skillModifiers } from './skills-runtime';",
  "import { unlockedSkills } from './skills-runtime';",
  'imports',
);

// BattleState：加两个预计算字段
repl(
  "  /** 各神通的剩余冷却（秒），key = skill.id（战斗态，不入档） */\n  castCooldowns: Record<string, number>;\n}",
  "  /** 各神通的剩余冷却（秒），key = skill.id（战斗态，不入档） */\n  castCooldowns: Record<string, number>;\n  /** 本场战斗可施放的神通（createBattle 时按角色解锁台阶算好） */\n  readonly skillRotation: readonly ActiveSkillDef[];\n  /** 每个神通命中的玉简修正器（createBattle 时按标签过滤算好，key = skill.id） */\n  readonly gemModsBySkill: Readonly<Record<string, readonly Modifier[]>>;\n}",
  'state-fields',
);

// createBattle 签名加参数 ch
repl(
  "export function createBattle(player: PlayerBattle, turbid: TurbidState): BattleState {",
  "export function createBattle(\n  player: PlayerBattle,\n  turbid: TurbidState,\n  /** 角色存档态：算解锁神通与玉简修正器用（只读一次，不持有） */\n  ch?: CharacterState,\n): BattleState {\n  const rotation = ch ? unlockedSkills(ch).filter((s) => s.cooldown > 0) : [];\n  const gemMods: Record<string, readonly Modifier[]> = {};\n  for (const skill of rotation) {\n    gemMods[skill.id] = ch\n      ? gemModifiersFor(SUPPORT_GEMS.filter((g) => ch.step >= g.unlockStep), skill.tags)\n      : [];\n  }",
  'createbattle-sig',
);

repl(
  "    deathCleanup: false,\n    castCooldowns: {},",
  "    deathCleanup: false,\n    castCooldowns: {},\n    skillRotation: rotation,\n    gemModsBySkill: gemMods,",
  'init-fields',
);

// pickNextSkillRaw 改用 state.skillRotation —— 它在 skillStrike 附近，签名简化
repl(
  "function pickNextSkillRaw(\n  mana: number,\n  cooldowns: Readonly<Record<string, number>>,\n): ActiveSkillDef | null {\n  for (const skill of SKILL_ROTATION) {",
  "function pickNextSkillRaw(\n  rotation: readonly ActiveSkillDef[],\n  mana: number,\n  cooldowns: Readonly<Record<string, number>>,\n): ActiveSkillDef | null {\n  for (const skill of rotation) {",
  'pickraw',
);

// tickBattle 调用处传 rotation
repl(
  "      const skill = pickNextSkillRaw(p.mana, state.castCooldowns);",
  "      const skill = pickNextSkillRaw(state.skillRotation, p.mana, state.castCooldowns);",
  'tick-call',
);

// skillStrike 里 gemMods 改查预计算表
repl(
  "  const gemMods = skillModifiers(p, skill);",
  "  const gemMods = state.gemModsBySkill[skill.id] ?? [];",
  'gemmods',
);

// skills-runtime 里 now-unused 的导出保留（UI 以后用），battle.ts 不再 import skillModifiers —— 已换掉

if (misses.length > 0) {
  console.error('MISS:', misses.join(', '));
  process.exit(1);
}
fs.writeFileSync(p, c, 'utf8');
console.log('OK part3');
