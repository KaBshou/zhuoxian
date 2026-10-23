// 一次性补丁 v3：maxFloorReached 初始化 + 下潜时更新 + 测试改用 gainXp
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

load('src/core/session.ts');
repl('src/core/session.ts',
  `    firstClearedFloors: [],
    craftTimer: 0,`,
  `    firstClearedFloors: [],
    maxFloorReached: 1,
    craftTimer: 0,`,
  'init',
);
repl('src/core/session.ts',
  `        const cleared = s.floor;
        s.floor = Math.min(MAX_FLOOR, s.floor + 1);`,
  `        const cleared = s.floor;
        s.floor = Math.min(MAX_FLOOR, s.floor + 1);
        s.maxFloorReached = Math.max(s.maxFloorReached, s.floor);`,
  'descend-track',
);
flush('src/core/session.ts');

load('tests/select-floor.test.ts');
repl('tests/select-floor.test.ts',
  `    s.character.xp = 777;
    s.battle.turbid.value = 42;`,
  `    gainXp(s.character, 0.01); // 用真实入口加一点点修为（character.xp 是只读的）
    const xpAfter = s.character.xp;
    s.battle.turbid.value = 42;`,
  'test-setup',
);
repl('tests/select-floor.test.ts',
  `    const before = {
      xp: s.character.xp,`,
  `    const before = {
      xp: xpAfter,`,
  'test-before',
);
repl('tests/select-floor.test.ts',
  `import { AFFIXES } from '../src/data/affixes';`,
  `import { gainXp } from '../src/core/character';
import { AFFIXES } from '../src/data/affixes';`,
  'test-import',
);
flush('tests/select-floor.test.ts');
console.log('done');
