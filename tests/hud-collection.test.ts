import { describe, expect, it } from 'vitest';
import { createSession } from '../src/core/session';
import { AFFIXES } from '../src/data/affixes';
import { ITEM_BASES } from '../src/data/bases';
import { ACHIEVEMENT_TOTAL } from '../src/data/achievements';
import { CODEX_TOTAL, createCodex, recordMonsterKill } from '../src/core/codex';
import { createAchievements, unlockAchievements } from '../src/core/achievement';
import { EMPTY_FACTS } from '../src/data/achievements';
import { drawHudStack } from '../src/render/hud-panels';

/**
 * D195：HUD 右列状态面板要有「收集」一行（图鉴 x/34　成就 y/28）。
 *
 * 这一行存在的理由不是好看，是**让两个系统存在**：图鉴与成就各有一块面板，
 * 但没有任何地方告诉玩家它们存在、现在几成。挂机游戏里「还差几个」比「有几个」
 * 更能驱动，所以两个分母都必须写出来。
 *
 * 断的是调用参数（不渲染真画布）：`drawHudStack` 内部把 `Line[]` 交给 `drawPanel`，
 * 这里用假 ctx 记录 `fillText` 的所有文本，从文本里找关键字。
 */

const TABLES = { bases: ITEM_BASES, affixes: AFFIXES };

interface FakeCtx {
  fillText: (text: string, x: number, y: number) => void;
  texts: string[];
  [key: string]: unknown;
}

/** 只会记录文字的假上下文：够 drawHudStack 走完所有分支即可。 */
function fakeCtx(): FakeCtx {
  const texts: string[] = [];
  const noop = () => undefined;
  const ctx: FakeCtx = {
    texts,
    fillText: (text: string) => {
      texts.push(String(text));
    },
  };
  // 面板绘制会摸到这些属性/方法；不实现就会在第一次赋值处崩。
  const stub = {
    canvas: { width: 960, height: 540 },
    save: noop,
    restore: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    rect: noop,
    arc: noop,
    fill: noop,
    stroke: noop,
    fillRect: noop,
    strokeRect: noop,
    clearRect: noop,
    measureText: () => ({ width: 0 }),
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    setLineDash: noop,
    clip: noop,
    translate: noop,
    scale: noop,
    rotate: noop,
    drawImage: noop,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    shadowBlur: 0,
    shadowColor: '',
    roundRect: noop,
  };
  return Object.assign(ctx, stub);
}

function drawAndCollect(s: ReturnType<typeof createSession>): string[] {
  const ctx = fakeCtx() as unknown as CanvasRenderingContext2D;
  drawHudStack(ctx, s, 74);
  return (ctx as unknown as FakeCtx).texts;
}

describe('D195 HUD「收集」行', () => {
  it('新号（两个系统都是 0）也显示分母，让玩家知道它们存在', () => {
    const s = createSession({ classId: 'yujian', seed: 2026, tables: TABLES });
    const texts = drawAndCollect(s);
    const joined = texts.join('|');
    expect(joined).toContain('收集');
    expect(joined).toContain(`图鉴 0/${CODEX_TOTAL}`);
    expect(joined).toContain(`成就 0/${ACHIEVEMENT_TOTAL}`);
  });

  it('收集到东西后分子跟着涨（图鉴）', () => {
    const s = createSession({ classId: 'yujian', seed: 2026, tables: TABLES });
    s.codex = recordMonsterKill(createCodex(), 'fangshi-yuanke');
    const joined = drawAndCollect(s).join('|');
    expect(joined).toContain(`图鉴 1/${CODEX_TOTAL}`);
  });

  it('收集到东西后分子跟着涨（成就）', () => {
    const s = createSession({ classId: 'yujian', seed: 2026, tables: TABLES });
    s.achievements = unlockAchievements(createAchievements(), { ...EMPTY_FACTS, kills: 500 }).state;
    const joined = drawAndCollect(s).join('|');
    expect(joined).toContain('成就 1/');
  });

  it('分母来自数据表，不写死（加条目不用改渲染）', () => {
    const s = createSession({ classId: 'yujian', seed: 2026, tables: TABLES });
    const joined = drawAndCollect(s).join('|');
    expect(joined).toContain(String(CODEX_TOTAL));
    expect(joined).toContain(String(ACHIEVEMENT_TOTAL));
    // 两条分母都必须 > 0，否则说明有人把常量写成了 0
    expect(CODEX_TOTAL).toBeGreaterThan(0);
    expect(ACHIEVEMENT_TOTAL).toBeGreaterThan(0);
  });
});
