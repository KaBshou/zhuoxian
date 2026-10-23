// 一次性补丁：修 ceshi 回归报告的 P0-1 / P0-3 / P1。跑完即弃。
// P0-1 镇守血量：BALANCE §11.1 的「×25 血 vs 60~90 秒」自相矛盾（层 1 玩家 dps 9.8
//   打 2250 血要 230s）。拍板：结构不变（镇守 = 同层普通 ×N），N 从 25 改 **8**——
//   层 1 = 720 血 / dps 9.8 ≈ 73s，正好落在 60~90s 窗内。攻伐 ×4 保留（Boss 战
//   是唯一需要玩家盯浊气/手动决策的场合，BALANCE §8 本来就这么设计）。
// P0-3 灵蕴：ilvlForTier(tier)=5×阶×3 超规格 3~5 倍 → 改成**按层** ilvlForFloor(f)=5×f，
//   层 1 = 5（关掉二阶基底门槛 10，符合 BALANCE §9 预期）。
// P1 MAX_FLOOR：9（代码事实）为准；下潜步长 3→1（逐层下潜，27 层结构废弃；
//   一层 = 5 波镇守波也是事实结构，波数问题留给 shuzhi 定稿时一起调）。
import fs from 'node:fs';

let misses = [];
function patch(p, old, neu, tag) {
  let c = fs.readFileSync(p, 'utf8');
  if (!c.includes(old)) {
    misses.push(tag);
    return;
  }
  c = c.split(old).join(neu);
  fs.writeFileSync(p, c, 'utf8');
}

// ── P0-1：镇守血量 ×25 → ×8 ──
patch('src/data/monsters.ts',
`export const MAX_FLOOR = 9;`,
`export const MAX_FLOOR = 9;
/** 镇守血量 = 同层普通 ×8（BALANCE §11.1 的 ×25 与 60~90s 自相矛盾，层 1 要 230s；
 *  ×8 时层 1 = 720 血 / dps 9.8 ≈ 73s 正好落窗。攻伐 ×4 保留。） */
export const BOSS_HP_MUL = 8;
/** 镇守攻伐 = 同层普通 ×4（BALANCE §11.1 原值保留） */
export const BOSS_DMG_MUL = 4;`,
'boss-const');

patch('src/data/monsters.ts', 'hpMul: 25,', 'hpMul: BOSS_HP_MUL,', 'boss-hp1');
patch('src/data/monsters.ts', 'hpMul: 25,', 'hpMul: BOSS_HP_MUL,', 'boss-hp2');
patch('src/data/monsters.ts', 'hpMul: 25,', 'hpMul: BOSS_HP_MUL,', 'boss-hp3');
patch('src/data/monsters.ts', 'dmgMul: 4,', 'dmgMul: BOSS_DMG_MUL,', 'boss-dmg1');
patch('src/data/monsters.ts', 'dmgMul: 4,', 'dmgMul: BOSS_DMG_MUL,', 'boss-dmg2');
patch('src/data/monsters.ts', 'dmgMul: 4,', 'dmgMul: BOSS_DMG_MUL,', 'boss-dmg3');

// ── P0-3：灵蕴按层 5×层 ──
patch('src/core/drop.ts',
`export function ilvlForTier(tier: 1 | 2 | 3): number {
  return Math.min(99, 5 * floorOfTier(tier));
}`,
`/** 灵蕴 = 5 × 层数（BALANCE §13 D1；层 1 = 5，二阶基底门槛 10 要到层 2 才开） */
export function ilvlForFloor(floor: number): number {
  const f = Math.max(1, Math.min(19, Math.floor(floor)));
  return Math.min(99, 5 * f);
}

/** 兼容旧调用：按阶取该阶第一层的灵蕴 */
export function ilvlForTier(tier: 1 | 2 | 3): number {
  return ilvlForFloor(floorOfTier(tier));
}`,
'ilvl');

// ── P1：下潜步长 3 → 1（逐层下潜，MAX_FLOOR=9 为准） ──
patch('src/core/session.ts',
`  if (s.wave % BOSS_EVERY === 0 && s.floor < MAX_FLOOR) {
    s.floor = Math.min(MAX_FLOOR, s.floor + 3);`,
`  if (s.wave % BOSS_EVERY === 0 && s.floor < MAX_FLOOR) {
    // 逐层下潜：一层 = BOSS_EVERY 波，打赢镇守下潜 1 层。
    // （曾写 +3，与 MAX_FLOOR=9 组合会出现 1→4→7→9，层 2/3/5/6/8 永不出现）
    s.floor = Math.min(MAX_FLOOR, s.floor + 1);`,
'descend');

if (misses.length > 0) {
  console.error('MISS:', misses.join(', '));
  process.exit(1);
}
console.log('OK all');
