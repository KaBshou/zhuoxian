import { describe, expect, it } from 'vitest';
import { MAX_FLOOR } from '../src/data/monsters';
import { AFFIXES } from '../src/data/affixes';
import { ITEM_BASES } from '../src/data/bases';
import { createSession } from '../src/core/session';
import {
  drawFloorMap,
  floorSettleIntensity,
  floorSettlePeak,
  floorSettleRate,
  floorMapWidth,
  floorMapHeight,
} from '../src/render/floor-map';

/**
 * D197：秘境图的「产出热度」。
 *
 * 目的只有一个：**让「去哪层刷」从攻略变成看得见的事实**。BALANCE 里层 21 与
 * 末层 76 最肥，但游戏里玩家只看得到层号 —— 选层等于靠猜。
 *
 * 这里钉三件事：公式与离线收益一致（不另开一套数值）、归一化到 0~1、
 * 深层的强度不低于浅层（否则玩家会以为越深越穷）。
 */
describe('D197 秘境图产出热度', () => {
  it('公式与离线收益同一套（killsPerMinute × xpPerKill × avgXpMul）', () => {
    // 层 1：筑基期最浅的一层，速率必须 > 0（否则热度全 0，面板一片黑）
    expect(floorSettleRate(1)).toBeGreaterThan(0);
    // 单调性：修为/分的乘积里 xpPerKill 随层号线性涨，深层一定比浅层高
    expect(floorSettleRate(27)).toBeGreaterThan(floorSettleRate(1));
    expect(floorSettleRate(76)).toBeGreaterThan(floorSettleRate(27));
  });

  it('脏层号被夹到合法区间，不吐 NaN / Infinity', () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, MAX_FLOOR + 40]) {
      const r = floorSettleRate(bad);
      expect(Number.isFinite(r)).toBe(true);
      expect(r).toBeGreaterThanOrEqual(0);
    }
  });

  it('强度归一化到 0~1，且最肥那层正好是 1', () => {
    const peak = floorSettlePeak();
    expect(peak.rate).toBeGreaterThan(0);
    expect(floorSettleIntensity(peak.floor)).toBeCloseTo(1, 6);
    for (let f = 1; f <= MAX_FLOOR; f += 1) {
      const v = floorSettleIntensity(f);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('最肥在末层（BALANCE §6：「末层 76 最肥」，不是因为面板偏好深层）', () => {
    const peak = floorSettlePeak();
    expect(peak.floor).toBe(MAX_FLOOR);
  });

  it('面板装得进 960×540（热度只是改颜色，不该把面板撑大）', () => {
    expect(floorMapWidth()).toBeLessThanOrEqual(960);
    expect(floorMapHeight()).toBeLessThanOrEqual(540);
  });

  it('真画一遍：热度色确实被用到，且深层alpha大于浅层（不是只算了不用）', () => {
    // 假 ctx 只记录 fillStyle：断「画的时候用了什么颜色」，比数像素稳（改字号/间距不会假红）。
    const styles: string[] = [];
    const noop = () => undefined;
    const ctx = {
      canvas: { width: 960, height: 540 },
      set fillStyle(v: string) {
        styles.push(String(v));
      },
      get fillStyle() {
        return '#000';
      },
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textAlign: 'left',
      textBaseline: 'alphabetic',
      globalAlpha: 1,
      fillRect: noop,
      strokeRect: noop,
      fillText: noop,
      save: noop,
      restore: noop,
      beginPath: noop,
      closePath: noop,
      moveTo: noop,
      lineTo: noop,
      arc: noop,
      fill: noop,
      stroke: noop,
      measureText: () => ({ width: 0 }),
      createLinearGradient: () => ({ addColorStop: noop }),
      createRadialGradient: () => ({ addColorStop: noop }),
      setLineDash: noop,
      clip: noop,
      translate: noop,
      scale: noop,
      rotate: noop,
      drawImage: noop,
      roundRect: noop,
    };
    const s = createSession({ classId: 'yujian', seed: 2026, tables: { bases: ITEM_BASES, affixes: AFFIXES } });
    // 把最深推到 76 层，让整张图都「可前往」（locked 的格子刻意不上色）
    (s as { maxFloorReached: number }).maxFloorReached = MAX_FLOOR;
    drawFloorMap(ctx as unknown as CanvasRenderingContext2D, s, 960, 540);

    const heats = styles.filter((v) => /^rgba\(212,161,60,0\.\d+\)$/.test(v)).map((v) => Number(v.slice(-5, -1)));
    expect(heats.length).toBeGreaterThanOrEqual(70); // 76 格里除 locked 外都上色
    expect(Math.max(...heats)).toBeGreaterThan(Math.min(...heats) + 0.15);
    // 最深那层的 alpha 必须接近上限（0.06 + 0.30）
    expect(heats[heats.length - 1]).toBeCloseTo(0.36, 1);
  });
});
