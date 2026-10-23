// 一次性补丁 v2：maxFloorReached 持久化（修正锚点：interface 里 firstClearedFloors 的注释是「已首通楼层」）
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

// ── 1. session.ts：加字段 ──────────────────────────────────
load('src/core/session.ts');
repl('src/core/session.ts',
  `  /** 已首通楼层（每层首通 +2 天赋点的账本；含当前层则不再发首通点） */
  firstClearedFloors: number[];`,
  `  /** 已首通楼层（每层首通 +2 天赋点的账本；含当前层则不再发首通点） */
  firstClearedFloors: number[];
  /**
   * 到过的最高层（含没通关的）。
   * 单靠 floor + firstClearedFloors 推不出来：玩家从第 3 层回刷第 1 层时，
   * 第 3 层既不是当前层也没通关，会被算成「没到过」→ 回刷一次就永久锁死。
   * 这是运行到过的事实，必须单独记、必须入档。
   */
  maxFloorReached: number;`,
  'field',
);
repl('src/core/session.ts',
  `  let hi = s.floor;
  for (const f of s.firstClearedFloors) if (f > hi) hi = f;`,
  `  let hi = Math.max(s.floor, s.maxFloorReached ?? 1);
  for (const f of s.firstClearedFloors) if (f > hi) hi = f;`,
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
  `  readonly firstClearedFloors: readonly number[];
}`,
  `  readonly firstClearedFloors: readonly number[];
  /**
   * 到过的最高层（含没通关的）。**必须入档**：
   * 不入档的话重开页面后回刷到低层，深层进度会永久丢失（选层上限掉回去）。
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
        maxFloorReached:
          typeof pr.maxFloorReached === 'number'
            ? Math.max(1, Math.floor(pr.maxFloorReached))
            : Math.max(1, Math.floor(pr.floor)),
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
