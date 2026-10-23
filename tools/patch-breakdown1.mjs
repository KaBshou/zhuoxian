// 一次性补丁：损伤详解面板（GDD 4.7「同时是玩家计算器 + 调试工具 + 教学工具」）
// 数据来自 computeDamage 本来就留下的 steps —— 不新算一遍，只把它存下来给 UI 看。
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

// ── battle.ts：把最后一次伤害的拆解留痕 ──────────────────
load('src/core/battle.ts');
repl('src/core/battle.ts',
  `export type BattleEventKind =`,
  `/** 一次伤害的拆解留痕（给「损伤详解」面板用；不含任何派生计算，只是搬运 computeDamage 的 steps） */
export interface DamageBreakdown {
  /** 打谁 / 用什么打的（如「御剑术 → 坊市怨客」） */
  readonly label: string;
  readonly amount: number;
  readonly isCrit: boolean;
  readonly steps: readonly { label: string; before: number; after: number; note?: string }[];
}

export type BattleEventKind =`,
  'interface',
);
repl('src/core/battle.ts',
  `  readonly deaths: number;`,
  `  readonly deaths: number;
  /** 最近一次伤害的拆解（null = 还没打过）。纯运行时态，不入档 */
  lastBreakdown: DamageBreakdown | null;`,
  'state-field',
);
flush('src/core/battle.ts');
console.log('done phase1');
