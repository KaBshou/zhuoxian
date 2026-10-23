// 一次性补丁 B：D39（通货/玉简吃 lootQuantity，稀有度吃 lootRarity×0.5 + 深品阶）+ kills 计数 + 渊痕出口
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

// ── 1) data/marks.ts（渊痕：满级后的唯一出口，纯长线内容，不产生战力）──
const marksPath = `${ROOT}/src/data/marks.ts`;
fs.writeFileSync(marksPath, `/**
 * 渊痕 —— 满级之后唯一的永久积累物（BALANCE §21.10，D36-A E1）。
 *
 * 三条铁律（写死在这里，改之前先读）：
 * 1. **渊痕不产生战力。** 任何「渊痕换伤害/气血」的口子会同时废掉 §16 的 EHP 判定
 *    和 §20.14 的 BREAKTHROUGH_XP 数组 —— 那两张表都是在"战力只来自装备+境界"
 *    的前提下标定的。
 * 2. **价格锚在时间上，不锚在层数上。** 价格 = 渊痕/分 × 期望分钟数。
 *    层 36→46 的修为/分从 6 212 掉到 4 016，但价格不改 —— 否则"越深越买不起"。
 * 3. **只有三档，不许加战斗属性档。** validateMarks() 会在测试里守住这条。
 */

/** 渊痕的产出速率（渊痕/分）：BALANCE §20.11 实测 4 396~4 405，取 4 400 */
export const MARKS_PER_MINUTE = 4_400;

/** 三个可买项（价格 = 渊痕/分 × 期望分钟数，推导见 BALANCE §21.10） */
export type MarkSink = 'setStartFloor' | 'rerollCurrency' | 'divineReforge';

export const MARKS_COST: Readonly<Record<MarkSink, number>> = {
  /** 设下一次闭关的起点层：45.5 分钟的量（选层是决策，不是默认便利） */
  setStartFloor: 200_000,
  /** 换一块洗灵石：22.7 分钟（= 一件装备重洗一次的心理账户） */
  rerollCurrency: 100_000,
  /** 定向重铸一条天阶词条：227 分钟（一个收集里程碑） */
  divineReforge: 1_000_000,
};

export const MARK_SINK_NAME: Readonly<Record<MarkSink, string>> = {
  setStartFloor: '定渊（设下次闭关起点层）',
  rerollCurrency: '聚灵（换一块洗灵石）',
  divineReforge: '夺造化（定向重铸天阶灵纹）',
};

/** 校验：只允许三档、价格为正整数。测试用，返回错误列表 */
export function validateMarks(): string[] {
  const errs: string[] = [];
  const keys = Object.keys(MARKS_COST);
  if (keys.length !== 3) errs.push(`MARKS_COST 必须恰好 3 档，实际 ${keys.length}`);
  for (const [k, v] of Object.entries(MARKS_COST)) {
    if (!Number.isFinite(v) || v <= 0 || Math.floor(v) !== v) errs.push(`价格非法：${k}=${v}`);
  }
  if (MARKS_PER_MINUTE <= 0) errs.push('MARKS_PER_MINUTE 必须为正');
  return errs;
}

/** 当前渊痕够买哪几档（UI 用） */
export function affordableSinks(marks: number): MarkSink[] {
  return (Object.keys(MARKS_COST) as MarkSink[]).filter((k) => marks >= MARKS_COST[k]);
}
`, 'utf8');
console.log('new src/data/marks.ts');

// ── 2) drop.ts：LootParams 加 lootRarity，rollMonsterDrop 内部折进 rarityBonus ──
load('src/core/drop.ts');
repl('src/core/drop.ts',
  `export interface LootParams {`,
  `export interface LootParams {
  /**
   * 玩家「仙缘」（lootRarity）加成，D39：以 **0.5 倍** 折进 rarityBonus。
   * 为什么在这里折而不是在 session 里乘：离线结算（offline.ts）也走 rollMonsterDrop，
   * 折在调用方会让「在线吃词缀、离线不吃」，是最难查的一类不一致。
   */
  readonly lootRarity?: number;`,
  'lootparams',
);
flush('src/core/drop.ts');
console.log('done B-1');
