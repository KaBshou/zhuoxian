// 一次性补丁：session.test.ts 波次推进测试适配层模型（1 层镇守 → 4 层，27 封顶）。跑完即弃。
import fs from 'node:fs';

const p = 'tests/session.test.ts';
let c = fs.readFileSync(p, 'utf8');

function repl(old, neu, tag) {
  if (!c.includes(old)) {
    console.error('MISS: ' + tag);
    process.exit(1);
  }
  c = c.replace(old, neu);
}

repl(
  `  it('打完第 5 波镇守会进第 2 阶', () => {
    const s = makeSession(4242);
    s.wave = BOSS_EVERY - 1;
    s.floor = 1;
    startWave(s);
    for (const m of s.battle.monsters) m.hp = 0;
    run(s, 2);
    expect(s.floor).toBe(2);
  });`,
  `  it('打完第 5 波镇守会下潜 3 层（1 层 → 4 层，换阶怪表）', () => {
    const s = makeSession(4242);
    s.wave = BOSS_EVERY - 1;
    s.floor = 1;
    startWave(s);
    for (const m of s.battle.monsters) m.hp = 0;
    run(s, 2);
    expect(s.floor).toBe(4);
  });`,
  'boss-advance',
);

repl(
  `  it('第三阶之后不再往上（第一版只有三阶）', () => {
    const s = makeSession(4242);
    s.floor = 3;
    s.wave = BOSS_EVERY - 1;
    startWave(s);
    for (const m of s.battle.monsters) m.hp = 0;
    run(s, 2);
    expect(s.floor).toBe(3);
  });`,
  `  it('27 层封顶（第一版魔渊共 27 层）', () => {
    const s = makeSession(4242);
    s.floor = MAX_FLOOR;
    s.wave = BOSS_EVERY - 1;
    startWave(s);
    for (const m of s.battle.monsters) m.hp = 0;
    run(s, 2);
    expect(s.floor).toBe(MAX_FLOOR);
  });`,
  'floor-cap',
);

// 补 import（只在没引入时加）
if (!c.includes('MAX_FLOOR')) {
  console.error('MISS: MAX_FLOOR import');
  process.exit(1);
}

fs.writeFileSync(p, c, 'utf8');
console.log('OK');
