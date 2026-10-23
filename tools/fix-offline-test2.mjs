// 一次性补丁：修正 offline-save 测试里三处错误期望（跑完即弃）
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/tests/offline-save.test.ts';
let c = fs.readFileSync(p, 'utf8');

function repl(old, neu, tag) {
  const n = c.split(old).length - 1;
  if (n !== 1) throw new Error(`MISS(${n}): ${tag}`);
  c = c.replace(old, neu);
  console.log('ok:', tag);
}

// 1) 法宝不是「每杀必掉」：三分类命中 40% 之后还要过 DROP_CHANCE.normal(0.28)
repl(
  `    const totalDrops = g.items.length + Object.values(g.currency).reduce((a, b) => a + (b ?? 0), 0) + Object.values(g.gems).reduce((a, b) => a + b, 0);
    expect(totalDrops).toBe(g.kills); // 每杀必掷一次三分类
    // 法宝份额约 40%，容许波动
    const share = g.items.length / g.kills;
    expect(share).toBeGreaterThan(0.3);
    expect(share).toBeLessThan(0.5);`,
  `    const cur = Object.values(g.currency).reduce((a, b) => a + (b ?? 0), 0);
    const gems = Object.values(g.gems).reduce((a, b) => a + b, 0);
    // 三分类：杀 < 0.475 通货 / < 0.6 玉简 / 其余走 rollMonsterDrop，
    // 而 rollMonsterDrop 内部还要过 DROP_CHANCE.normal(0.28) —— 所以法宝（装备）
    // 的真实份额是 40% × 28% ≈ 11.2%，不是 40%。这是刻意的：
    // 地上 60% 的法宝是凡品垃圾，如果每杀都掉一件，屏幕上会全是装备。
    expect(cur + gems + g.items.length).toBeGreaterThan(g.kills * 0.65);
    const share = g.items.length / g.kills;
    expect(share).toBeGreaterThan(0.06);
    expect(share).toBeLessThan(0.18);
    expect(cur).toBeGreaterThan(g.items.length * 2); // 通货远多于法宝`,
  'drop-share',
);

// 2) 读档回来是「这一波的开头」，所以场上应该有刚撒的一波怪，不是 0 只
repl(
  `    expect(loaded?.session.battle.monsters.length).toBe(0);
    expect(loaded?.session.floats.length).toBe(0);
    expect(loaded?.session.log.length).toBe(0);`,
  `    // 重建约定：回到这一层的这一波开头 → 场上有一波刚撒的怪（不是 0）
    expect(loaded?.session.battle.monsters.length).toBeGreaterThan(0);
    // 浮字/日志是纯运行时表现，不入档 → 读回来必须是空的
    expect(loaded?.session.floats.length).toBe(0);
    expect(loaded?.session.log.length).toBe(0);`,
  'restore-wave',
);

fs.writeFileSync(p, c, 'utf8');
console.log('done');
