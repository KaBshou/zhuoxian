import { describe, expect, it } from 'vitest';
// 本项目没装 @types/node（tsconfig 的 lib 只有 ES2022 + DOM）。
// 这里读源码是为了做「单一出处」守卫（D213/D214），只用到 readFileSync / fileURLToPath，
// 所以用 ts-expect-error 局部放行，而不是为两个函数引一整个 node 类型包（那会改 package-lock）。
// @ts-expect-error - 运行时有 node，缺的只是类型声明
import { readFileSync } from 'node:fs';
// @ts-expect-error - 同上
import { fileURLToPath } from 'node:url';

import { drawTutorial, tutorialBoxHeight, tutorialBoxRect } from '../src/render/tutorial-overlay';
import { codexPanelHeight, drawCodexPanel } from '../src/render/codex-panel';
import { createCodex } from '../src/core/codex';

/**
 * D213：几何只能有一个出处。
 *
 * 背景（D210 死接线审计抓到的）：`codexPanelHeight` / `tutorialBoxRect` / `tutorialBoxHeight` /
 * `hitTestSavePanel` 四个导出在 `src/` 里**零引用** —— 因为绘制/点击处各写了一遍「看起来一样」的内联公式。
 *
 * 两份同值公式最坏的后果不是重复，而是**测试保护错了对象**：
 * 单测断言「画出来的高度 === codexPanelHeight(codex)」，可面板根本不是用它算的，
 * 于是改了内联那份、函数没改，测试照样绿，而画面上贴边/溢出（D208 的 rowsPerCol 就是这么少报 88px 的）。
 *
 * 所以这里做两件事：
 * 1. 行为层：绘制函数的返回值必须**等于**几何函数的返回值（一改一份就红）；
 * 2. 源码层：那几个内联公式不许再出现第二份（防止以后有人又抄一遍）。
 */

function readSrc(rel: string): string {
  return readFileSync(fileURLToPath(new URL(`../src/${rel}`, import.meta.url)), 'utf8');
}

function countOf(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

// 假 ctx：只记录 fillRect 的矩形与文本，够断言「画出来的盒子是哪个」。
function fakeCtx() {
  const rects: { x: number; y: number; w: number; h: number }[] = [];
  const texts: string[] = [];
  let fillStyle = '';
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    fillRect: (x: number, y: number, w: number, h: number) => {
      rects.push({ x, y, w, h });
    },
    strokeRect: () => {},
    fillText: (t: string) => {
      texts.push(String(t));
    },
    measureText: (t: string) => ({ width: String(t).length * 6 }),
    save: () => {},
    restore: () => {},
    set fillStyleValue(v: string) {
      fillStyle = v;
    },
    get fillStyleValue() {
      return fillStyle;
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, rects, texts };
}

describe('引导框几何只有一个出处（D213）', () => {
  it('drawTutorial 返回的矩形与 tutorialBoxRect 完全一致', () => {
    const text = '第一只浊物散了。浊气在你体内翻了一下 —— 它不会问你。';
    for (const [w, h, inset] of [
      [960, 540, 0],
      [960, 540, 26],
      [1920, 1080, 26],
      [390, 700, 26],
    ] as const) {
      const { ctx } = fakeCtx();
      const drawn = drawTutorial(ctx, text, '2 / 11', w, h, inset);
      const calc = tutorialBoxRect(text, w, h, inset);
      expect(drawn).toEqual(calc);
      // 高度函数也必须一致（它被别的渲染器用来让位）
      expect(tutorialBoxHeight(text, w)).toBe(calc.h);
    }
  });

  it('drawTutorial 真的按这个矩形画（不是画在别处）', () => {
    const text = '浊气入体，它会替你出手。';
    const { ctx, rects } = fakeCtx();
    const box = drawTutorial(ctx, text, '1 / 11', 960, 540, 26);
    // 第一个 fillRect 是底板
    expect(rects[0]).toEqual({ x: box.x, y: box.y, w: box.w, h: box.h });
  });

  it('源码里引导框高度公式只写一遍（tutorialBoxRect 之外不许再抄）', () => {
    const src = readSrc('render/tutorial-overlay.ts');
    // drawTutorial / tutorialBoxHeight / tutorialBoxRect 三处曾各写一遍
    expect(countOf(src, 'PAD_Y * 2 + TITLE_H')).toBeLessThanOrEqual(2);
    // drawTutorial 必须调用几何函数
    expect(countOf(src, 'tutorialBoxRect(')).toBeGreaterThanOrEqual(2);
  });
});

describe('图鉴面板高度只有一个出处（D213）', () => {
  it('drawCodexPanel 画出来的高度 === codexPanelHeight()', () => {
    const codex = createCodex();
    const { ctx, rects } = fakeCtx();
    drawCodexPanel(ctx, codex, 960, 540, -1);
    const panel = rects.find((r) => r.w > 400);
    expect(panel).toBeDefined();
    expect(panel?.h).toBe(codexPanelHeight(codex));
  });

  it('源码里图鉴面板高度公式只写一遍', () => {
    const src = readSrc('render/codex-panel.ts');
    expect(countOf(src, 'PAD * 2 + 34')).toBe(1);
    expect(countOf(src, 'codexPanelHeight(')).toBeGreaterThanOrEqual(2);
  });
});

describe('存档面板点击判定只有一个出处（D213）', () => {
  it('main.ts 用 hitTestSavePanel，不再自己遍历矩形', () => {
    const src = readSrc('main.ts');
    // import 是多行的（`hitTestSavePanel,` 后面没有括号），所以分两条断言
    expect(countOf(src, 'hitTestSavePanel')).toBeGreaterThanOrEqual(2); // import + 调用
    expect(countOf(src, 'hitTestSavePanel(')).toBeGreaterThanOrEqual(1); // 至少真被调一次
    // 旧写法：savePanelButtons(...).find(...)
    expect(countOf(src, 'savePanelButtons(LOGICAL_W, LOGICAL_H, savePhase).find(')).toBe(0);
  });
});

describe('修为进度与境界命名各只有一份（D214）', () => {
  it('hud 的进度比与 progression.stepProgress 结果逐值一致', async () => {
    const { realmProgressRatio } = await import('../src/render/hud-panels');
    const { stepProgress, xpForStep, TOTAL_STEPS } = await import('../src/core/progression');
    for (const step of [0, 1, 9, 40, TOTAL_STEPS - 2, TOTAL_STEPS - 1]) {
      const need = xpForStep(step);
      for (const frac of [0, 0.25, 0.5, 1, 1.5]) {
        const xp = Number.isFinite(need) ? need * frac : 0;
        expect(realmProgressRatio(step, xp)).toBeCloseTo(stepProgress(step, xp), 10);
      }
    }
    // 脏值：脏一律 0%（满格会骗玩家「马上突破」）
    expect(realmProgressRatio(Number.NaN, 10)).toBe(0);
    expect(realmProgressRatio(0, Number.NaN)).toBe(0);
  });

  it('hud-panels 不再内联 cur / need 的公式', () => {
    const src = readSrc('render/hud-panels.ts');
    expect(src.includes('cur / need')).toBe(false);
    expect(countOf(src, 'stepProgress')).toBeGreaterThanOrEqual(2); // import + 调用
    expect(countOf(src, 'stepProgress(')).toBeGreaterThanOrEqual(1); // 真被调一次
  });

  it('progression 不再导出境界命名的平行实现', () => {
    const src = readSrc('core/progression.ts');
    expect(src.includes('export function realmName')).toBe(false);
    expect(src.includes('export function stageName')).toBe(false);
    expect(src.includes('export function stepLabel')).toBe(false);
  });
});
