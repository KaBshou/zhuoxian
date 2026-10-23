// 一次性补丁：character.test.ts 的境界曲线断言迁移到 BALANCE §4 模型（R(k)=180×1.56^k，每重 8%、渡劫 28%）。
// 注意：新模型里「门槛单调」只在境界内部成立；跨境界时 R(k+1)×8% 可能小于 R(k)×28%
// （练气渡劫 50 > 筑基一重 41），这是 BALANCE 刻意的设计（渡劫是大关口），
// 单调性断言改为「境界内单调 + 本境每重 < 本境渡劫」两条不变量。跑完即弃。
import fs from 'node:fs';

const p = 'tests/character.test.ts';
let c = fs.readFileSync(p, 'utf8');

function repl(old, neu, tag) {
  if (!c.includes(old)) {
    console.error('MISS: ' + tag);
    process.exit(1);
  }
  c = c.split(old).join(neu);
}

repl(
  "  it('第一重门槛就是基准值', () => {\n    expect(xpForStep(0)).toBe(100);\n  });",
  "  it('第一重门槛 = R(0) × 8%（BALANCE §4）', () => {\n    expect(xpForStep(0)).toBe(Math.round(180 * 0.08));\n  });\n\n  it('渡劫门槛 = R(k) × 28%（大关口必须明显更贵）', () => {\n    for (let k = 0; k < REALM_COUNT; k++) {\n      const r = Math.round(180 * Math.pow(1.56, k));\n      expect(xpForStep(k * STAGES_PER_REALM + 8), `realm ${k}`).toBe(\n        Math.round(r * 0.28),\n      );\n    }\n  });",
  'base',
);

repl(
  `  it('门槛单调递增（不能出现后一重比前一重便宜）', () => {
    let prev = 0;
    for (let s = 0; s < TOTAL_STEPS - 1; s++) {
      const cur = xpForStep(s);
      expect(cur, \`step \${s}\`).toBeGreaterThan(prev);
      prev = cur;
    }
  });`,
  `  it('境界内门槛单调递增（一重到九重不能变便宜）', () => {
    for (let k = 0; k < REALM_COUNT; k++) {
      let prev = 0;
      for (let i = 0; i < STAGES_PER_REALM; i++) {
        const cur = xpForStep(k * STAGES_PER_REALM + i);
        expect(cur, \`realm \${k} stage \${i}\`).toBeGreaterThan(prev);
        prev = cur;
      }
    }
  });

  it('境界整体变贵：下一境的每重 ≥ 上一境的每重（大境界不能白跨）', () => {
    for (let k = 0; k < REALM_COUNT - 1; k++) {
      const curFirst = xpForStep(k * STAGES_PER_REALM);
      const nextFirst = xpForStep((k + 1) * STAGES_PER_REALM);
      expect(nextFirst, \`realm \${k}\`).toBeGreaterThan(curFirst);
    }
  });`,
  'mono',
);

repl(
  `  it('非法台阶被归一化，不产生 NaN', () => {
    expect(xpForStep(Number.NaN)).toBe(100);
    expect(xpForStep(-5)).toBe(100);
    expect(xpForStep(999)).toBe(Number.POSITIVE_INFINITY);
  });`,
  `  it('非法台阶被归一化，不产生 NaN', () => {
    expect(xpForStep(Number.NaN)).toBe(xpForStep(0));
    expect(xpForStep(-5)).toBe(xpForStep(0));
    expect(xpForStep(999)).toBe(Number.POSITIVE_INFINITY);
  });`,
  'nan',
);

repl(
  `  it('addXp 不够突破时只加不破', () => {
    const r = addXp(0, 0, 50);
    expect(r.step).toBe(0);
    expect(r.xp).toBe(50);
    expect(r.breakthroughs).toBe(0);
  });

  it('addXp 刚好够时突破一重', () => {
    const r = addXp(0, 0, 100);
    expect(r.step).toBe(1);
    expect(r.xp).toBe(0);
    expect(r.breakthroughs).toBe(1);
  });`,
  `  it('addXp 不够突破时只加不破', () => {
    const r = addXp(0, 0, 10);
    expect(r.step).toBe(0);
    expect(r.xp).toBe(10);
    expect(r.breakthroughs).toBe(0);
  });

  it('addXp 刚好够时突破一重', () => {
    const need = xpForStep(0);
    const r = addXp(0, 0, need);
    expect(r.step).toBe(1);
    expect(r.xp).toBe(0);
    expect(r.breakthroughs).toBe(1);
  });`,
  'addxp',
);

repl(
  `  it('addXp 拒绝负数 / NaN 增量，不会倒扣修为', () => {
    const r = addXp(3, 40, -100);
    expect(r.step).toBe(3);
    expect(r.xp).toBe(40);
  });`,
  `  it('addXp 拒绝负数 / NaN 增量，不会倒扣修为', () => {
    const r = addXp(3, 40, -100);
    expect(r.step).toBe(3);
    expect(r.xp).toBe(40);
  });

  it('81 台阶合计 ≈ 25 638 修为 = 336 分钟（BALANCE 表 C 的量级）', () => {
    // 修为/小时 = 768 × 层，玩家按层分布 [14,20,26,33,40,45,50,53,55] 分钟
    // 反算总修为约 2.5 万量级；偏差超过 ±30% 说明曲线写错了
    const total = totalXpToStep(TOTAL_STEPS - 1);
    expect(total).toBeGreaterThan(1.8e4);
    expect(total).toBeLessThan(3.4e4);
  });`,
  'total',
);

repl(
  `  it('走完 81 台阶的总修为在可标定的量级内（1e6 ~ 1e9）', () => {
    const total = totalXpToStep(TOTAL_STEPS - 1);
    expect(total).toBeGreaterThan(1e6);
    expect(total).toBeLessThan(1e9);
  });`,
  `  it('进度 0~1（换算新门槛）', () => {
    expect(stepProgress(0, 0)).toBe(0);
    expect(stepProgress(0, Math.round(180 * 0.08 * 0.5))).toBeCloseTo(0.5, 6);
    expect(stepProgress(0, 999)).toBe(1);
    expect(stepProgress(TOTAL_STEPS - 1, 0)).toBe(1);
  });`,
  'progress',
);

repl(
  `  it('进度 0~1，圆满为 1', () => {
    expect(stepProgress(0, 0)).toBe(0);
    expect(stepProgress(0, 50)).toBeCloseTo(0.5, 6);
    expect(stepProgress(0, 999)).toBe(1);
    expect(stepProgress(TOTAL_STEPS - 1, 0)).toBe(1);
  });
});`,
  'progress2',
);

fs.writeFileSync(p, c, 'utf8');
console.log('OK ' + p);
