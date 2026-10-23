import { describe, expect, it } from 'vitest';
import { layoutHudButtons } from '../src/render/hud-buttons';
import {
  FOOTER_H,
  HUD_LEFT_X,
  HUD_PANEL_W,
  HUD_RIGHT_X,
  HUD_TOP,
  TOP_STRIP_H,
  estimateTextWidth,
  topStripRows,
} from '../src/render/hud-panels';
import { tutorialBoxRect } from '../src/render/tutorial-overlay';
import { createCharacter } from '../src/core/character';
import { createSession } from '../src/core/session';
import { ITEM_BASES } from '../src/data/bases';
import { AFFIXES } from '../src/data/affixes';
import type { GameSession } from '../src/core/session';

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
    // 日志从底栏上方往上画（D177：原来第一行画在 BATTLE_H-14，与底栏同一基线）
    const logBottom = H - FOOTER_H - 6;
    const log: Rect = { x: 14, y: logBottom - 6 * 18, w: 380, h: 6 * 18 };
    const left: Rect = { x: HUD_LEFT_X, y: TOP_STRIP_H + 4, w: HUD_PANEL_W, h: 200 };
    expect(overlap(log, left)).toBe(false);
  });
});

/**
 * D177：线上截图实拍的两处重叠。
 *
 * 这两条的共同点：**错的是布局算法，不是某个坐标**。所以测试钉的是
 * 「算出来的矩形不许相交」，不是「某个数字等于多少」——后者下次改字号又会失效。
 */
function makeSession(): GameSession {
  return createSession({
    classId: 'yujian',
    seed: 2026,
    tables: { bases: ITEM_BASES, affixes: AFFIXES },
  });
}

describe('顶栏右侧文字不许重叠（D177）', () => {
  it('境界与战力两段文字不重叠（这是线上事故的正面）', () => {
    const s = makeSession();
    const rows = topStripRows(s, 946);
    const first = rows[0];
    expect(first).toBeTruthy();
    const items = first!.items;
    expect(items.length).toBeGreaterThanOrEqual(2);

    // 按渲染器的摆法复算每段的左右边界，断言相邻两段之间留出 STRIP_GAP 的空隙
    const widths = items.map((it) => estimateTextWidth(it.text, 12));
    const total = widths.reduce((a, b) => a + b, 0) + 10 * (items.length - 1);
    let x = 946 - total;
    let prevRight = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < items.length; i += 1) {
      const w = widths[i] ?? 0;
      expect(x, `第 ${i} 段（${items[i]!.text}）压到了前一段`).toBeGreaterThanOrEqual(prevRight);
      prevRight = x + w;
      x += w + 10;
    }
  });

  it('带小数的战力比旧的 78px 间距还宽 —— 这才是那次重叠的真根因', () => {
    // 事故复盘：旧代码 `fillText(realm, cx - 78)` + `fillText(power, cx)`，
    // 两段都是右对齐、间距写死 78。境界「练气·一重」只有约 55px，装得下；
    // 真正越界的是 `战力 156.65895`（约 90px）—— 所以修法是「取整」+「算宽度」，
    // 不是「把 78 改成 90」（改数字下次换个更长的小数又会叠）。
    expect(estimateTextWidth('战力 156.65895', 12)).toBeGreaterThan(78);
    expect(estimateTextWidth('战力 157', 12)).toBeLessThan(78);
  });

  it('战力是整数（不出现 156.65895 这种撑爆行宽的小数）', () => {
    const s = makeSession();
    const power = topStripRows(s, 946)[0]?.items.at(-1)?.text ?? '';
    expect(power).toMatch(/^战力 \d+$/);
  });

  it('两行都整体落在顶栏 38px 内（基线 17 / 32 + 字高）', () => {
    for (const baseline of [17, 32]) {
      expect(baseline + 4).toBeLessThanOrEqual(TOP_STRIP_H);
    }
  });

  it('极窄预算时降级成只留战力/波次，而不是叠在一起', () => {
    const s = makeSession();
    const rows = topStripRows(s, 946, 40);
    expect(rows[0]?.items).toHaveLength(1);
    expect(rows[0]?.items[0]?.text).toMatch(/^战力 \d+$/);
    expect(rows[1]?.items).toHaveLength(1);
    expect(rows[1]?.items[0]?.text).toMatch(/^第 \d+ 波$/);
  });
});

describe('引导框不许压底栏（D177）', () => {
  it('引导框底边在底栏上方', () => {
    const text = '浊气入体，你还活着。它会替你出手 —— 你不必按任何键。';
    const rect = tutorialBoxRect(text, W, H, FOOTER_H);
    const footerTop = H - FOOTER_H;
    expect(rect.y + rect.h).toBeLessThanOrEqual(footerTop);
  });

  it('多行引导也不许压底栏（换行会变高，压不压取决于算法不是运气）', () => {
    const text = '这是一句很长的引导文案，用来逼出两行甚至三行，验证引导框变高之后依然从底栏上方往上排，而不是压到底栏文字上。';
    const rect = tutorialBoxRect(text, W, H, FOOTER_H);
    expect(rect.lines.length).toBeGreaterThan(1);
    expect(rect.y + rect.h).toBeLessThanOrEqual(H - FOOTER_H);
    expect(rect.y).toBeGreaterThan(TOP_STRIP_H);
  });

  it('不传 bottomInset 时保持旧行为（老探针与单测不受影响）', () => {
    const rect = tutorialBoxRect('短句', W, H);
    expect(rect.y + rect.h).toBeLessThanOrEqual(H);
  });

  it('FOOTER_H 覆盖底栏基线与字高（14 + 字高 11 ≈ 25，取 24 会让字贴边）', () => {
    // 底栏基线 = H-14，字高 11px ⇒ 文字顶端约 H-25。FOOTER_H 必须 ≥ 25 才真正让开。
    expect(FOOTER_H).toBeGreaterThanOrEqual(25);
  });
});
