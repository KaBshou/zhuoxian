// 一次性补丁（一次写全所有落点）：损伤详解面板数据
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

// ── 1. battle.ts ─────────────────────────────────────────
load('src/core/battle.ts');
repl('src/core/battle.ts',
  `export type BattleEventKind =`,
  `/**
 * 一次伤害的拆解留痕（「损伤详解」面板的数据源）。
 *
 * 它不是新算的东西：computeDamage 每一步本身就留了 steps，
 * 这里只负责"最近一次打出去的那一下"存下来给 UI 读。
 */
export interface DamageBreakdown {
  /** 用什么打的、打的谁（如「御剑术 → 坊市怨客」） */
  readonly label: string;
  readonly amount: number;
  readonly isCrit: boolean;
  readonly steps: readonly { label: string; before: number; after: number; note?: string }[];
}

export type BattleEventKind =`,
  'interface',
);
repl('src/core/battle.ts',
  `  /** 每神通的真元代价倍率（预计算，扣费与够不够判定都读这张表；别在施放处现算） */
  readonly gemCostMulBySkill: Readonly<Record<string, number>>;
}`,
  `  /** 每神通的真元代价倍率（预计算，扣费与够不够判定都读这张表；别在施放处现算） */
  readonly gemCostMulBySkill: Readonly<Record<string, number>>;
  /** 最近一次打出去的伤害拆解（null = 还没打过）。纯运行时态，不入档 */
  lastBreakdown: DamageBreakdown | null;
}`,
  'state-field',
);
repl('src/core/battle.ts',
  `  target.hp -= res.amount;
  state.events.push({
    kind: res.isCrit ? 'player-crit' : 'player-hit',`,
  `  target.hp -= res.amount;
  state.lastBreakdown = {
    label: \`普攻 → \${target.name}\`,
    amount: res.amount,
    isCrit: res.isCrit,
    steps: res.steps,
  };
  state.events.push({
    kind: res.isCrit ? 'player-crit' : 'player-hit',`,
  'strike-record',
);
flush('src/core/battle.ts');
console.log('phase battle done');
