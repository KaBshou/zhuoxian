import { describe, expect, it } from 'vitest';
import { createCodex, codexEntries } from '../src/core/codex';
import { fitDetailText } from '../src/render/codex-panel';

/**
 * D202：图鉴的「去哪找」提示必须画得下。
 *
 * 提示文字从「尚未遭遇」变成「尚未遭遇（3 阶 · 第 19–76 层）」—— 长了一倍。
 * 面板是固定宽两列，溢出就画进右边那列，看起来像「这只怪叫『第 19–7…』」。
 * 这里钉两件事：①提示本身不许超宽；②真超宽时截断且带省略号（不是硬裁）。
 */
describe('D202 图鉴 detail 折行', () => {
  it('所有 detail 都放得进一列（含最长的未收录提示）', () => {
    const rows = codexEntries(createCodex());
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(fitDetailText(r.detail)).toBe(r.detail);
    }
  });

  it('超宽时截断并保留省略号（而不是硬裁掉后半句）', () => {
    const long = '尚未遭遇（3 阶 · 第 19–76 层）'.repeat(6);
    const fitted = fitDetailText(long);
    expect(fitted.endsWith('…')).toBe(true);
    expect(fitted.length).toBeLessThan(long.length);
    // 不许出现半个字被丢掉却没有省略号的情况
    expect(fitted.slice(0, -1).length).toBeGreaterThan(0);
  });

  it('刚好放得下时原样返回（不做无谓截断）', () => {
    expect(fitDetailText('尚未遭遇')).toBe('尚未遭遇');
    expect(fitDetailText('')).toBe('');
  });
});