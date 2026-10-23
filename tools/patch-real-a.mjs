// 一次性补丁 A：D36-A（E1）无尽层 —— MAX_FLOOR 46 / 层 28+ 血 1.08 / 镇守每 5 层 + 血线性降幂 / 深品阶奖励
import fs from 'node:fs';

const ROOT = 'F:/dsh-work/zhuoxian';
const files = {};
function load(rel) {
  const p = `${ROOT}/${rel}`;
  const c = fs.readFileSync(p, 'utf8');
  files[rel] = { p, orig: c, cur: c };
  fs.writeFileSync(`${ROOT}/tools/_bak/${rel.replace(/\//g, '_')}.${Date.now()}.bak`, c, 'utf8');
}
function repl(rel, old, neu, tag) {
  const f = files[rel];
  const n = f.cur.split(old).length - 1;
  if (n !== 1) throw new Error(`MISS(${n}) ${rel}: ${tag}`);
  f.cur = f.cur.replace(old, neu);
  console.log('ok:', rel, tag);
}
function flush(rel) {
  const f = files[rel];
  if (f.cur.length < f.orig.length * 0.98) throw new Error(`拒绝写盘 ${rel}`);
  fs.writeFileSync(f.p, f.cur, 'utf8');
  console.log('flush', rel, f.cur.length, 'B');
}

// ── monsters.ts ─────────────────────────────────────────
load('src/data/monsters.ts');
repl('src/data/monsters.ts',
  `export const MAX_FLOOR = 27;`,
  `export const MAX_FLOOR = 46;

/**
 * 无尽层起点（D36-A / BALANCE §21.4 E1，2026-10-22 拍板）。
 *
 * 层 1~27 是主线（三阶各 9 层），层 28+ 是无尽层：复用第三阶怪表，
 * 靠层曲线继续放大。**无尽层的存在理由不是"更多层"，而是主线的
 * 「层 36 之后奖励到顶」需要一个能一直刷下去的地方**（24h 目标里无尽层占 3h）。
 */
export const ENDLESS_FLOOR_START = 28;

/**
 * 无尽层每层血量倍率（BALANCE §21.3 实测反推）。
 *
 * 主线用 1.1534（=玩家 40.85× DPS 供给的 26 次方根），但那个系数摊到
 * 层 28+ 会立刻变成死墙：玩家强度天花板实测 ≈877 有效 DPS（层 25~27 中位 548
 * + 天阶仙品 4 条对口 ×1.6 空间），1.1534 到层 33 只剩 7.2 杀/分、层 40 剩 2.7
 * —— 等于做了 13 层没人能玩。1.08 让层 36 还有 8.5 杀/分、层 46 有 4.3。
 */
export const ENDLESS_HP_GROWTH = 1.08;

/**
 * 无尽层镇守血系数下限（上限是主线的 BOSS_HP_MUL=25）。
 *
 * 为什么从 25 线性降到 10 而不是直接换 10：层 28 普通怪 2 103 血，若镇守直接
 * ×10 = 21 030，比层 27 的 48 675 弱 57% —— 玩家一进无尽层会觉得镇守突然变纸。
 * 降到 10 而不是留在 25：镇守从"每层一只"改成"每 5 层一只"，出现密度×5，
 * 血系数若还 ×25，层 36 一只就要 111 秒，每 5 层被强制卡 2 分钟。
 */
export const ENDLESS_BOSS_HP_MUL = 10;

/** 无尽层镇守出现密度：每 N 层一只（层 28 起） */
export const BOSS_EVERY_FLOORS = 5;

/** 深品阶奖励：层 28 起每下潜一层，掉落品阶系数 +0.05（BALANCE §21.4） */
export const DEPTH_RARITY_PER_FLOOR = 0.05;
/** 深品阶奖励封顶（层 36 到 0.45，37+ 不再涨 —— 这也是"玩家停在 36"的数值依据） */
export const DEPTH_RARITY_CAP = 0.45;`,
  'endless-constants',
);

repl('src/data/monsters.ts',
  `  return {
    hp: Math.pow(FLOOR_HP_MUL, f - 1),
    damage,
  };
}`,
  `  // 层 1~27 主线：一位不差地保持 1.1534^(f-1)（改这里会让全部 27 层基线作废）
  const hp =
    f <= MAX_FLOOR
      ? Math.pow(FLOOR_HP_MUL, f - 1)
      : Math.pow(FLOOR_HP_MUL, MAX_FLOOR - 1) * Math.pow(ENDLESS_HP_GROWTH, f - MAX_FLOOR);
  return { hp, damage };
}

/**
 * 第 floor 层的镇守血量系数（D36-A / E1）。
 *
 * 层 ≤27 恒为 BOSS_HP_MUL（25）；层 28 起每层 ×0.8 线性降幂，
 * 到 ENDLESS_BOSS_HP_MUL（10）为止：
 *   层 28 = 20（比层 27 低 14%，连续不跳崖）、29 = 16、30 = 12.8、31 = 10.24、
 *   层 32 起钉 10。配合 BOSS_EVERY_FLOORS=5，层 36 镇守 3 889×10 = 38 890 → 44s。
 */
export function bossHpMul(floor: number): number {
  if (!Number.isFinite(floor) || floor <= MAX_FLOOR) return BOSS_HP_MUL;
  return Math.max(ENDLESS_BOSS_HP_MUL, BOSS_HP_MUL * Math.pow(0.8, floor - MAX_FLOOR));
}

/** 该层打完普通波之后会不会出镇守（层 1~27 每层都有；层 28+ 每 5 层一只） */
export function hasBossFloor(floor: number): boolean {
  if (!Number.isFinite(floor) || floor <= MAX_FLOOR) return true;
  return Math.floor(floor) % BOSS_EVERY_FLOORS === 0;
}

/**
 * 深品阶奖励（0~0.45）：层 28 起每层 +0.05，层 36 封顶。
 *
 * 为什么需要它：无尽层如果只有"怪更硬"，30 分钟后就没人刷了。
 * 为什么封顶在 36：这是给玩家一个**明确的停手点** —— 36 之后掉落品阶不再变好，
 * 只剩渊痕（另一种可见物）。数值上 37+ 与 36 等价，所以 UI 必须换显示口径。
 */
export function depthRarityBonus(floor: number): number {
  if (!Number.isFinite(floor) || floor <= MAX_FLOOR) return 0;
  const raw = (Math.floor(floor) - MAX_FLOOR) * DEPTH_RARITY_PER_FLOOR;
  return Math.min(DEPTH_RARITY_CAP, Math.max(0, raw));
}`,
  'scale+boss+depth',
);
flush('src/data/monsters.ts');

// ── battle.ts：镇守血量用 bossHpMul(floor) ─────────────
load('src/core/battle.ts');
const b = files['src/core/battle.ts'];
const anchor = b.cur.match(/import \{[^}]*BOSS_HP_MUL[^}]*\} from '\.\.\/data\/monsters';/);
if (!anchor) throw new Error('找不到 battle.ts 里 monsters 的 import');
console.log('battle import:', anchor[0].replace(/\s+/g, ' '));
repl('src/core/battle.ts',
  anchor[0],
  anchor[0].replace('BOSS_HP_MUL', 'BOSS_HP_MUL').replace(/\{/, '{ bossHpMul,'),
  'battle-import',
);
repl('src/core/battle.ts',
  `  const maxHp = Math.max(1, Math.round(BASE_MONSTER_HP * def.hpMul * s.hp));`,
  `  // 镇守血量 = 同层普通怪 × bossHpMul(floor)。层 ≤27 恒 25，层 28+ 线性降到 10
  // （D36-A：无尽层镇守密度从每层一只变每 5 层一只，血系数必须跟着降，否则每层卡 2 分钟）
  const bossMul = def.boss ? bossHpMul(floor) : 1;
  const maxHp = Math.max(1, Math.round(BASE_MONSTER_HP * def.hpMul * s.hp * bossMul));`,
  'spawn-boss-hp',
);
flush('src/core/battle.ts');

// ── session.ts：镇守波按层判断 + 下潜条件 ──────────────
load('src/core/session.ts');
repl('src/core/session.ts',
  `  const isBossWave = s.wave % BOSS_EVERY === 0;`,
  `  // 镇守波：一层 10 波、第 10 波是镇守；但层 28+（无尽层）只在能被 5 整除的层出
  const isBossWave = s.wave % BOSS_EVERY === 0 && hasBossFloor(floor);`,
  'boss-wave',
);
repl('src/core/session.ts',
  `      if (s.wave % BOSS_EVERY === 0 && s.floor < MAX_FLOOR) {`,
  `      if (s.wave % BOSS_EVERY === 0 && hasBossFloor(s.floor) && s.floor < MAX_FLOOR) {`,
  'descend',
);
flush('src/core/session.ts');
console.log('done A');
