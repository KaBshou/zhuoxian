// 一次性补丁：修复「到过但没通关的层会被忘掉」——加 maxFloorReached 持久字段
// 测试抓到：把玩家摆到第 3 层（firstClearedFloors=[1,2]），回刷第 1 层后再想回第 3 层，
// 因为第 3 层既不在 firstClearedFloors 也不在当前 floor，被算成「没到过」→ 永久锁死。
import fs from 'node:fs';

const ROOT = 'F:/dsh-work/zhuoxian';
fs.mkdirSync(`${ROOT}/tools/_bak`, { recursive: true });

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
  if (f.cur.length < f.orig.length * 0.98) throw new Error(`拒绝写盘 ${rel}: ${f.cur.length} < ${f.orig.length}`);
  fs.writeFileSync(f.p, f.cur, 'utf8');
  console.log('flush', rel, f.cur.length, 'B');
}

// ── 1. session.ts ──────────────────────────────────────────
load('src/core/session.ts');
repl('src/core/session.ts',
  `  /** 已首通（清完 10 波 + 镇守）的层 */
  firstClearedFloors: number[];`,
  `  /** 已首通（清完 10 波 + 镇守）的层 */
  firstClearedFloors: number[];
  /**
   * 到过的最高层（含没通关的）。
   * 单靠 floor + firstClearedFloors 推不出来：玩家从第 3 层回刷第 1 层时，
   * 第 3 层既不是当前层也没通关，会被算成「没到过」→ 回刷一次就永久锁死。
   * 这是运行到过的事实，必须单独记。
   */
  maxFloorReached: number;`,
  'field',
);
repl('src/core/session.ts',
  `export function highestFloorReached(s: GameSession): number {
  let hi = s.floor;
  for (const f of s.firstClearedFloors) if (f > hi) hi = f;
  return Math.min(MAX_FLOOR, Math.max(1, hi));
}`,
  `export function highestFloorReached(s: GameSession): number {
  let hi = Math.max(s.floor, s.maxFloorReached ?? 1);
  for (const f of s.firstClearedFloors) if (f > hi) hi = f;
  return Math.min(MAX_FLOOR, Math.max(1, hi));
}`,
  'highest',
);
repl('src/core/session.ts',
  `  const from = s.floor;
  s.floor = target;`,
  `  const from = s.floor;
  s.floor = target;
  s.maxFloorReached = Math.max(s.maxFloorReached, target);`,
  'setfloor-track',
);
flush('src/core/session.ts');

// ── 2. save.ts ────────────────────────────────────────────
load('src/core/save.ts');
repl('src/core/save.ts',
  `export interface ProgressSave {
  readonly floor: number;
  /** 当前层的第几波（回来从头打这一波，不清零进度感） */
  readonly wave: number;
  readonly firstClearedFloors: readonly number[];
}`,
  `export interface ProgressSave {
  readonly floor: number;
  /** 当前层的第几波（回来从头打这一波，不清零进度感） */
  readonly wave: number;
  readonly firstClearedFloors: readonly number[];
  /**
   * 到过的最高层（含没通关的）。**必须入档**：
   * 不入档的话重开页面后「回刷到低层」会把深层进度永久丢失（选层上限会掉回去）。
   */
  readonly maxFloorReached?: number;
}`,
  'progress-field',
);
repl('src/core/save.ts',
  `  firstClearedFloors: readonly number[];
  pocket: Record<CurrencyId, number>;`,
  `  firstClearedFloors: readonly number[];
  maxFloorReached?: number;
  pocket: Record<CurrencyId, number>;`,
  'serialize-input',
);
repl('src/core/save.ts',
  `      firstClearedFloors: [...input.firstClearedFloors],
    },`,
  `      firstClearedFloors: [...input.firstClearedFloors],
      maxFloorReached: Math.max(1, Math.floor(input.maxFloorReached ?? input.floor)),
    },`,
  'serialize-out',
);
repl('src/core/save.ts',
  `        firstClearedFloors: (pr.firstClearedFloors as unknown[]).filter((f): f is number => typeof f === 'number'),
      },`,
  `        firstClearedFloors: (pr.firstClearedFloors as unknown[]).filter((f): f is number => typeof f === 'number'),
        maxFloorReached: typeof pr.maxFloorReached === 'number' ? Math.max(1, Math.floor(pr.maxFloorReached)) : Math.max(1, Math.floor(pr.floor)),
      },`,
  'deserialize',
);
flush('src/core/save.ts');

// ── 3. save-bridge.ts ────────────────────────────────────
load('src/core/save-bridge.ts');
repl('src/core/save-bridge.ts',
  `    firstClearedFloors: s.firstClearedFloors,`,
  `    firstClearedFloors: s.firstClearedFloors,
    maxFloorReached: s.maxFloorReached,`,
  'to-save',
);
flush('src/core/save-bridge.ts');

console.log('done');
