// 一次性补丁：shuzhi 神通体检建议 A —— fixed 型 baseDamage 语义改成「层 1 当量」，
// 结算时乘层曲线 FLOOR_HP_MUL^(层-1)，与怪血恒等比（一条公式管到底）。
// 落点：battle.ts skillStrike（base 处）+ monsters.ts 导出 SKILL_FLOOR_SCALE 文档。
import fs from 'node:fs';

function edit(p, old, neu, tag) {
  let c = fs.readFileSync(p, 'utf8');
  if (!c.includes(old)) { console.error('MISS ' + tag); process.exit(1); }
  c = c.split(old).join(neu);
  fs.writeFileSync(p, c, 'utf8');
  console.log('OK ' + tag);
}

const M = 'F:/dsh-work/zhuoxian/src/data/monsters.ts';
const B = 'F:/dsh-work/zhuoxian/src/core/battle.ts';

// 1) monsters.ts 导出神通同款层曲线工具（单一出处，别硬编码 1.1534 两处）
edit(M,
  '/** 第 `floor` 层击杀一只普通浊物给多少修为（= 2 × 层） */',
  `/** 神通（fixed 型）在第 floor 层的基础伤害倍率。
 *  baseDamage 的语义是「层 1 当量」：与怪血用同一条曲线（FLOOR_HP_MUL），
 *  法术 DPS 与怪血恒等比，不会出现「第 3 层起法术注定归零」的结构性衰减。
 *  （shuzhi 2026-10-22 神通体检建议 A，已拍板采纳。） */
export function skillFloorScale(floor: number): number {
  return scaleOfFloor(floor).hp;
}

/** 第 \`floor\` 层击杀一只普通浊物给多少修为（= 2 × 层） */`,
  'skill-scale');

// 2) battle.ts：import + skillStrike base
edit(B,
  'import {\n  BASE_MONSTER_DAMAGE,\n  BASE_MONSTER_HP,\n  BOSS_ATTACK_INTERVAL,\n  BOSS_REGEN_PERIOD,\n  BOSS_REGEN_RATIO,\n  scaleOfFloor,\n  xpPerKill,\n} from \'../data/monsters\';',
  'import {\n  BASE_MONSTER_DAMAGE,\n  BASE_MONSTER_HP,\n  BOSS_ATTACK_INTERVAL,\n  BOSS_REGEN_PERIOD,\n  BOSS_REGEN_RATIO,\n  scaleOfFloor,\n  skillFloorScale,\n  xpPerKill,\n} from \'../data/monsters\';',
  'b-import');
edit(B,
  ' * 1. base：weapon 型用 p.damage（吃武器/面板），fixed 型用 skill.baseDamage（吃神通等级）',
  ' * 1. base：weapon 型用 p.damage（吃武器/面板）；fixed 型用 skill.baseDamage × skillFloorScale(target.tier)\n *    —— baseDamage 是「层 1 当量」，不乘层曲线的话法术 DPS 会在第 3 层起被怪血甩开并归零',
  'b-doc');
edit(B,
  '    base: skill.damageType === \'weapon\' ? p.damage : skill.baseDamage,',
  `    base:
      skill.damageType === 'weapon'
        ? p.damage
        : skill.baseDamage * skillFloorScale(target.tier),`,
  'b-base');
console.log('DONE');
