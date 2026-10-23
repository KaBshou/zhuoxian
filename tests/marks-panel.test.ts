// 渊痕价目表面板（M）—— 纯函数契约。
//
// 为什么值得测：这个面板的全部价值在「玩家能自己算出还差多久」。
// 如果 `minutesUntil` 和 `MARKS_PER_MINUTE` 脱钩（比如拿旧速率 10 843 反推），
// 面板会诚实地说出一个错误的等待时间，而这种错**不报错、不自相矛盾**，
// 只有真去算一遍才发现（D81 就没锚过一次）。
import { describe, expect, it } from 'vitest';
import {
  MARKS_PANEL_W,
  formatMarks,
  marksPanelHeight,
  minutesUntil,
  sinkStatusText,
} from '../src/render/marks-panel';
import { MARKS_COST, MARKS_PER_MINUTE, MARK_SINK_NAME, affordableSinks, validateMarks } from '../src/data/marks';

describe('渊痕：数据表本身合法', () => {
  it('validateMarks 无错误（只三档、价格正整数）', () => {
    expect(validateMarks()).toEqual([]);
  });

  it('三档名字不为空，面板上不会出现空行', () => {
    for (const name of Object.values(MARK_SINK_NAME)) expect(name.length).toBeGreaterThan(0);
  });
});

describe('formatMarks：给玩家看的量级', () => {
  it('小数字原样、上万给「万」、上亿给「亿」', () => {
    expect(formatMarks(0)).toBe('0');
    expect(formatMarks(9999)).toBe('9999');
    expect(formatMarks(12_000)).toBe('1.2万');
    expect(formatMarks(3_600_000)).toBe('360.0万');
    expect(formatMarks(120_000_000)).toBe('1.20亿');
  });

  it('脏值按 0 处理，不显示 NaN', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -5]) {
      expect(formatMarks(bad)).toBe('0');
    }
  });
});

describe('minutesUntil：用面板上那一句「还差多久」', () => {
  it('买得起返回 0（不是负数）', () => {
    expect(minutesUntil(9_999_999, 10)).toBe(0);
  });

  it('缺口 ÷ 当前速率（换速率这句话必须跟着变）', () => {
    const cost = MARKS_COST.rerollCurrency;
    const half = Math.floor(cost / 2);
    expect(minutesUntil(half, cost)).toBe(Math.ceil((cost - half) / MARKS_PER_MINUTE));
  });

  it('差额恰好一个速率的整数倍时不向上多算一分钟', () => {
    expect(minutesUntil(0, MARKS_PER_MINUTE * 3)).toBe(3);
  });

  it('脏值兜底：marks 为 NaN 时按 0 算', () => {
    expect(minutesUntil(Number.NaN, MARKS_PER_MINUTE * 2)).toBe(2);
  });
});

describe('sinkStatusText：三档状态', () => {
  it('买得起就是「可换」', () => {
    for (const sink of Object.keys(MARKS_COST) as (keyof typeof MARKS_COST)[]) {
      expect(sinkStatusText(MARKS_COST[sink], sink)).toBe('可换');
    }
  });

  it('买不起时同时说「还差多少」和「约多少分钟」', () => {
    const text = sinkStatusText(0, 'divineReforge');
    expect(text).toContain('还差');
    expect(text).toContain('分钟');
    expect(text).not.toContain('NaN');
    expect(text).not.toContain('Infinity');
  });

  it('affordableSinks 与面板判定一致（同一份价格表）', () => {
    for (const sink of Object.keys(MARKS_COST) as (keyof typeof MARKS_COST)[]) {
      const enough = MARKS_COST[sink];
      expect(affordableSinks(enough).includes(sink)).toBe(true);
      expect(affordableSinks(enough - 1).includes(sink)).toBe(false);
      expect(sinkStatusText(enough - 1, sink)).not.toBe('可换');
    }
  });
});

describe('面板几何', () => {
  it('高度放得进 540，宽度放得进 960（没有滚动条，溢出就是画到屏幕外）', () => {
    const h = marksPanelHeight();
    expect(h).toBeLessThan(540);
    expect(h).toBeGreaterThan(80);
    expect(MARKS_PANEL_W).toBeLessThan(960);
  });
});
