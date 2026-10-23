/**
 * D183 镇守血条几何：进度感是功能性需求，不是装饰。
 *
 * 事故背景：新手 5 分钟走查发现层 1 镇守要打 100 多秒（1700 血 ÷ 秒伤 9.4），
 * 屏幕上只有一根 4px 的小血条 —— 这段时间玩家分不清「在打」还是「卡死了」。
 */
import { describe, expect, it } from 'vitest';
import {
  BOSS_BAR_H,
  BOSS_BAR_MIN_W,
  BOSS_NAME_GAP,
  bossBarGeometry,
  bossBarVisible,
  bossPercentText,
} from '../src/render/boss-bar';

describe('镇守血条几何', () => {
  it('条比普通怪宽，且有最小宽度（小怪上也不会窄成看不见）', () => {
    const big = bossBarGeometry(400, 300, 44);
    expect(big.w).toBeGreaterThanOrEqual(BOSS_BAR_MIN_W);
    expect(big.w).toBeCloseTo(44 * 2.4, 6);
    const tiny = bossBarGeometry(400, 300, 5);
    expect(tiny.w).toBe(BOSS_BAR_MIN_W);
  });

  it('条水平居中在怪身上', () => {
    const g = bossBarGeometry(400, 300, 44);
    expect(g.barX + g.w / 2).toBeCloseTo(400, 6);
  });

  it('条在身体上方（不与身体重叠）', () => {
    const r = 44;
    const g = bossBarGeometry(400, 300, r);
    expect(g.barY + g.h).toBeLessThan(300 - r + 1);
  });

  it('百分比贴在条右侧、不与条重叠', () => {
    const g = bossBarGeometry(400, 300, 44);
    expect(g.pctX).toBeGreaterThan(g.barX + g.w);
    expect(g.pctBaseline).toBeGreaterThanOrEqual(g.barY);
  });

  it('名字在条上方且留了间距（不压条）', () => {
    const g = bossBarGeometry(400, 300, 44);
    expect(g.nameY).toBeLessThanOrEqual(g.barY - BOSS_NAME_GAP + 1);
  });

  it('半径脏值不会算出 NaN 或负宽', () => {
    for (const bad of [Number.NaN, -5, 0, Number.POSITIVE_INFINITY]) {
      const g = bossBarGeometry(400, 300, bad);
      expect(Number.isFinite(g.w)).toBe(true);
      expect(g.w).toBeGreaterThan(0);
      expect(Number.isFinite(g.barX)).toBe(true);
    }
  });
});

describe('镇守百分比文字', () => {
  it('正常比例', () => {
    expect(bossPercentText(1700, 1700)).toBe('100%');
    expect(bossPercentText(850, 1700)).toBe('50%');
    expect(bossPercentText(0, 1700)).toBe('0%');
  });

  it('剩一丝血也显示 1%（显示 0% 会被当成已经死了）', () => {
    expect(bossPercentText(1, 1700)).toBe('1%');
    expect(bossPercentText(1, 100000)).toBe('1%');
  });

  it('脏值一律按满血，不画出 250% 或 NaN%', () => {
    expect(bossPercentText(Number.NaN, 100)).toBe('100%');
    expect(bossPercentText(500, 100)).toBe('100%');
    expect(bossPercentText(-50, 100)).toBe('0%');
    expect(bossPercentText(10, 0)).toBe('100%');
    expect(bossPercentText(10, Number.NaN)).toBe('100%');
  });
});

describe('镇守血条可见性', () => {
  it('满血不画（一登场一根满条会抢视觉）', () => {
    expect(bossBarVisible(1700, 1700)).toBe(false);
  });

  it('掉血后画', () => {
    expect(bossBarVisible(1699, 1700)).toBe(true);
    expect(bossBarVisible(0, 1700)).toBe(true);
  });

  it('脏值不画（宁可不显示，也不画出诡异的条）', () => {
    expect(bossBarVisible(Number.NaN, 1700)).toBe(false);
    expect(bossBarVisible(10, 0)).toBe(false);
  });
});
