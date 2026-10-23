// 一次性补丁 A2：battle.ts 镇守血量走 bossHpMul(floor) + session.ts 镇守波/下潜条件
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

load('src/core/battle.ts');
repl('src/core/battle.ts',
  `  BOSS_REGEN_RATIO,
  bossXpMulOfTier,`,
  `  BOSS_REGEN_RATIO,
  bossHpMul,
  bossXpMulOfTier,`,
  'import-bosshpmul',
);
repl('src/core/battle.ts',
  `  const maxHp = Math.max(1, Math.round(BASE_MONSTER_HP * def.hpMul * s.hp));`,
  `  // 镇守血量 = 同层普通怪 × bossHpMul(floor)：层 ≤27 恒 25；
  // 层 28+（D36-A 无尽层）线性降幂到 10 —— 因为镇守密度从"每层一只"变"每 5 层一只"，
  // 血系数不降会让层 36 一只镇守打 111 秒，每 5 层被强制卡近 2 分钟。
  const bossMul = def.boss ? bossHpMul(floor) : 1;
  const maxHp = Math.max(1, Math.round(BASE_MONSTER_HP * def.hpMul * s.hp * bossMul));`,
  'spawn-boss-hp',
);
flush('src/core/battle.ts');

load('src/core/session.ts');
repl('src/core/session.ts',
  `  const isBossWave = s.wave % BOSS_EVERY === 0;`,
  `  // 镇守波：一层 10 波、第 10 波是镇守；但层 28+（无尽层）只在能被 BOSS_EVERY_FLOORS 整除的层出
  const isBossWave = s.wave % BOSS_EVERY === 0 && hasBossFloor(floor);`,
  'boss-wave',
);
repl('src/core/session.ts',
  `      if (s.wave % BOSS_EVERY === 0 && s.floor < MAX_FLOOR) {`,
  `      if (s.wave % BOSS_EVERY === 0 && hasBossFloor(s.floor) && s.floor < MAX_FLOOR) {`,
  'descend',
);
flush('src/core/session.ts');
console.log('done A2');
