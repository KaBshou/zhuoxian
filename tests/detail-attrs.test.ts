import { describe, expect, it } from 'vitest';
import { createSession } from '../src/core/session';
import { characterStats } from '../src/core/character';
import { ITEM_BASES } from '../src/data/bases';
import { AFFIXES } from '../src/data/affixes';
import { drawEquipmentDetail } from '../src/render/detail-panels';
import { equipmentSummary } from '../src/core/inventory';

/**
 * D206：详情面板底部要有「角色属性」两行。
 *
 * 这是个 build 游戏，但在此之前玩家唯一能看到自己属性的地方是「战力」一个数 ——
 * 想算「我多少伤害 / 破绽 / 抗性」只能拿纸自己加。看不见的属性等于不存在的属性。
 *
 * 断「画了哪些字」而不是「像素长什么样」：改字号/间距不会假红，漏画一行会立刻红。
 */

const TABLES = { bases: ITEM_BASES, affixes: AFFIXES };

function fakeCtx() {
  const texts: string[] = [];
  const ctx = {
    fillStyle: '',
    textAlign: 'left',
    font: '',
    lineWidth: 1,
    strokeStyle: '',
    fillText: (t: string) => {
      texts.push(String(t));
    },
    fillRect: () => {},
    strokeRect: () => {},
    measureText: (t: string) => ({ width: t.length * 6 }),
    save: () => {},
    restore: () => {},
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts };
}

const make = () => createSession({ classId: 'yujian', seed: 2026, tables: TABLES });

describe('D206 详情面板的属性汇总', () => {
  it('开局只有起手法器时也能画出来（不靠装备数量）', () => {
    const s = make();
    expect(equipmentSummary(s.character).length).toBeGreaterThan(0);
    const { ctx, texts } = fakeCtx();
    expect(drawEquipmentDetail(ctx, s)).toBe(true);
    expect(texts.length).toBeGreaterThan(3);
  });

  it('底部两行分别有生存属性与输出/抗性属性', () => {
    const s = make();
    const { ctx, texts } = fakeCtx();
    drawEquipmentDetail(ctx, s);
    const line1 = texts.find((t) => t.startsWith('气血')) ?? '';
    const line2 = texts.find((t) => t.startsWith('伤害')) ?? '';
    expect(line1).toContain('护体');
    expect(line1).toContain('罡气');
    expect(line1).toContain('真元');
    expect(line2).toContain('破绽');
    expect(line2).toContain('抗性');
  });

  it('数字来自 characterStats（不另算一遍）：气血与 core 同值', () => {
    const s = make();
    const st = characterStats(s.character);
    const { ctx, texts } = fakeCtx();
    drawEquipmentDetail(ctx, s);
    const line1 = texts.find((t) => t.startsWith('气血')) ?? '';
    expect(line1).toContain(`气血 ${Math.round(st.life)}`);
    expect(line1).toContain(`护体 ${Math.round(st.armor)}`);
  });

  it('关闭提示还在（挪到了标题行右侧，但没消失）', () => {
    const s = make();
    const { ctx, texts } = fakeCtx();
    drawEquipmentDetail(ctx, s);
    expect(texts).toContain('按 E 关闭');
  });
});
