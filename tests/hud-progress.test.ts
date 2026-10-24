// HUD 修为进度条（D192）—— 纯函数与像素无关的部分。
//
// 为什么这个值得单测：进度条是玩家「每一分钟都在看」的那条线，
// 而它的分母（`xpForStep`）是会随数值标定变的。写死百分比会让测试变成
// 「替策划签字」，所以这里只钉不变量：0 起点、半程 ≈50%、封顶、满级、脏值。
import { describe, expect, it } from 'vitest';
import { realmProgressRatio, realmProgressText } from '../src/render/hud-panels';
import { TOTAL_STEPS, xpForStep } from '../src/core/progression';
import { formatRealm } from '../src/data/glossary';

describe('HUD 修为进度（D192）', () => {
  it('第 0 重、修为 0 → 0%', () => {
    expect(realmProgressRatio(0, 0)).toBe(0);
    expect(realmProgressText(0, 0)).toContain('0%');
  });

  it('半程 ≈ 50%（容差 1 个百分点的取整）', () => {
    const need = xpForStep(0);
    const ratio = realmProgressRatio(0, need / 2);
    expect(Math.abs(ratio - 0.5)).toBeLessThan(0.011);
    expect(realmProgressText(0, need / 2)).toContain('50%');
  });

  it('超过门槛也只到 100%（不会画出条外）', () => {
    const need = xpForStep(3);
    expect(realmProgressRatio(3, need * 5)).toBe(1);
    expect(realmProgressText(3, need * 5)).toContain('100%');
  });

  it('满级显示「圆满」而不是百分比', () => {
    const maxed = TOTAL_STEPS - 1;
    expect(realmProgressRatio(maxed, 0)).toBe(1);
    expect(realmProgressText(maxed, 0)).toContain('圆满');
    expect(realmProgressText(maxed, 0)).not.toContain('%');
  });

  it('脏值不崩：NaN / 负数 / Infinity', () => {
    expect(realmProgressRatio(NaN, 10)).toBe(0);
    expect(realmProgressRatio(0, NaN)).toBe(0);
    expect(realmProgressRatio(0, -100)).toBe(0);
    // Infinity 在「非有限数一律 0」的规则下按 0 处理：宁可显示 0%，
    // 也不要画一条满格的假进度（那会让玩家以为马上突破）
    expect(realmProgressRatio(0, Infinity)).toBe(0);
  });

  it('文案带境界名（和顶栏同一个 formatRealm，不另造一套）', () => {
    expect(realmProgressText(10, 0)).toContain(formatRealm(10));
  });

  it('单调：修为越多进度越大', () => {
    const need = xpForStep(5);
    const a = realmProgressRatio(5, need * 0.2);
    const b = realmProgressRatio(5, need * 0.4);
    const c = realmProgressRatio(5, need * 0.8);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });

  it('跨重：越高重数的门槛越贵，同样修为占比越小（不能拿旧门槛算）', () => {
    const step0 = xpForStep(0);
    // 用同一个绝对修为量，越往后占比必须越小
    const early = realmProgressRatio(0, step0);
    const late = realmProgressRatio(40, step0);
    expect(early).toBeGreaterThan(late);
  });
});
