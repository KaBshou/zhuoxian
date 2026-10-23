// 一次性补丁：battle.ts 接入技能系统（真元 + 施法冷却 + 神通替代普攻出手）。跑完即弃。
//
// 设计（写进代码注释）：
// - 真元/施法是战斗态（不是存档态）：mana、castCooldowns 每场战斗重置。
// - 施法占玩家的出手节律（共用 attackCooldown），不打断普攻循环 —— 放置游戏的约束。
// - 神通伤害走 computeDamage 同一条管线：damageType='weapon' 用 p.damage 当 base，
//   'fixed' 用 skill.baseDamage 当 base；玉简修正器按技能标签过滤后并入。
// - cooldown=0 的神通（御剑术）第一版当作「普攻的默认形态」：
//   它不解锁任何独立施法，普攻本身即御剑术 —— 所以 unlockStep=0 的它在战斗里不可见。
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

// ── imports ──
repl(
  "import type { Rng } from './rng';",
  "import type { Rng } from './rng';\nimport type { ActiveSkillDef } from '../data/skills';\nimport { pickNextSkill, skillModifiers } from './skills-runtime';\nimport { gemModifiersFor, SUPPORT_GEMS } from '../data/support-gems';",
  'imports',
);

// ── PlayerBattle：加 mana / maxMana ──
repl(
  "  /** 每次命中回复多少气血（灵纹「击中回气」在这里生效） */\n  lifeOnHit: number;",
  "  /** 每次命中回复多少气血（灵纹「击中回气」在这里生效） */\n  lifeOnHit: number;\n  /** 当前真元（战斗态，不入档） */\n  mana: number;\n  /** 真元上限（面板 STAT_META.mana 的值） */\n  maxMana: number;",
  'player-mana',
);

// ── PlayerBattleInput ──
repl(
  "  readonly lifeRegen?: number;\n  readonly lifeOnHit?: number;\n}",
  "  readonly lifeRegen?: number;\n  readonly lifeOnHit?: number;\n  readonly maxMana?: number;\n}",
  'input-mana',
);

repl(
  "    lifeRegen: pos(input.lifeRegen ?? 0, 0),\n    lifeOnHit: pos(input.lifeOnHit ?? 0, 0),",
  "    lifeRegen: pos(input.lifeRegen ?? 0, 0),\n    lifeOnHit: pos(input.lifeOnHit ?? 0, 0),\n    maxMana: pos(input.maxMana ?? 0, 0),\n    mana: pos(input.maxMana ?? 0, 0), // 开局满真元",
  'factory-mana',
);

// ── playerBattleFromCharacter：传 maxMana ──
repl(
  "    // 回复灵纹在战斗里生效的唯一落点（BALANCE §8 的「挂机不死」靠这两条线）\n    lifeRegen: s.lifeRegen,\n    lifeOnHit: s.lifeOnHit,",
  "    // 回复灵纹在战斗里生效的唯一落点（BALANCE §8 的「挂机不死」靠这两条线）\n    lifeRegen: s.lifeRegen,\n    lifeOnHit: s.lifeOnHit,\n    maxMana: s.mana,",
  'bridge-mana',
);

// ── BattleState：施法冷却表 + 真元回复 ──
repl(
  "  /** 累计受到的伤害（血条会被回复拉满，所以\"挨过打\"只能靠这个数证明） */\n  damageTaken: number;\n}",
  "  /** 累计受到的伤害（血条会被回复拉满，所以\"挨过打\"只能靠这个数证明） */\n  damageTaken: number;\n  /** 各神通的剩余冷却（秒），key = skill.id（战斗态，不入档） */\n  castCooldowns: Record<string, number>;\n}",
  'state-cooldowns',
);

// createBattle 初始化 —— 找 createBattle 的返回体
repl(
  "    deathCleanup: false,",
  "    deathCleanup: false,\n    castCooldowns: {},",
  'init-cooldowns',
);

if (misses.length > 0) {
  console.error('MISS:', misses.join(', '));
  process.exit(1);
}
fs.writeFileSync(p, c, 'utf8');
console.log('OK part1');
