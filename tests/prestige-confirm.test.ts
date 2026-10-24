import { describe, expect, it } from 'vitest';
import { PRESTIGE_CONFIRM_MS, prestigeConfirmArmed } from '../src/core/session';

/**
 * D193：轮回是唯一不可撤销的玩家操作，必须二次确认。
 * 这里钉的是「判定」而不是「按键」——按键在 main.ts，真机由 probe-cycle 覆盖。
 */
describe('prestigeConfirmArmed（二次确认窗口）', () => {
  it('窗口长度是 6 秒（够手滑一次反应过来，又不至于变成新负担）', () => {
    expect(PRESTIGE_CONFIRM_MS).toBe(6000);
  });

  it('没武装过（0）一律 false', () => {
    expect(prestigeConfirmArmed({ armedAt: 0, nowMs: 1000 })).toBe(false);
  });

  it('刚武装立刻再按 = 真执行', () => {
    expect(prestigeConfirmArmed({ armedAt: 1000, nowMs: 1000 })).toBe(true);
  });

  it('窗口内再按 = 真执行', () => {
    expect(prestigeConfirmArmed({ armedAt: 1000, nowMs: 6999 })).toBe(true);
  });

  it('刚好到窗口边界仍算（<=，不是 <）', () => {
    expect(prestigeConfirmArmed({ armedAt: 1000, nowMs: 7000 })).toBe(true);
  });

  it('超过窗口 = 过期，需要重新武装', () => {
    expect(prestigeConfirmArmed({ armedAt: 1000, nowMs: 7001 })).toBe(false);
  });

  it('时钟倒退（now < armedAt）= 视为过期，宁可不执行也不误删进度', () => {
    expect(prestigeConfirmArmed({ armedAt: 5000, nowMs: 1000 })).toBe(false);
  });

  it('脏值（NaN / Infinity）不执行', () => {
    expect(prestigeConfirmArmed({ armedAt: Number.NaN, nowMs: 1000 })).toBe(false);
    expect(prestigeConfirmArmed({ armedAt: 1000, nowMs: Number.NaN })).toBe(false);
    expect(prestigeConfirmArmed({ armedAt: Number.POSITIVE_INFINITY, nowMs: 1000 })).toBe(false);
  });

  it('负数武装时间视为未武装', () => {
    expect(prestigeConfirmArmed({ armedAt: -1, nowMs: 1000 })).toBe(false);
  });

  it('自定义窗口按参数走（换入口时不用改常量）', () => {
    expect(prestigeConfirmArmed({ armedAt: 1000, nowMs: 1500, windowMs: 400 })).toBe(false);
    expect(prestigeConfirmArmed({ armedAt: 1000, nowMs: 1400, windowMs: 400 })).toBe(true);
  });

  it('窗口非法（NaN）时回退到默认 6 秒', () => {
    expect(prestigeConfirmArmed({ armedAt: 1000, nowMs: 6000, windowMs: Number.NaN })).toBe(true);
    expect(prestigeConfirmArmed({ armedAt: 1000, nowMs: 8000, windowMs: Number.NaN })).toBe(false);
  });
});
