// 存档面板的「重开新档」（D191）—— 布局与两步确认的契约。
//
// 为什么要在按钮层面钉死：删档按钮的价值全在「不小心点到也不会毁档」。
// 一步就执行的界面，玩家手滑一次就没了 —— 而这条路径没有撤销。
import { describe, expect, it } from 'vitest';
import {
  SAVE_PANEL_W,
  hitTestSavePanel,
  savePanelButtons,
  savePanelHeight,
} from '../src/render/save-panel';

const W = 960;
const H = 540;

describe('存档面板 · 重开新档（D191）', () => {
  it('默认态有三个动作：导出 / 导入 / 重开', () => {
    const ids = savePanelButtons(W, H, 'idle').map((b) => b.id);
    expect(ids).toEqual(['export', 'import', 'restart']);
  });

  it('重开独占第二行（和「导出」分行，避免一个救档一个毁档挨着）', () => {
    const bs = savePanelButtons(W, H, 'idle');
    const exp = bs.find((b) => b.id === 'export')!;
    const rst = bs.find((b) => b.id === 'restart')!;
    expect(rst.y).toBeGreaterThanOrEqual(exp.y + exp.h);
    expect(rst.w).toBeGreaterThan(exp.w); // 整行宽，视觉上更像"另一类操作"
  });

  it('重开态给的是「确认重开」+「取消」', () => {
    const ids = savePanelButtons(W, H, 'restart').map((b) => b.id);
    expect(ids).toEqual(['restartConfirm', 'cancel']);
  });

  it('确认重开的文案必须写明后果（不能只写「确定」）', () => {
    const b = savePanelButtons(W, H, 'restart').find((x) => x.id === 'restartConfirm')!;
    expect(b.label).toContain('重开');
    expect(b.label.includes('没') || b.label.includes('清空') || b.label.includes('会')).toBe(true);
  });

  it('三种阶段的按钮都不重叠、都不越出面板左右边界', () => {
    for (const phase of ['idle', 'confirm', 'restart'] as const) {
      const bs = savePanelButtons(W, H, phase);
      const left = Math.round((W - SAVE_PANEL_W) / 2);
      for (const b of bs) {
        expect(b.x).toBeGreaterThanOrEqual(left);
        expect(b.x + b.w).toBeLessThanOrEqual(left + SAVE_PANEL_W);
      }
      for (let i = 0; i < bs.length; i += 1) {
        for (let j = i + 1; j < bs.length; j += 1) {
          const a = bs[i];
          const c = bs[j];
          const apart = a.x + a.w <= c.x || c.x + c.w <= a.x || a.y + a.h <= c.y || c.y + c.h <= a.y;
          expect(apart).toBe(true);
        }
      }
    }
  });

  it('默认态比确认态高（多一行按钮），且都装得进 540', () => {
    expect(savePanelHeight('idle')).toBeGreaterThan(savePanelHeight('confirm'));
    expect(savePanelHeight('idle')).toBeLessThan(H);
  });

  it('命中测试认得重开按钮（闭区间，手机点击有亚像素抖动）', () => {
    const b = savePanelButtons(W, H, 'idle').find((x) => x.id === 'restart')!;
    expect(hitTestSavePanel(b.x + 1, b.y + 1, W, H, 'idle')).toBe('restart');
    expect(hitTestSavePanel(b.x + b.w, b.y + b.h, W, H, 'idle')).toBe('restart');
    expect(hitTestSavePanel(b.x - 2, b.y, W, H, 'idle')).toBeNull();
  });

  it('确认态点不到重开（阶段是对的，动作就不会错）', () => {
    const b = savePanelButtons(W, H, 'restart')[0];
    expect(hitTestSavePanel(b.x + 2, b.y + 2, W, H, 'restart')).toBe('restartConfirm');
  });
});
