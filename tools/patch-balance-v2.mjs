// 一次性补丁：BALANCE v2 数值定稿落地（shuzhi 定稿，全量接受）。跑完即弃。
//
// 改动清单：
// 1. monsters.ts：FLOOR_HP_MUL 1.34→1.1534、FLOOR_DAMAGE_MUL 1.16→1.14
//    （40.85× 供给摊 26 区间 → 1.1534；入伤/气血从 24% 缓降到 17.7%，越刷越安全）
// 2. session.ts：WAVE_SIZE 8→18、WAVES_PER_FLOOR=10（BOSS_EVERY 5→10）、
//    下潜 +1 保持、MAX_FLOOR 9→27（BALANCE v2：27 层 = 5.8h）
// 3. drop.ts：DROP_CHANCE.normal 0.16→0.28（4 次/分 = 法宝 40% + 通货 47.5% + 玉简 12.5%）
// 4. drop.ts：ilvlForFloor 改 affixIlvlOfFloor = round(99×f/27)（层 1~4 黄/5~8 玄/9~12 地/13~27 天）
// 5. monsters.ts：BOSS_HP_MUL 回 25（v2 §11.2：镇守 ×25 血不变）、BOSS_DMG_MUL 4→1.5、
//    新增 BOSS_ATTACK_INTERVAL=5（1 次/5 秒）、BOSS_REGEN_RATIO=0.1（每 10s 自回 10%）
import fs from 'node:fs';

let misses = [];
function load(p) { return fs.readFileSync('F:/dsh-work/zhuoxian/' + p, 'utf8'); }
function save(p, c) { fs.writeFileSync('F:/dsh-work/zhuoxian/' + p, c, 'utf8'); }
function replIn(p, c, old, neu, tag) {
  if (!c.includes(old)) { misses.push(p + ':' + tag); return c; }
  return c.split(old).join(neu);
}

// ── monsters.ts ──
{
  const p = 'src/data/monsters.ts';
  let c = load(p);
  c = replIn(p, c, 'export const FLOOR_HP_MUL = 1.34;', 'export const FLOOR_HP_MUL = 1.1534;', 'hp');
  c = replIn(p, c, 'export const FLOOR_DAMAGE_MUL = 1.16;', 'export const FLOOR_DAMAGE_MUL = 1.14;', 'dmg');
  // 镇守常量：×25 回归、攻伐 1.5、5s 间隔、10s 自回
  c = replIn(p, c, 'export const BOSS_HP_MUL = 8;', 'export const BOSS_HP_MUL = 25;', 'bhp');
  c = replIn(p, c, 'export const BOSS_DMG_MUL = 4;', 'export const BOSS_DMG_MUL = 1.5;', 'bdmg');
  if (!c.includes('BOSS_ATTACK_INTERVAL')) {
    c = replIn(p, c, 'export const BOSS_HP_MUL = 25;',
      'export const BOSS_HP_MUL = 25;\n/** 镇守出手间隔（秒）：BALANCE v2 §11.2，难度从抗伤转限时 DPS 检查 */\nexport const BOSS_ATTACK_INTERVAL = 5;\n/** 镇守战内自回：每 10 秒回 10% 气血 */\nexport const BOSS_REGEN_RATIO = 0.1;\nexport const BOSS_REGEN_PERIOD = 10;', 'bconst');
  }
  // 三镇守 dmgMul 4 → 1.5（hpMul 25 保留）
  c = c.replace(/hpMul: 25, dmgMul: 4,/g, 'hpMul: 25, dmgMul: BOSS_DMG_MUL,');
  save(p, c);
}

// ── session.ts ──
{
  const p = 'src/core/session.ts';
  let c = load(p);
  c = replIn(p, c, 'export const WAVE_SIZE = 8;', 'export const WAVE_SIZE = 18;', 'wsize');
  c = replIn(p, c, 'export const BOSS_EVERY = 5;', 'export const BOSS_EVERY = 10;', 'bevery');
  c = replIn(p, c, 'export const MAX_FLOOR = 9;', 'export const MAX_FLOOR = 27;', 'mfloor');
  // 波末回气 25%：清场后（非死亡）回 25% 最大气血。放在消费 player-kill 清场判断之前最稳——
  // 实际清场判断在 tickSession 的 isCleared 分支，那里同时处理死亡。加一个净化分支。
  if (!c.includes('WAVE_END_REGEN')) {
    c = replIn(p, c, 'export const WAVE_GAP = 0.9;',
      "export const WAVE_GAP = 0.9;\n/** 波末脱战回气 25%（BALANCE v2 表 G）：恒定入伤比 + 波末回血 ⇒ 全程可挂机。\n * lifeRegen 词条定位改为「缩短脱战回血 + 镇守战续航」，不再是挂机不死的根基。 */\nexport const WAVE_END_REGEN = 0.25;", 'wregen');
  }
  save(p, c);
}

// ── drop.ts ──
{
  const p = 'src/core/drop.ts';
  let c = load(p);
  c = replIn(p, c, 'normal: 0.16', 'normal: 0.28', 'dropchance');
  // ilvlForFloor → 99×f/27
  c = replIn(p, c,
    "export function ilvlForFloor(floor: number): number {\n  return Math.max(1, Math.min(99, 5 * floor));\n}",
    "export function ilvlForFloor(floor: number): number {\n  // BALANCE v2 表 F：affixIlvlOfFloor = round(99×f/27)。\n  // 层 1~4 黄、5~8 玄、9~12 地、13~27 天（15/15/15/56%）。旧的 5×层 在 27 层下\n  // 最高 29，地/天两档永远洗不出来，作废。\n  return Math.max(1, Math.min(99, Math.round((99 * floor) / 27)));\n}",
    'ilvl');
  save(p, c);
}

if (misses.length > 0) {
  console.error('MISS:', misses.join(' | '));
  process.exit(1);
}
console.log('OK all');
