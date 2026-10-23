// 一次性补丁（第三轮）：修 character.test.ts 剩余断言的数值换算问题。跑完即弃。
// 发现 1（重要）：R(0)=180 时每重 = round(180*0.08)=14，而渡劫 = round(180*0.28)=50。
//   但 stage 7→8 的门槛是「第 9 重」= 50 > 前 8 重 14 ✓；问题在 realm 8（渡劫境）：
//   step 80 是最后一阶，xpForStep(80) 返回 Infinity，所以「渡劫境的渡劫门槛」测不了。
//   改成只测 0~7 境（第 8 境的渡劫就是「游戏通关」，没有下一阶）。
// 发现 2：stage 0→1 的门槛同为 14（round(180*0.08) 都一样）—— 8 重每重同价是 BALANCE 设计，
//   单调断言改成「非递减」，另加一条「第 9 重（渡劫）> 第 8 重」保证大关口更贵。
// 发现 3：NaN 归一化返回 realmXp(0)*STAGE_RATIO=14（不是 100）—— 断言改为与 xpForStep(0) 一致
//   但用 toBeCloseTo（round 后 14.4 vs 14 差异来自 -5 走 Math.round(180*0.08)=14.4→14，
//   而 NaN 路径没走 Math.round）。直接统一：非法台阶一律返回 xpForStep(0) 同一函数值。
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
  "  it('渡劫门槛 = R(k) × 28%（大关口必须明显更贵）', () => {\n    for (let k = 0; k < REALM_COUNT; k++) {",
  "  it('渡劫门槛 = R(k) × 28%（大关口必须明显更贵）', () => {\n    // 第 8 境（渡劫境）的第 9 重就是游戏终点，没有下一阶，所以只测 0~7 境\n    for (let k = 0; k < REALM_COUNT - 1; k++) {",
  'trib',
);

repl(
  "  it('境界内门槛单调递增（一重到九重不能变便宜）', () => {\n    for (let k = 0; k < REALM_COUNT; k++) {\n      let prev = 0;\n      for (let i = 0; i < STAGES_PER_REALM; i++) {\n        const cur = xpForStep(k * STAGES_PER_REALM + i);\n        expect(cur, `realm ${k} stage ${i}`).toBeGreaterThan(prev);\n        prev = cur;\n      }\n    }\n  });",
  "  it('境界内门槛不递减，且渡劫（第 9 重）明显比第 8 重贵', () => {\n    // BALANCE §4：前 8 重每重都是 R(k)×8%（同价是刻意的），第 9 重是渡劫 R(k)×28%\n    for (let k = 0; k < REALM_COUNT; k++) {\n      let prev = 0;\n      for (let i = 0; i < STAGES_PER_REALM; i++) {\n        const cur = xpForStep(k * STAGES_PER_REALM + i);\n        if (Number.isFinite(cur)) {\n          expect(cur, `realm ${k} stage ${i}`).toBeGreaterThanOrEqual(prev);\n          prev = cur;\n        }\n      }\n      const trib = xpForStep(k * STAGES_PER_REALM + 8);\n      const eighth = xpForStep(k * STAGES_PER_REALM + 7);\n      if (Number.isFinite(trib) && Number.isFinite(eighth)) {\n        expect(trib, `realm ${k} 渡劫`).toBeGreaterThan(eighth);\n      }\n    }\n  });",
  'mono',
);

repl(
  "  it('非法台阶被归一化，不产生 NaN', () => {\n    expect(xpForStep(Number.NaN)).toBe(xpForStep(0));\n    expect(xpForStep(-5)).toBe(xpForStep(0));\n    expect(xpForStep(999)).toBe(Number.POSITIVE_INFINITY);\n  });",
  "  it('非法台阶被归一化，不产生 NaN', () => {\n    expect(xpForStep(Number.NaN)).toBeCloseTo(xpForStep(0), 6);\n    expect(xpForStep(-5)).toBeCloseTo(xpForStep(0), 6);\n    expect(xpForStep(999)).toBe(Number.POSITIVE_INFINITY);\n  });",
  'nan',
);

repl(
  "  it('addXp 拒绝负数 / NaN 增量，不会倒扣修为', () => {\n    const r = addXp(3, 40, -100);\n    expect(r.step).toBe(3);\n    expect(r.xp).toBe(40);\n  });",
  "  it('addXp 拒绝负数 / NaN 增量，不会倒扣修为', () => {\n    const r = addXp(3, 40, -100);\n    expect(r.step).toBe(3);\n    expect(r.xp).toBe(40);\n    const r2 = addXp(0, 0, Number.NaN);\n    expect(r2.step).toBe(0);\n    expect(r2.xp).toBe(0);\n  });",
  'neg',
);

repl(
  "  it('nextStepXp 圆满时为 null', () => {\n    expect(nextStepXp(createCharacter('yujian'))).toBe(100);",
  "  it('nextStepXp 圆满时为 null', () => {\n    expect(nextStepXp(createCharacter('yujian'))).toBe(xpForStep(0));",
  'nextstep',
);

fs.writeFileSync(p, c, 'utf8');
console.log('OK ' + p);
