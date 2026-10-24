import { describe, expect, it } from 'vitest';
import { createSession } from '../src/core/session';
import { AFFIXES } from '../src/data/affixes';
import { ITEM_BASES } from '../src/data/bases';
import { ACHIEVEMENT_TOTAL } from '../src/data/achievements';
import { CODEX_TOTAL } from '../src/core/codex';
import { MAX_FLOOR } from '../src/data/monsters';
import { TOTAL_STEPS } from '../src/core/progression';
import {
  STATS_PANEL_W,
  durationText,
  marksPerHour,
  statsPanelGeometry,
  statsPanelHeight,
  statsSections,
  xpToMax,
} from '../src/render/stats-panel';
import { drawStatsPanel } from '../src/render/stats-panel';

const TABLES = { bases: ITEM_BASES, affixes: AFFIXES };

function session() {
  return createSession({ classId: 'yujian', seed: 2026, tables: TABLES });
}

interface FakeCtx {
  texts: string[];
  fills: string[];
  [key: string]: unknown;
}

function fakeCtx(): FakeCtx {
  const texts: string[] = [];
  const fills: string[] = [];
  const noop = () => undefined;
  const ctx: FakeCtx = {
    texts,
    fills,
    fillText: (t: string) => texts.push(String(t)),
  };
  // 注意：Object.assign 复制访问器时取的是**值**，所以 fillStyle 必须做成普通属性，
  // 再用 fillRect 把「当时的 fillStyle」记下来（发怒点：写成 get/set 就永远收不到颜色）。
  Object.assign(ctx, {
    canvas: { width: 960, height: 540 },
    save: noop, restore: noop, beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop,
    arc: noop, fill: noop, stroke: noop, strokeRect: noop, clearRect: noop,
    measureText: () => ({ width: 0 }),
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    setLineDash: noop, clip: noop, translate: noop, scale: noop, rotate: noop, drawImage: noop,
    roundRect: noop, globalAlpha: 1, font: '', textAlign: 'left', textBaseline: 'alphabetic',
    shadowBlur: 0, shadowColor: '', lineWidth: 1, strokeStyle: '', fillStyle: '',
  });
  ctx.fillRect = () => {
    fills.push(String(ctx.fillStyle));
  };
  return ctx;
}

/**
 * D200 统计面板。断的是「算出来的数」与「调用了什么」，
 * 不断像素 —— 布局改字号不该让这些红。
 */
describe('D200 统计面板', () => {
  it('时长文案：秒 / 分 / 小时三档，脏值不吐 NaN', () => {
    expect(durationText(0)).toBe('0 秒');
    expect(durationText(Number.NaN)).toBe('0 秒');
    expect(durationText(-5)).toBe('0 秒');
    expect(durationText(45)).toBe('45 秒');
    expect(durationText(125)).toBe('2 分 5 秒');
    expect(durationText(3 * 3600 + 40 * 60)).toBe('3 小时 40 分');
  });

  it('渊痕/小时：不足 1 分钟返 0（否则会爆表成天文数字）', () => {
    const s = session();
    s.character = { ...s.character, marks: 100000 };
    s.playedSeconds = 30;
    expect(marksPerHour(s)).toBe(0);
    s.playedSeconds = 3600;
    expect(marksPerHour(s)).toBe(100000);
  });

  it('距满级：新号是正的、满级是 0、脏值不炸', () => {
    const s = session();
    expect(xpToMax(s)).toBeGreaterThan(0);
    s.character = { ...s.character, step: TOTAL_STEPS - 1 };
    expect(xpToMax(s)).toBe(0);
    s.character = { ...s.character, step: Number.NaN };
    expect(Number.isFinite(xpToMax(s))).toBe(true);
  });

  it('三组数据齐全且分母来自数据表', () => {
    const sections = statsSections(session());
    expect(sections.map((x) => x.title)).toEqual(['本局', '累计', '收集']);
    const flat = sections.flatMap((x) => x.rows.map((r) => `${r.label}=${r.value}`)).join('|');
    expect(flat).toContain(`/ ${CODEX_TOTAL}`);
    expect(flat).toContain(`/ ${ACHIEVEMENT_TOTAL}`);
    expect(flat).toContain(`/ ${MAX_FLOOR}`);
    expect(flat).toContain(`/ ${TOTAL_STEPS}`);
    // 没有 NaN / undefined 混进玩家看的字里
    expect(flat).not.toMatch(/NaN|undefined|Infinity/);
  });

  it('面板装得进 960×540，且宽不超过常量', () => {
    const s = session();
    const geo = statsPanelGeometry(960, 540, s);
    expect(geo.w).toBeLessThanOrEqual(STATS_PANEL_W);
    expect(geo.x).toBeGreaterThanOrEqual(0);
    expect(geo.y).toBeGreaterThanOrEqual(0);
    expect(geo.x + geo.w).toBeLessThanOrEqual(960);
    expect(geo.y + geo.h).toBeLessThanOrEqual(540);
    expect(statsPanelHeight(s)).toBeGreaterThan(200);
  });

  it('真画一遍：出现「统计」标题、左缘金条、以及关键数据行', () => {
    const s = session();
    const ctx = fakeCtx();
    const geo = drawStatsPanel(ctx as unknown as CanvasRenderingContext2D, s, 960, 540);
    const texts = ctx.texts.join('|');
    expect(texts).toContain('统计');
    expect(texts).toContain('本局');
    expect(texts).toContain('累计');
    expect(texts).toContain('收集');
    // 左缘金条是探针用的结构像素（D190 教训：太暗就数不到，所以必须是高不透明度金）
    expect(ctx.fills.some((f) => f.includes('212,161,60,0.85'))).toBe(true);
    expect(geo.w).toBeGreaterThan(0);
  });
});
