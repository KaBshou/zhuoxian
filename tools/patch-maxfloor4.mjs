// 一次性补丁 v4：setFloor 改为「越界直接拒绝」（不静默夹取），测试补 maxFloorReached
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
  `  if (!Number.isFinite(floor)) return false;
  const target = Math.max(1, Math.min(floorSelectableMax(s), Math.round(floor)));
  if (target === s.floor) return false;`,
  `  if (!Number.isFinite(floor)) return false;
  const target = Math.round(floor);
  // 越界直接拒绝，不静默夹取 —— 「我点了第 30 层，结果悄悄跳到第 27 层」是玩家最讨厌的行为
  if (target < 1 || target > floorSelectableMax(s)) return false;
  if (target === s.floor) return false;`,
  'strict-range',
);
flush('src/core/session.ts');

load('tests/select-floor.test.ts');
repl('tests/select-floor.test.ts',
  `    s.floor = 3;
    s.wave = 7;
    s.firstClearedFloors.push(1, 2);`,
  `    s.floor = 3;
    s.wave = 7;
    s.maxFloorReached = 3;
    s.firstClearedFloors.push(1, 2);`,
  't2',
);
repl('tests/select-floor.test.ts',
  `    s.floor = 6;
    s.firstClearedFloors.push(1, 2, 3, 4, 5);`,
  `    s.floor = 6;
    s.maxFloorReached = 6;
    s.firstClearedFloors.push(1, 2, 3, 4, 5);`,
  't3',
);
repl('tests/select-floor.test.ts',
  `    s.floor = 3;
    s.firstClearedFloors.push(1, 2);
    tickSession(s, 1 / 30); // 让本层有怪`,
  `    s.floor = 3;
    s.maxFloorReached = 3;
    s.firstClearedFloors.push(1, 2);
    tickSession(s, 1 / 30); // 让本层有怪`,
  't4',
);
repl('tests/select-floor.test.ts',
  `    s.floor = 3;
    s.firstClearedFloors.push(1, 2);
    gainXp(s.character, 0.01);`,
  `    s.floor = 3;
    s.maxFloorReached = 3;
    s.firstClearedFloors.push(1, 2);
    gainXp(s.character, 0.01);`,
  't5',
);
repl('tests/select-floor.test.ts',
  `    s.floor = 2;
    s.firstClearedFloors.push(1);`,
  `    s.floor = 2;
    s.maxFloorReached = 2;
    s.firstClearedFloors.push(1);`,
  't6',
);
flush('tests/select-floor.test.ts');
console.log('done');
