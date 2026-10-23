import { describe, expect, it } from 'vitest';

import {
  BOSS_THREAT_EXTRA,
  DEEP_THREAT_ENABLED,
  DEEP_THREAT_FROM_FLOOR,
  DEEP_THREAT_MUL,
  DEEP_THREAT_SLOPE,
  MAX_FLOOR,
  scaleOfFloor,
  threatMul,
} from '../src/data/monsters';

/**
 * D109 / D111 / D114 分段威胁。
 *
 * 语义（三轮定稿）：
 *   - 层 1~21 恒 ×1（教学期，新手不该被打死）；
 *   - 层 22 起走斜坡 `min(5, 1 + 0.20 × (floor − 22))`，层 42 之后恒 ×5；
 *   - 镇守在这个基础上再 ×1.5。
 *
 * 为什么是「斜坡 + 逃生阀」而不是「一刀切 ×5」：×5 一刀切实测出过死亡循环
 * （种子 2026 死 160 次）。斜坡解决「多难」，逃生阀（D113）解决「卡死」，
 * 两者不能互相替代 —— 只做斜坡，那个种子会换个层号继续死。
 */
describe('分段威胁（D109/D111/D114）', () => {
  it('层 21 及以前一位不变（教学期不抬）', () => {
    for (const floor of [1, 5, 10, 18, 21]) {
      expect(threatMul(floor, false)).toBe(1);
      expect(threatMul(floor, true)).toBe(1);
    }
  });

  it('斜坡起点层 22 = ×1（不是 ×5）：一刀切会把「偶尔死」变成「死循环」', () => {
    expect(DEEP_THREAT_FROM_FLOOR).toBe(22);
    expect(DEEP_THREAT_SLOPE).toBeCloseTo(0.2, 10);
    expect(threatMul(DEEP_THREAT_FROM_FLOOR, false)).toBe(1);
  });

  it('斜坡按斜率线性上升，镇守额外乘 BOSS_THREAT_EXTRA', () => {
    // 斜坡是**常量驱动**的：这里只验公式，不写死某个层号的具体倍率，
    // 否则调一次斜率就要改一遍测试（而测试的意义在于「形状对不对」）。
    const ramp = (f: number) => Math.min(DEEP_THREAT_MUL, 1 + DEEP_THREAT_SLOPE * (f - DEEP_THREAT_FROM_FLOOR));
    expect(threatMul(27, false)).toBeCloseTo(ramp(27), 10);
    expect(threatMul(27, true)).toBeCloseTo(ramp(27) * BOSS_THREAT_EXTRA, 10);
    expect(threatMul(32, false)).toBeCloseTo(ramp(32), 10);
    expect(threatMul(37, false)).toBeCloseTo(ramp(37), 10);
    // 单调不减，且永不超过上限
    let prev = 0;
    for (let f = 22; f <= 76; f += 1) {
      const v = threatMul(f, false);
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(v).toBeLessThanOrEqual(DEEP_THREAT_MUL);
      prev = v;
    }
  });

  it('钳位之后不再涨（段④ 终点压力有上限）', () => {
    // D153：0.2 斜率 + 封顶 3.5 ⇒ 层 22 起爬、层 35 到顶（1 + 0.2×13 = 3.6 > 3.5），之后恒为封顶值。
    expect(threatMul(35, false)).toBeCloseTo(DEEP_THREAT_MUL, 10);
    expect(threatMul(37, false)).toBeCloseTo(DEEP_THREAT_MUL, 10);
    expect(threatMul(42, false)).toBeCloseTo(DEEP_THREAT_MUL, 10);
    expect(threatMul(46, false)).toBeCloseTo(DEEP_THREAT_MUL, 10);
    expect(threatMul(MAX_FLOOR, false)).toBeCloseTo(DEEP_THREAT_MUL, 10);
    expect(threatMul(MAX_FLOOR, true)).toBeCloseTo(DEEP_THREAT_MUL * BOSS_THREAT_EXTRA, 10);
  });

  // D152：封顶 4 → 3.75。**这条断言是故意的死数**：威胁封顶直接决定「首撞层」余量，
  // 是最容易被顺手改动的旋钮（删掉疾行后 c0 首撞从 46 掉到 38 就是它报警的）。
  it('倍率与开关的落定值（×3.5 封顶 / 镇守 ×1.5 / 开；D153）', () => {
    expect(DEEP_THREAT_ENABLED).toBe(true);
    expect(DEEP_THREAT_MUL).toBe(3.5);
    expect(BOSS_THREAT_EXTRA).toBe(1.5);
  });

  it('脏层号安静退回 ×1（不是 NaN 伤害）', () => {
    for (const floor of [Number.NaN, Number.POSITIVE_INFINITY, -1, 0]) {
      expect(threatMul(floor, false)).toBe(1);
    }
  });

  it('封顶抬到 76 之后攻伐仍走软上限（76 层 / 46 层 ≈ 2.43 倍，不是 13.3 倍）', () => {
    expect(MAX_FLOOR).toBe(76);
    const ratio = scaleOfFloor(76).damage / scaleOfFloor(46).damage;
    expect(ratio).toBeGreaterThan(2.3);
    expect(ratio).toBeLessThan(2.6);
  });
});
