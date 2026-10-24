/**
 * 帮助面板（D190）的钉子测试。
 *
 * 重点不是「文案好不好」，而是四件会悄悄坏掉的事：
 * 1. 面板装不进 960×540（多写一行就溢出，而溢出后玩家看到的是被切掉的文字）；
 * 2. 页脚「?」按钮和别的东西重叠（它压在最上层，重叠会吃掉别人的点击）；
 * 3. 帮助里提到的键位在真实键位表里不存在（文案漂移比代码漂移更常见）；
 * 4. 帮助被当成面板参加了互斥（它是「随时可开」的，会被 closeAllPanels 收掉是设计，但 Esc 关闭要能走）。
 */
import { describe, expect, it } from 'vitest';
import {
  HELP_FOOTER,
  HELP_PANEL_W,
  HELP_SECTIONS,
  drawHelpPanel,
  helpButtonRect,
  helpMentions,
  helpPanelGeometry,
  helpPanelHeight,
  hitTestHelpButton,
} from '../src/render/help-panel';

const W = 960;
const H = 540;

describe('帮助面板几何（D190）', () => {
  it('面板装得进 960×540', () => {
    const geo = helpPanelGeometry(W, H);
    expect(geo.x).toBeGreaterThan(0);
    expect(geo.y).toBeGreaterThan(0);
    expect(geo.x + geo.w).toBeLessThanOrEqual(W);
    expect(geo.y + geo.h).toBeLessThanOrEqual(H);
  });

  it('高度等于「各节行数累加 + 页脚」，不是猜的', () => {
    const rows = HELP_SECTIONS.reduce((n, s) => n + 1 + s.rows.length, 0);
    // 30(标题) + 16(pad) + rows*16 + N*6(节间距) + 26(页脚) + 16(pad)
    // 这四个数改了这里也要改：它是「不许拍脑袋定高度」的护栏。
    expect(helpPanelHeight()).toBe(30 + 16 + rows * 16 + HELP_SECTIONS.length * 6 + 26 + 16);
    // 高度必须留出余量：贴着 540 以后再加一行就溢出，而溢出是看不到的（画到画布外）。
    expect(helpPanelHeight()).toBeLessThanOrEqual(534);
  });

  it('宽度是常量且居中（左右留白差 ≤1）', () => {
    const geo = helpPanelGeometry(W, H);
    expect(geo.w).toBe(HELP_PANEL_W);
    const left = geo.x;
    const right = W - (geo.x + geo.w);
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
  });
});

describe('页脚「?」按钮（D190）', () => {
  it('在右下角且不与页脚文字基线打架', () => {
    const r = helpButtonRect(W, H);
    expect(r.x + r.w).toBe(W - 14);
    expect(r.h).toBe(20);
    // 底栏基线是 H-14，按钮底边要在它上面至少 14px
    expect(r.y + r.h).toBeLessThanOrEqual(H - 14 - 14);
  });

  it('命中是闭区间：四角与中心都算命中', () => {
    const r = helpButtonRect(W, H);
    expect(hitTestHelpButton(r.x, r.y, W, H)).toBe(true);
    expect(hitTestHelpButton(r.x + r.w, r.y + r.h, W, H)).toBe(true);
    expect(hitTestHelpButton(r.x + r.w / 2, r.y + r.h / 2, W, H)).toBe(true);
  });

  it('按钮外 2px 不命中（否则会吃掉旁边的点击）', () => {
    const r = helpButtonRect(W, H);
    expect(hitTestHelpButton(r.x - 2, r.y, W, H)).toBe(false);
    expect(hitTestHelpButton(r.x, r.y - 2, W, H)).toBe(false);
    expect(hitTestHelpButton(r.x + r.w + 2, r.y, W, H)).toBe(false);
    expect(hitTestHelpButton(r.x, r.y + r.h + 2, W, H)).toBe(false);
  });

  it('窄画布也留在画布内（不出现负数坐标）', () => {
    const r = helpButtonRect(360, 200);
    expect(r.x).toBeGreaterThan(0);
    expect(r.y).toBeGreaterThan(0);
    expect(r.x + r.w).toBeLessThanOrEqual(360);
  });
});

describe('帮助正文（D190）', () => {
  it('四节都有标题与内容（空节等于没写）', () => {
    // 至少四节：怎么玩 / 名词 / 通货与玉简 / 键位（以后加节只许多不许少）
    expect(HELP_SECTIONS.length).toBeGreaterThanOrEqual(4);
    for (const sec of HELP_SECTIONS) {
      expect(sec.title.length).toBeGreaterThan(0);
      expect(sec.rows.length).toBeGreaterThan(0);
      for (const row of sec.rows) expect(row.trim().length).toBeGreaterThan(0);
    }
  });

  it('键位文档与真实键位一致：列出的键必须在正文里出现', () => {
    // 与 src/main.ts 的 keydown 分支、hud-buttons.ts 的 spec 对齐
    const keys = ['E', 'D', 'T', 'G', 'K', 'J', 'M', 'B', 'P', 'S', 'V', 'H', 'N', 'L', 'F'];
    for (const k of keys) expect(helpMentions(`${k} `)).toBe(true);
  });

  it('提到七个名词（浊气/渊痕/周目/图鉴/成就/碎片/玉简）', () => {
    for (const term of ['浊气', '渊痕', '周目', '图鉴', '成就', '碎片', '玉简']) {
      expect(helpMentions(term)).toBe(true);
    }
  });

  it('写了「游戏不会暂停」（挂机游戏里暂停=损失，这句必须在）', () => {
    // 这句话在页脚而不是正文节里，所以断常量而不是断 helpMentions
    expect(HELP_FOOTER.includes('不会暂停')).toBe(true);
    expect(HELP_FOOTER.includes('Esc')).toBe(true);
  });

  it('drawHelpPanel 能在假 ctx 上跑完并返回几何', () => {
    const calls = { fillRect: 0, fillText: 0, strokeRect: 0 };
    const ctx = {
      fillRect: () => { calls.fillRect += 1; },
      strokeRect: () => { calls.strokeRect += 1; },
      fillText: () => { calls.fillText += 1; },
      set fillStyle(_v: string) {},
      set strokeStyle(_v: string) {},
      set lineWidth(_v: number) {},
      set font(_v: string) {},
      set textAlign(_v: string) {},
      set textBaseline(_v: string) {},
    } as unknown as CanvasRenderingContext2D;
    const geo = drawHelpPanel(ctx, W, H);
    expect(geo.w).toBe(HELP_PANEL_W);
    // 遮罩 + 面板底 + 左缘金条 = 3 次 fillRect 至少
    expect(calls.fillRect).toBeGreaterThanOrEqual(3);
    // 标题 + 页脚 + 每节标题 + 每行正文
    const rows = HELP_SECTIONS.reduce((n, s) => n + 1 + s.rows.length, 0);
    expect(calls.fillText).toBeGreaterThanOrEqual(rows + 1);
  });
});
