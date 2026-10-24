import { describe, expect, it } from 'vitest';

import { APP_TITLE, APP_VERSION } from '../src/data/version';
import { HELP_FOOTER, helpPanelGeometry } from '../src/render/help-panel';
import { drawClassSelect } from '../src/render/class-select';

/**
 * D216 版本号：只有一个出处（package.json → vite define → src/data/version.ts）。
 *
 * 为什么值得一条测试：版本号是「玩家报问题时唯一能定位的锚」。
 * 它如果还是 `0.0.1` 或者空字符串，线上出问题时无法判断玩家玩的是哪一版；
 * 而这类字段最容易「写一遍就再没人改」。
 */

function fakeCtx() {
  const texts: string[] = [];
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    fillRect: () => {},
    strokeRect: () => {},
    fillText: (t: string) => {
      texts.push(String(t));
    },
    measureText: (t: string) => ({ width: String(t).length * 6 }),
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arc: () => {},
    fill: () => {},
    stroke: () => {},
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    quadraticCurveTo: () => {},
    ellipse: () => {},
    translate: () => {},
    rotate: () => {},
    scale: () => {},
    setTransform: () => {},
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts };
}

describe('版本号（D216）', () => {
  it('不是占位符，且是 semver 形状', () => {
    expect(APP_VERSION).not.toBe('');
    expect(APP_VERSION).not.toBe('0.0.0-dev'); // 意味着 vite define 没生效
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('已经从 0.0.1 升到 1.x（发布版）', () => {
    expect(APP_VERSION.startsWith('1.')).toBe(true);
  });

  it('标题带版本', () => {
    expect(APP_TITLE).toBe(`浊仙 v${APP_VERSION}`);
  });

  it('帮助面板页脚带版本（玩家按 H 就能查到）', () => {
    expect(HELP_FOOTER).toContain(`v${APP_VERSION}`);
    expect(HELP_FOOTER).toContain('游戏不会暂停');
  });

  it('选道统第一屏就带版本 + 存档归属提示', () => {
    const { ctx, texts } = fakeCtx();
    drawClassSelect(ctx, 0, 0);
    const all = texts.join('\n');
    expect(all).toContain(`v${APP_VERSION}`);
    // 「进度只存在这台浏览器」必须出现在玩家做任何事之前的那一屏
    expect(all).toContain('进度只存在这台浏览器');
  });

  it('帮助面板塞得进 540（加版本不能把页脚挤出去）', () => {
    const geo = helpPanelGeometry(960, 540);
    expect(geo.y + geo.h).toBeLessThanOrEqual(540);
  });
});
