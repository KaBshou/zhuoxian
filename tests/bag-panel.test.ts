/**
 * 背包面板（B）的几何与文案钉子。
 *
 * 为什么这些断言值钱：面板重叠、点不中、光标跑丢**都不会让 tsc 报错、也不会让任何
 * 既有测试变红**，只在玩家屏幕上表现成「点了没反应」或「高亮框跑到别人身上」。
 * D177 的顶栏重叠、D178 的纸娃娃点击、D185 的秘境图都是这么发现的。
 */
import { describe, expect, it } from 'vitest';
import {
  BAG_CELLS,
  BAG_COLS,
  BAG_DETAIL_W,
  BAG_PANEL_H,
  BAG_PANEL_W,
  bagCellText,
  bagCompareLines,
  bagGridLayout,
  bagPanelGeometry,
  clampBagIndex,
  hitTestBagGrid,
} from '../src/render/bag-panel';
import { BAG_CAPACITY } from '../src/core/inventory';
import type { Item } from '../src/core/item';

function fakeItem(over: Partial<Item> = {}): Item {
  return {
    uid: 'u1',
    slot: 'sword',
    rarity: 'ling',
    ilvl: 10,
    name: '青锋',
    base: [{ stat: 'damage', op: 'flat', value: 8 }],
    affixes: [],
    ...over,
  };
}

describe('背包面板几何', () => {
  it('格子数等于背包容量（40），否则最后几件永远看不见', () => {
    expect(BAG_CELLS).toBe(BAG_CAPACITY);
    expect(bagGridLayout(0, 0)).toHaveLength(BAG_CELLS);
  });

  it('格子编号连续且行优先', () => {
    const cells = bagGridLayout(100, 50);
    expect(cells.map((c) => c.index)).toEqual([...Array(BAG_CELLS).keys()]);
    // 第 0 格与第 8 格（第 2 行第 1 格）x 相同、y 更大
    expect(cells[0]!.x).toBe(cells[BAG_COLS]!.x);
    expect(cells[BAG_COLS]!.y).toBeGreaterThan(cells[0]!.y);
  });

  it('任意两格不重叠（重叠 = 玩家点到隔壁那件）', () => {
    const cells = bagGridLayout(10, 10);
    for (let i = 0; i < cells.length; i += 1) {
      for (let j = i + 1; j < cells.length; j += 1) {
        const a = cells[i]!;
        const b = cells[j]!;
        const apart =
          a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(apart).toBe(true);
      }
    }
  });

  it('面板装得下网格与详情列，且在 960x540 内', () => {
    const geo = bagPanelGeometry(960, 540);
    expect(BAG_PANEL_W).toBeLessThan(960);
    expect(BAG_PANEL_H).toBeLessThan(540);
    expect(geo.detailX + BAG_DETAIL_W).toBeLessThanOrEqual(geo.x + geo.w);
    const cells = bagGridLayout(geo.gridX, geo.gridY);
    const last = cells[cells.length - 1]!;
    expect(last.y + last.h).toBeLessThanOrEqual(geo.y + geo.h);
    expect(geo.x).toBeGreaterThanOrEqual(0);
    expect(geo.y).toBeGreaterThanOrEqual(0);
  });

  it('每格中心点都命中自己（闭区间，触屏点边缘也算）', () => {
    const geo = bagPanelGeometry(960, 540);
    for (const c of bagGridLayout(geo.gridX, geo.gridY)) {
      expect(hitTestBagGrid(c.x + c.w / 2, c.y + c.h / 2, geo)).toBe(c.index);
      expect(hitTestBagGrid(c.x, c.y, geo)).toBe(c.index);
      expect(hitTestBagGrid(c.x + c.w - 1, c.y + c.h - 1, geo)).toBe(c.index);
    }
  });

  it('面板外与格子缝判 null（不许把点击算到隔壁格）', () => {
    const geo = bagPanelGeometry(960, 540);
    expect(hitTestBagGrid(geo.x + 2, geo.y + 2, geo)).toBeNull();
    expect(hitTestBagGrid(geo.gridX + 64 + 2, geo.gridY + 4, geo)).toBeNull();
    expect(hitTestBagGrid(-5, -5, geo)).toBeNull();
  });

  it('光标夹取：脏值归 0、负数归 0、越界归最后一格', () => {
    expect(clampBagIndex(Number.NaN)).toBe(0);
    expect(clampBagIndex(-3)).toBe(0);
    expect(clampBagIndex(0)).toBe(0);
    expect(clampBagIndex(BAG_CELLS - 1)).toBe(BAG_CELLS - 1);
    expect(clampBagIndex(999)).toBe(BAG_CELLS - 1);
    expect(clampBagIndex(6.7)).toBe(6);
  });
});

describe('背包格文案', () => {
  it('空位不显示名字、没有颜色（靠暗底 + 暗框表达）', () => {
    const t = bagCellText(null);
    expect(t.empty).toBe(true);
    expect(t.name).toBe('');
  });

  it('有装备显示品阶与灵纹条数', () => {
    const t = bagCellText(fakeItem({ rarity: 'bao', affixes: [
      { defId: 'a', name: '锐', stat: 'damage', op: 'increased', value: 0.1 },
      { defId: 'b', name: '固', stat: 'armor', op: 'flat', value: 12 },
    ] }));
    expect(t.empty).toBe(false);
    expect(t.name).toBe('青锋');
    expect(t.sub).toContain('宝品');
    expect(t.sub).toContain('2纹');
  });

  it('对比行同时给「判据 C 的比值」与「换装后的战力差」—— 两个数回答两个问题', () => {
    const item = fakeItem();
    const lines = bagCompareLines(item, null);
    expect(lines[0]).toContain('战力比');
    expect(lines[1]).toContain('换装对比');
    expect(lines[1]).toContain('空位');
  });
});
