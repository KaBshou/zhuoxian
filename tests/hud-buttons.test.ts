// 画布按钮条（鼠标 / 触屏）—— 纯几何 + 命中判定。
//
// 为什么这条测试重要：按钮条是**手机上唯一能打开面板的方式**（手机没有 K/T/G/M/D/E 键）。
// 布局算错 1px 不会报错、单测不看就发现不了，玩家表现是"按钮点不动"。
// 本项目已经在 `class-select.ts` 上踩过一次同类坑（800 宽视口下卡片跑到 x=-42，画到屏幕外）。
import { describe, expect, it } from 'vitest';
import { hitTestHudButtons, layoutHudButtons, toCanvasPoint, type HudButtonId } from '../src/render/hud-buttons';

// 顺序必须与底部提示行、以及 hud-buttons.ts 的按钮表一致。
// 加按钮时这里也要加 —— 漏了会立刻红（D92 的设计意图：按钮条是手机上唯一入口，
// 少一个就等于「这个面板手机上打不开」）。
const ALL_IDS: readonly HudButtonId[] = ['detail', 'breakdown', 'talent', 'skill', 'codex', 'achievement', 'marks', 'save', 'sound'];

describe('布局：任何画布宽度下都不许画到屏幕外', () => {
  it('全部按钮都在 [0, canvasW] 内（960 设计分辨率）', () => {
    for (const b of layoutHudButtons(960)) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(960);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.y + b.h).toBeLessThanOrEqual(540);
    }
  });

  it('窄画布（320，手机竖屏）也不越左边界', () => {
    for (const b of layoutHudButtons(320)) expect(b.x).toBeGreaterThanOrEqual(0);
  });

  it('右边缘恒距 14px（从右往左排，不随按钮数量漂）', () => {
    const bs = layoutHudButtons(960);
    expect(960 - (bs[bs.length - 1].x + bs[bs.length - 1].w)).toBe(14);
  });

  it('按钮之间不重叠，且顺序与底部提示行一致（E D T G K J M S V）', () => {
    const bs = layoutHudButtons(960);
    expect(bs.map((b) => b.id)).toEqual(ALL_IDS);
    expect(bs.map((b) => b.key)).toEqual(['E', 'D', 'T', 'G', 'K', 'J', 'M', 'S', 'V']);
    for (let i = 1; i < bs.length; i++) expect(bs[i].x).toBeGreaterThan(bs[i - 1].x + bs[i - 1].w);
  });
});

describe('命中判定', () => {
  it('每个按钮中心点都能命中自己', () => {
    for (const b of layoutHudButtons(960)) {
      const hit = hitTestHudButtons(b.x + b.w / 2, b.y + b.h / 2, 960);
      expect(hit?.id).toBe(b.id);
    }
  });

  it('正好点在边框上也算命中（手机点击有亚像素抖动）', () => {
    const b = layoutHudButtons(960)[0];
    expect(hitTestHudButtons(b.x, b.y, 960)?.id).toBe(b.id);
    expect(hitTestHudButtons(b.x + b.w, b.y + b.h, 960)?.id).toBe(b.id);
  });

  it('按钮下方（战斗区域）判空，不会误触', () => {
    expect(hitTestHudButtons(500, 300, 960)).toBeNull();
    expect(hitTestHudButtons(5, 5, 960)).toBeNull();
  });

  it('脏坐标安静判否，不抛也不命中', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(hitTestHudButtons(bad, bad, 960)).toBeNull();
    }
  });
});

describe('坐标换算：画布被 CSS 缩放时必须换算', () => {
  it('1:1 时原样返回', () => {
    const rect = { left: 0, top: 0, width: 960, height: 540 };
    expect(toCanvasPoint(480, 270, rect, 960, 540)).toEqual({ x: 480, y: 270 });
  });

  it('画布被缩到一半：客户端坐标 ×2 才是画布坐标', () => {
    const rect = { left: 10, top: 20, width: 480, height: 270 };
    expect(toCanvasPoint(250, 155, rect, 960, 540)).toEqual({ x: 480, y: 270 });
  });

  it('rect 宽高为 0（还没布局）时不产生 NaN/Infinity', () => {
    const p = toCanvasPoint(100, 100, { left: 0, top: 0, width: 0, height: 0 }, 960, 540);
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
  });

  it('缩放后仍能点中按钮（手机上的真实路径）', () => {
    // 960 宽画布显示在 480 宽的屏幕上（缩放 0.5），点第 1 颗按钮中心
    const b = layoutHudButtons(960)[0];
    const clientX = (b.x + b.w / 2) / 2;
    const clientY = (b.y + b.h / 2) / 2;
    const pt = toCanvasPoint(clientX, clientY, { left: 0, top: 0, width: 480, height: 270 }, 960, 540);
    expect(hitTestHudButtons(pt.x, pt.y, 960)?.id).toBe(b.id);
  });
});
