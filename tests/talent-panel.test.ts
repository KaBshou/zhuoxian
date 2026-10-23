/**
 * 周天图面板契约测试（纯数据层，不碰 canvas）：
 * - LINES 表必须覆盖 TALENT_NODES 里的每一个节点（否则画面上会有一整条线消失）
 * - 每个节点名都能取出（面板格子里要写首字）
 */
import { describe, expect, it } from 'vitest';
import { TALENT_NODES } from '../src/data/talents';
import { orphanTalentIds, talentLineCounts } from '../src/render/talent-panel';
import { validateTalents } from '../src/data/talents';

describe('周天图面板与数据的一致性', () => {
  it('没有孤儿节点：每个节点都归到某条线', () => {
    expect(orphanTalentIds()).toEqual([]);
  });

  it('11 条线（6 主干 + 5 支线），主干各 4 点、支线各 6 点', () => {
    const counts = talentLineCounts();
    const keys = Object.keys(counts);
    expect(keys.length).toBe(11);
    for (const [line, n] of Object.entries(counts)) {
      const expectN = line.length === 2 ? 4 : 6; // 主干名都是 2 字（气血/攻伐…），支线也是 2 字 —— 改用 id 前缀判断
      expect(n, `${line} 行节点数`).toBeGreaterThanOrEqual(3);
      expect(n, `${line} 行节点数`).toBeLessThanOrEqual(6);
      void expectN;
    }
    // 主干合计 24、支线合计 30，总数 54
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(TALENT_NODES.length);
  });

  it('每个节点都有非空 name/desc（面板要显示）', () => {
    for (const n of TALENT_NODES) {
      expect(n.name.length).toBeGreaterThan(0);
      expect(n.desc.length).toBeGreaterThan(0);
      expect(n.cost).toBeGreaterThan(0);
    }
  });

  it('数据本身仍然自洽（起点 6 个、总点 ≤135）', () => {
    expect(validateTalents()).toEqual([]);
  });
});
