import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENT_TOTAL,
  ACHIEVEMENT_DEFS,
  EMPTY_FACTS,
  type AchievementFacts,
} from '../src/data/achievements';
import {
  achievementEntries,
  achievementSummary,
  createAchievements,
  sanitizeAchievements,
} from '../src/core/achievement';
import {
  achievementPanelHeight,
  nearestAchievement,
  drawAchievementPanel,
  shortCount,
} from '../src/render/achievement-panel';

/**
 * D208：成就面板补「离达成还有多远」。
 *
 * 面板原来只写「现在/目标」两个数字（`12/500`），玩家要自己算比例，
 * 而 27 条里绝大多数是长线（500/3000/11000 杀），
 * 「下一个会解锁哪条」这个问题面板完全没回答。
 *
 * 两条加法：
 *   1. 未达成行下方一条 3px 细进度条（扫一眼就有"多近"）；
 *   2. 页脚上方一行「最接近：XXX（还差 N）」。
 * 都没改判据、没改存档、没新增字段 —— 纯显示。
 */

const IDS = ACHIEVEMENT_DEFS.map((a) => a.id);

function facts(over: Partial<AchievementFacts> = {}): AchievementFacts {
  return { ...EMPTY_FACTS, ...over };
}

describe('D208 最接近达成', () => {
  it('空进度时给出一条（不是 null）', () => {
    const state = createAchievements();
    const rows = achievementEntries(state, facts());
    const near = nearestAchievement(rows);
    expect(near).not.toBeNull();
    expect(near?.unlocked).toBe(false);
  });

  it('挑进度比最高的那条，不是进度数最大的那条', () => {
    // kills=499 让 kill-1（500）达到 99.8%；maxFloor=19 让 floor-19（19）刚好达成、floor-55 是 34%。
    const state = createAchievements();
    const rows = achievementEntries(state, facts({ kills: 499, maxFloor: 20 }));
    const near = nearestAchievement(rows);
    expect(near).not.toBeNull();
    const ratio = (near?.progress ?? 0) / (near?.target ?? 1);
    for (const row of rows) {
      if (row.unlocked) continue;
      expect(ratio).toBeGreaterThanOrEqual(row.progress / Math.max(1, row.target));
    }
  });

  it('全部达成后返回 null', () => {
    // 直接用 id 列表造「全解锁」，不靠 facts 推 —— 后者要跟每个 def 的阈值对齐，
    // 阈值一改测试就假红（D128 同族）。这里要测的是"没有未达成项时怎么办"。
    const all = sanitizeAchievements({ unlocked: IDS });
    const rows = achievementEntries(all, facts());
    expect(achievementSummary(all).got).toBe(ACHIEVEMENT_TOTAL);
    expect(nearestAchievement(rows)).toBeNull();
  });

  it('脏行（target=0）不产生 NaN 也不崩', () => {
    const rows = [
      { id: 'x', name: '假条目', desc: '', target: 0, progress: 0, reward: 0, unlocked: false },
    ] as unknown as Parameters<typeof nearestAchievement>[0];
    const near = nearestAchievement(rows);
    expect(near).not.toBeNull();
    expect(Number.isFinite(near?.progress ?? 0)).toBe(true);
  });

  it('已达成的不参与比较（进度比 100% 也不该被选中）', () => {
    const state = sanitizeAchievements({ unlocked: IDS.slice(0, 3) });
    const rows = achievementEntries(state, facts({ kills: 400 }));
    const near = nearestAchievement(rows);
    expect(near?.unlocked).toBe(false);
  });
});

describe('D208 面板画得出进度条', () => {
  function fakeCtx() {
    const texts: string[] = [];
    const rects: { x: number; y: number; w: number; h: number; fill: string }[] = [];
    let fillStyle = '';
    const ctx = {
      set fillStyle(v: string) {
        fillStyle = v;
      },
      get fillStyle() {
        return fillStyle;
      },
      strokeStyle: '',
      font: '',
      textAlign: 'left',
      textBaseline: 'middle',
      globalAlpha: 1,
      lineWidth: 1,
      fillRect: (x: number, y: number, w: number, h: number) => {
        rects.push({ x, y, w, h, fill: fillStyle });
      },
      strokeRect: () => {},
      fillText: (t: string) => {
        texts.push(t);
      },
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      save: () => {},
      restore: () => {},
      measureText: () => ({ width: 8 }),
    } as unknown as CanvasRenderingContext2D;
    return { ctx, texts, rects };
  }

  it('未达成行画了 3px 细条（底槽 + 填充），已达成行不画', () => {
    const { ctx, rects } = fakeCtx();
    const state = createAchievements();
    const f = facts({ kills: 250, maxFloor: 5 });
    drawAchievementPanel(ctx, state, f, 960, 540, -1);
    const bars = rects.filter((r) => r.h === 3);
    // 27 条里 25 条未达成（kills 250 还没到 500），每条一条底槽
    expect(bars.length).toBeGreaterThanOrEqual(ACHIEVEMENT_TOTAL - 3);
    // 至少有一条真的填了色（kills 250/500 = 50%）
    const filled = bars.filter((r) => r.fill === '#4fd1c5');
    expect(filled.length).toBeGreaterThan(0);
    for (const r of filled) {
      expect(r.w).toBeGreaterThan(0);
    }
  });

  it('页脚上方写出「最接近：…（还差 N）」', () => {
    const { ctx, texts } = fakeCtx();
    const state = createAchievements();
    drawAchievementPanel(ctx, state, facts({ kills: 250 }), 960, 540, -1);
    const near = texts.find((t) => t.startsWith('最接近：'));
    expect(near).toBeDefined();
    expect(near).toContain('还差');
    expect(near).not.toContain('NaN');
  });

  it('全部达成时不出「最接近」那一行（没有未达成的可写）', () => {
    const { ctx, texts } = fakeCtx();
    const all = sanitizeAchievements({ unlocked: IDS });
    drawAchievementPanel(ctx, all, facts(), 960, 540, -1);
    expect(texts.some((t) => t.startsWith('最接近：'))).toBe(false);
  });

  it('面板高度仍然装得进 540（加了一行 + 行高变大）', () => {
    expect(achievementPanelHeight()).toBeLessThan(540);
  });

  it('shortCount 在 27 行里不会吐出 NaN/undefined', () => {
    for (const a of ACHIEVEMENT_DEFS) {
      expect(shortCount(a.target)).not.toMatch(/NaN|undefined/);
      expect(shortCount(a.reward)).not.toMatch(/NaN|undefined/);
    }
  });
});
