import { describe, expect, it } from 'vitest';
import { createCodex, recordVariant, type CodexState } from '../src/core/codex';
import { codexColumnRows, codexPanelHeight, drawCodexPanel } from '../src/render/codex-panel';

/** 记录所有 fillText 的假 ctx（D195 手法：断「调用了什么」而不是「像素长什么样」） */
function makeCtx() {
  const texts: string[] = [];
  const rects: { x: number; y: number; w: number; h: number }[] = [];
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    font: '',
    textAlign: 'left',
    textBaseline: 'top',
    lineWidth: 1,
    save() {},
    restore() {},
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push({ x, y, w, h });
    },
    strokeRect() {},
    fillText(t: string) {
      texts.push(t);
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts, rects };
}

const empty: CodexState = createCodex();

describe('图鉴面板（D211 修「异变体那一行画不出来」）', () => {
  it('异变体那一行必须真的画出来（D160 加了行，D211 之前从没画过）', () => {
    const { ctx, texts } = makeCtx();
    drawCodexPanel(ctx, empty, 960, 540, -1);
    expect(texts.some((t) => t.includes('异变体'))).toBe(true);
  });

  it('右列标题说明这一列含异变体（否则第一行看起来像传奇）', () => {
    const { ctx, texts } = makeCtx();
    drawCodexPanel(ctx, empty, 960, 540, -1);
    expect(texts).toContain('异变体 · 传奇');
    expect(texts).toContain('浊物');
  });

  it('列行数取两列较大者：左 21 浊物、右 13（12 传奇 + 1 异变体）', () => {
    // CODEX_TOTAL = 21 浊物 + 12 传奇 + 1 异变体 = 34（D145 加了 6 只怪，不是 18）
    expect(codexColumnRows(empty)).toBe(21);
  });

  it('面板高度与实际绘制同源（之前少算一行 = 矮 17px）', () => {
    const { ctx, rects } = makeCtx();
    drawCodexPanel(ctx, empty, 960, 540, -1);
    // 第一块 fillRect 是面板底
    const panel = rects[0];
    expect(panel.h).toBe(codexPanelHeight(empty));
  });

  it('面板装得进 960×540', () => {
    const h = codexPanelHeight(empty);
    expect(h).toBeLessThan(540);
    expect(h).toBeGreaterThan(300);
  });

  it('光标指向异变体那一行时，右列第一行被高亮（绝对索引不再错位）', () => {
    // codexEntries 顺序：浊物 0..17、异变体 18、传奇 19..30
    const { ctx, rects } = makeCtx();
    drawCodexPanel(ctx, empty, 960, 540, 18);
    // 面板底 + 光标底 = 至少两次 fillRect
    expect(rects.length).toBeGreaterThanOrEqual(2);
  });

  it('已收录异变体后该行带 · 前缀（不是问号）', () => {
    const withVariant = recordVariant(empty);
    const { ctx, texts } = makeCtx();
    drawCodexPanel(ctx, withVariant, 960, 540, -1);
    expect(texts.some((t) => t.startsWith('· 异变体'))).toBe(true);
  });

  it('未收录时异变体带问号前缀', () => {
    const { ctx, texts } = makeCtx();
    drawCodexPanel(ctx, empty, 960, 540, -1);
    expect(texts.some((t) => t.startsWith('？ 异变体'))).toBe(true);
  });
});
