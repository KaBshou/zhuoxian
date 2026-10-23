// 一次性补丁（第 2 部分）：tickBattle 接技能施法 + skillStrike 实现。跑完即弃。
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

// ── tickBattle：复活时真元回满（跟气血一条路）；2) 玩家出手改成「先神通后普攻」 ──
repl(
  "    if (state.reviveCooldown === 0) {\n      p.hp = p.maxHp;\n      p.shield = 0;\n    }",
  "    if (state.reviveCooldown === 0) {\n      p.hp = p.maxHp;\n      p.shield = 0;\n      p.mana = p.maxMana; // 重生回满真元，跟气血同一条路，两条回复不叠加\n      state.castCooldowns = {}; // 冷却表一并清空，避免复活瞬间白屏一个不可用列表\n    }",
  'revive-mana',
);

repl(
  "  // 2) 玩家出手\n  state.attackCooldown = Math.max(0, state.attackCooldown - d);\n  if (state.attackCooldown === 0 && state.monsters.length > 0) {\n    const target = nearestInRange(state.monsters, p, p.range);\n    if (target) {\n      playerStrike(state, target, rng);\n      state.attackCooldown = 1 / Math.max(0.1, p.attackSpeed);\n    }\n  }",
  "  // 2) 玩家出手。神通优先于普攻：冷却好的最高优先级神通插队占掉这一次出手\n  //（共用 attackCooldown 节律），普攻是兜底。真元每帧回 MANA_REGEN_PER_SEC。\n  p.mana = Math.min(p.maxMana, p.mana + MANA_REGEN_PER_SEC * d);\n  state.attackCooldown = Math.max(0, state.attackCooldown - d);\n  for (const id of Object.keys(state.castCooldowns)) {\n    state.castCooldowns[id] = Math.max(0, state.castCooldowns[id] - d);\n  }\n  if (state.attackCooldown === 0 && state.monsters.length > 0) {\n    const target = nearestInRange(state.monsters, p, p.range);\n    if (target) {\n      const skill = pickNextSkillRaw(p.mana, state.castCooldowns);\n      if (skill) {\n        skillStrike(state, target, skill, rng);\n        p.mana -= skill.manaCost;\n        state.castCooldowns[skill.id] = skill.cooldown;\n      } else {\n        playerStrike(state, target, rng);\n      }\n      state.attackCooldown = 1 / Math.max(0.1, p.attackSpeed);\n    }\n  }",
  'tick-cast',
);

// ── 常量 + MANA_REGEN_PER_SEC ──
repl(
  "export const TURBID_PER_HIT = 2.5;",
  "export const TURBID_PER_HIT = 2.5;\n/** 真元回复（每秒）。BALANCE §11.5：基础回复 2/s，先写死，等数值定稿改可调。 */\nexport const MANA_REGEN_PER_SEC = 2;",
  'const-mana',
);

// ── skillStrike + pickNextSkillRaw（放 playerStrike 前） ──
repl(
  "/** 玩家打一只怪 */\nfunction playerStrike(state: BattleState, target: MonsterInPlay, rng: Rng): void {",
  "/**\n * 战斗层内挑神通：只用战斗态（mana / castCooldowns），不查角色表。\n * skills-runtime 的 pickNextSkill 是给 UI 用的；战斗内每帧调它要过一遍角色解锁表，\n * 这里换成同语义的轻量版（解锁判断在 castCooldowns 初始化时已做过）。\n */\nfunction pickNextSkillRaw(\n  mana: number,\n  cooldowns: Readonly<Record<string, number>>,\n): ActiveSkillDef | null {\n  for (const skill of SKILL_ROTATION) {\n    if (skill.cooldown <= 0) continue; // cooldown=0 的当普攻形态，不独立施放\n    if ((cooldowns[skill.id] ?? 0) > 0) continue;\n    if (mana < skill.manaCost) continue;\n    return skill;\n  }\n  return null;\n}\n\n/**\n * 神通打一只怪。与 playerStrike 同一条 computeDamage 管线，差异只有三处：\n * 1. base：weapon 型用 p.damage（吃武器/面板），fixed 型用 skill.baseDamage（吃神通等级）\n * 2. tags：用神通的道性标签（决定五行抗性/玉简修正器是否命中）\n * 3. modifiers：p.modifiers + 该神通命中的玉简修正器（gemModifiersFor 过滤）\n */\nfunction skillStrike(\n  state: BattleState,\n  target: MonsterInPlay,\n  skill: ActiveSkillDef,\n  rng: Rng,\n): void {\n  const p = state.player;\n  const isCrit = rng.chance(p.critChance);\n  const defense: DefenseProfile = {\n    armor: target.armor,\n    resist: target.resist,\n    level: target.tier,\n  };\n  const gemMods = skillModifiers(p, skill);\n  const res: DamageResult = computeDamage({\n    base: skill.damageType === 'weapon' ? p.damage : skill.baseDamage,\n    tags: skill.tags,\n    modifiers: [...p.modifiers, ...gemMods],\n    isCrit,\n    target: defense,\n    externalMore: turbidMultiplier(state.turbid),\n    roll: rng.float(0.9, 1.1),\n  });\n\n  target.hp -= res.amount;\n  state.events.push({\n    kind: res.isCrit ? 'player-crit' : 'player-hit',\n    label: `${skill.name} ${res.amount}`,\n    amount: res.amount,\n    x: target.x,\n    y: target.y,\n  });\n\n  if (target.hp <= 0) {\n    target.hp = 0;\n    state.kills += 1;\n    state.xpGained += target.xp;\n    state.events.push({\n      kind: 'player-kill',\n      label: `击杀 ${target.name}`,\n      x: target.x,\n      y: target.y,\n      monster: {\n        defId: target.defId,\n        tier: target.tier,\n        rarity: target.rarity,\n        xp: target.xp,\n        x: target.x,\n        y: target.y,\n      },\n    });\n    addTurbid(state.turbid, TURBID_PER_KILL);\n  } else {\n    addTurbid(state.turbid, TURBID_PER_HIT);\n    if (p.lifeOnHit > 0) p.hp = Math.min(p.maxHp, p.hp + p.lifeOnHit);\n  }\n}\n\n/** 玩家打一只怪 */\nfunction playerStrike(state: BattleState, target: MonsterInPlay, rng: Rng): void {",
  'skillstrike',
);

if (misses.length > 0) {
  console.error('MISS:', misses.join(', '));
  process.exit(1);
}
fs.writeFileSync(p, c, 'utf8');
console.log('OK part2');
