// 一次性补丁 C：ENDLESS_HP_GROWTH 1.08→1.10（shuzhi v4.20 重算）
// + D39 通货/玉简吃 lootQuantity（cap 0.58）、法宝吃 lootRarity
// + kills / floorKills / floorMinutes 运行期计数
// + 满级后修为转渊痕（1:1，不产生战力）
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
  if (n !== 1) throw new Error('MISS(' + n + ') ' + rel + ': ' + tag);
  f.cur = f.cur.replace(old, neu);
  console.log('ok:', rel, tag);
}
function flush(rel) {
  const f = files[rel];
  if (f.cur.length < f.orig.length * 0.98) throw new Error('拒绝写盘 ' + rel);
  fs.writeFileSync(f.p, f.cur, 'utf8');
  console.log('flush', rel, f.cur.length, 'B');
}

// ── 1) monsters.ts：血量增长 1.08 → 1.10 ──
load('src/data/monsters.ts');
repl('src/data/monsters.ts',
  `export const ENDLESS_HP_GROWTH = 1.08;`,
  `export const ENDLESS_HP_GROWTH = 1.1;`,
  'growth-1.10',
);
repl('src/data/monsters.ts',
  ` * 层 28+ 会立刻变成死墙：玩家强度天花板实测 ≈877 有效 DPS（层 25~27 中位 548
 * + 天阶仙品 4 条对口 ×1.6 空间），1.1534 到层 33 只剩 7.2 杀/分、层 40 剩 2.7
 * —— 等于做了 13 层没人能玩。1.08 让层 36 还有 8.5 杀/分、层 46 有 4.3。`,
  ` * 层 28+ 会立刻变成死墙（层 41 就掉到 4 杀/分以下）。
 *
 * 1.10 是**按 E1 的新镇守规**（每 5 层一只、血系数 25→10）重算的：
 * 镇守密度降低让「平均每杀血」下降约 35%，所以血增长必须比原来那版 1.08 更陡，
 * 否则硬墙会跑到层 52、把「前沿 36 / 硬墙 46」的 3h 结构撑散。
 * 实测（DPS 天花板 877）：层 36 11.5 杀/分、层 46 4.4 杀/分、首次 <4 在层 48。
 * BALANCE §21.3.1。`,
  'growth-comment',
);
flush('src/data/monsters.ts');

// ── 2) drop.ts：LOOT_QUANTITY_CAP ──
load('src/core/drop.ts');
repl('src/core/drop.ts',
  `/** 掉落物在地上待多久才被自动拾取（秒）。给玩家"我看见它掉了"的时间 */`,
  `/**
 * D39：通货/玉简份额的放大上限（+58%）。
 *
 * 为什么是 58%：通货 47.5% + 玉简 12.5% = 60% 的基础份额，乘 (1+q) 后不能吃掉
 * 法宝那 40%，所以 (0.475+0.125)(1+q) ≤ 0.95 → q ≤ 0.583。取 0.58。
 * 法宝份额永远保底 5%，段②「装备成型 6.9h」不会被任何数量的数量词缀击穿。
 */
export const LOOT_QUANTITY_CAP = 0.58;

/** 掉落物在地上待多久才被自动拾取（秒）。给玩家"我看见它掉了"的时间 */`,
  'quantity-cap',
);
flush('src/core/drop.ts');

// ── 3) character.ts：marks 字段 ──
load('src/core/character.ts');
repl('src/core/character.ts',
  `  turbid: TurbidState;`,
  `  turbid: TurbidState;
  /**
   * 渊痕（满级后的积累物，D36-A）。1:1 由满级后的击杀修为转换而来。
   * **绝不影响面板属性**——见 src/data/marks.ts 的三条铁律。
   */
  marks?: number;`,
  'marks-field',
);
flush('src/core/character.ts');

// ── 4) session.ts：计数 + D39 分流 + 渊痕出口 ──
load('src/core/session.ts');
repl('src/core/session.ts',
  `import { createCharacter, gainXp, type CharacterState } from './character';`,
  `import { characterStats, createCharacter, gainXp, type CharacterState } from './character';`,
  'import-stats',
);
repl('src/core/session.ts',
  `import { MAX_GROUND_DROPS, PICKUP_DELAY, rollMonsterDrop, type GroundDrop } from './drop';`,
  `import {
  LOOT_QUANTITY_CAP,
  MAX_GROUND_DROPS,
  PICKUP_DELAY,
  rollMonsterDrop,
  type GroundDrop,
} from './drop';`,
  'import-drop',
);
repl('src/core/session.ts',
  `  /** 累计掉落件数（UI 显示"出货"用） */
  dropsFound: number;`,
  `  /** 累计掉落件数（UI 显示"出货"用；含法宝+通货+玉简三类） */
  dropsFound: number;
  /**
   * 累计击杀（运行期观察量，不进存档）。
   *
   * 为什么必须有：`battle.kills` 是战斗层的计数，死亡重开/换层都不清零也不区分层；
   * 而「按层真实击杀率」是标定 KILLS_PER_MIN_BY_FLOOR 的唯一实测来源（BALANCE §21.11）。
   * 曾经这里声明了 readonly kills 却没有任何一处赋值 → 工具读到 NaN。
   */
  kills: number;
  /** 本层击杀（换层清零）。`floorKills / floorMinutes` = 该层真实击杀率 */
  floorKills: number;
  /** 本层停留分钟数（换层清零）。运行时态，不进存档 */
  floorMinutes: number;`,
  'session-counters',
);
flush('src/core/session.ts');
console.log('done C-part1');
