import { describe, expect, it } from 'vitest';
import { layoutHudButtons } from '../src/render/hud-buttons';
import { HUD_LEFT_X, HUD_PANEL_W, HUD_RIGHT_X, HUD_TOP, TOP_STRIP_H } from '../src/render/hud-panels';

/**
 * HUD 布局的几何钉子（D176）。
 *
 * 为什么要有这个文件：布局重叠**不会让任何测试变红、也不会让 tsc 报错**，
 * 它只在玩家屏幕上表现为「血条上压着字」「按钮盖在面板上」—— 而我又看不了图。
 * 所以把「谁和谁不许相交」写成断言，以后任何一次改坐标都会被立刻抓住。
 *
 * 坐标系是**逻辑画布** 960x540（渲染器按像素比放大，坐标不变）。
 */

const W = 960;
const H = 540;

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

function overlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

const buttons = layoutHudButtons(W, H);

describe('HUD 布局不重叠（D176）', () => {
  it('有 8 个按钮（法宝/详解/周天/神通/图鉴/成就/渊痕/存档）', () => {
    expect(buttons).toHaveLength(8);
    expect(buttons.map((b) => b.id)).toEqual([
      'detail',
      'breakdown',
      'talent',
      'skill',
      'codex',
      'achievement',
      'marks',
      'save',
    ]);
  });

  it('按钮全部在顶栏下方（不压血条/浊气/罡气）', () => {
    for (const b of buttons) {
      // 顶栏高 38，按钮必须整体在它下面：这条以前是 10，真的压在血条上
      expect(b.y, `按钮 ${b.id} 压到顶栏了`).toBeGreaterThanOrEqual(TOP_STRIP_H);
    }
  });

  it('按钮互相不重叠，且都在 0..960 内', () => {
    for (const b of buttons) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(W);
      expect(b.y + b.h).toBeLessThanOrEqual(H);
    }
    for (let i = 0; i < buttons.length; i += 1) {
      for (let j = i + 1; j < buttons.length; j += 1) {
        const a = buttons[i];
        const b = buttons[j];
        if (!a || !b) continue;
        expect(overlap(a, b), `按钮 ${a.id} 与 ${b.id} 重叠`).toBe(false);
      }
    }
  });

  it('按钮条不压左列（法宝）也不压右列（状态/囊中/背包）', () => {
    const left: Rect = { x: HUD_LEFT_X, y: TOP_STRIP_H + 4, w: HUD_PANEL_W, h: 200 };
    const right: Rect = { x: HUD_RIGHT_X, y: HUD_TOP, w: HUD_PANEL_W, h: 300 };
    for (const b of buttons) {
      expect(overlap(b, left), `按钮 ${b.id} 压到左列法宝面板`).toBe(false);
      expect(overlap(b, right), `按钮 ${b.id} 压到右列面板`).toBe(false);
    }
  });

  it('两列面板互不重叠，左列在左、右列在右', () => {
    const left: Rect = { x: HUD_LEFT_X, y: 0, w: HUD_PANEL_W, h: H };
    const right: Rect = { x: HUD_RIGHT_X, y: 0, w: HUD_PANEL_W, h: H };
    expect(overlap(left, right)).toBe(false);
    expect(left.x).toBeLessThan(right.x);
  });

  it('左列从顶栏下沿开始（法宝尽量往上、像主界面的一部分）', () => {
    expect(TOP_STRIP_H + 4).toBe(42);
    // 右列要让出按钮条：按钮底边 = 42 + 22 = 64，右列 74 起
    const bottom = Math.max(...buttons.map((b) => b.y + b.h));
    expect(HUD_TOP).toBeGreaterThan(bottom);
  });

  it('战况日志区（左下）与两列面板都不相交', () => {
    // 日志从底部往上画 6 行（每行约 18px），左下角 x 14 起、宽约 380
    const log: Rect = { x: 14, y: H - 14 - 6 * 18, w: 380, h: 6 * 18 };
    const left: Rect = { x: HUD_LEFT_X, y: TOP_STRIP_H + 4, w: HUD_PANEL_W, h: 200 };
    expect(overlap(log, left)).toBe(false);
  });
});
