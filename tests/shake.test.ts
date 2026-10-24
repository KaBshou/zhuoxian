import { describe, expect, it } from 'vitest';
import {
  SHAKE_DECAY_PER_SEC,
  SHAKE_MAX,
  SHAKE_ON_BOSS_KILL,
  SHAKE_ON_CRIT,
  SHAKE_ON_DEATH,
  SHAKE_ON_HIT,
  SHAKE_ON_KILL,
  addShake,
  decayShake,
} from '../src/core/session';
import { MAX_SHAKE_PX, shakeOffset } from '../src/render/battle-renderer';

/**
 * D199：屏幕震动。
 *
 * 挂机刷宝里战斗是自动的，玩家能感到「打到了」只有三样：浮字、声音、画面。
 * 前两样已有，画面一直静止 —— 打镇守和打空气长得一样。
 *
 * 两个不变量必须钉住：
 * 1. **显示层不消耗 rng**（偏移只由帧序号决定，否则整条掉落序列错位）；
 * 2. **振幅有上限**（挂机看几小时，震过头会难受）。
 */
describe('D199 震动：振幅与衰减', () => {
  it('五种来源的相对轻重符合直觉（暴击 > 普攻，镇守死 > 小怪死，死亡最重）', () => {
    expect(SHAKE_ON_CRIT).toBeGreaterThan(SHAKE_ON_HIT);
    expect(SHAKE_ON_BOSS_KILL).toBeGreaterThan(SHAKE_ON_KILL);
    expect(SHAKE_ON_DEATH).toBeGreaterThan(SHAKE_ON_BOSS_KILL);
    expect(SHAKE_ON_HIT).toBeGreaterThan(0);
  });

  it('addShake 只加不减，且有上限', () => {
    const s = { shake: 0 };
    addShake(s, SHAKE_ON_HIT);
    expect(s.shake).toBeCloseTo(SHAKE_ON_HIT, 6);
    addShake(s, 10);
    expect(s.shake).toBe(SHAKE_MAX);
  });

  it('addShake 对脏值/负数安静忽略（显示态不许把 NaN 传进渲染）', () => {
    const s = { shake: 0.2 };
    addShake(s, Number.NaN);
    addShake(s, -1);
    addShake(s, Number.POSITIVE_INFINITY);
    expect(s.shake).toBeCloseTo(0.2, 6);
  });

  it('decayShake 与帧率无关：同样 0.5 秒，一次 0.5s 与 30 次 1/60s 结果一致', () => {
    const once = decayShake(0.6, 0.5);
    let step = 0.6;
    for (let i = 0; i < 30; i += 1) step = decayShake(step, 1 / 60);
    expect(step).toBeCloseTo(once, 4);
  });

  it('decayShake：0.35 秒后死亡震动基本消失（不会晕）', () => {
    const after = decayShake(SHAKE_ON_DEATH, 0.35);
    expect(after).toBeLessThan(0.04);
    expect(SHAKE_DECAY_PER_SEC).toBe(8);
  });

  it('decayShake 对脏值返回 0（不是 NaN）', () => {
    expect(decayShake(Number.NaN, 0.016)).toBe(0);
    expect(decayShake(-1, 0.016)).toBe(0);
    expect(decayShake(0.5, Number.NaN)).toBeGreaterThanOrEqual(0);
  });
});

describe('D199 震动：渲染偏移', () => {
  it('振幅 0 或脏值时偏移是 0（没震动就不能动画面）', () => {
    expect(shakeOffset(0, 10)).toEqual({ x: 0, y: 0 });
    expect(shakeOffset(Number.NaN, 10)).toEqual({ x: 0, y: 0 });
    expect(shakeOffset(-0.5, 10)).toEqual({ x: 0, y: 0 });
  });

  it('偏移永远不越过 MAX_SHAKE_PX（4px 是「能感到但不晕」的上限）', () => {
    for (let frame = 0; frame < 240; frame += 1) {
      const o = shakeOffset(1, frame);
      expect(Math.abs(o.x)).toBeLessThanOrEqual(MAX_SHAKE_PX + 1e-9);
      expect(Math.abs(o.y)).toBeLessThanOrEqual(MAX_SHAKE_PX + 1e-9);
    }
  });

  it('同振幅同帧 → 同偏移（确定性；显示层不许消耗 rng）', () => {
    const a = shakeOffset(0.4, 77);
    const b = shakeOffset(0.4, 77);
    expect(a).toEqual(b);
  });

  it('相邻帧的偏移会变（否则看起来是整体平移不是震动）', () => {
    const a = shakeOffset(0.5, 30);
    const b = shakeOffset(0.5, 31);
    expect(a.x === b.x && a.y === b.y).toBe(false);
  });

  it('x 与 y 振幅不同（避免画成一条斜线）', () => {
    const o = shakeOffset(1, 13);
    expect(Math.abs(o.y)).toBeLessThan(Math.abs(o.x) + 1e-9);
  });
});
