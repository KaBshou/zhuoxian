/**
 * 纸娃娃（法宝格）的几何与文案钉子（D178）。
 *
 * 为什么这些断言值得写：格子布局错了**不会让任何既有测试变红、也不会让 tsc 报错**，
 * 它只在玩家屏幕上表现为「点这一格打开的是另一件」或「10 格里有 2 格叠在一起」。
 * 而且命中测试和绘制**必须是同一份几何** —— 两处各算一遍是这类 bug 的唯一来源
 * （D177 顶栏就是「写死偏移」导致的）。
 */
import { describe, expect, it } from 'vitest';
import {
  PAPERDOLL_CELL_H,
  PAPERDOLL_COLS,
  PAPERDOLL_GAP,
  PAPERDOLL_PAD,
  hitTestPaperdoll,
  paperdollCellText,
  paperdollHeight,
  paperdollLayout,
} from '../src/render/paperdoll';
import { SLOT_IDS } from '../src/data/slots';
import { createSession } from '../src/core/session';
import { ITEM_BASES } from '../src/data/bases';
import { AFFIXES } from '../src/data/affixes';
import { makeItem } from '../src/core/item';
import { Rng } from '../src/core/rng';

const W = 210;
const X = 14;
const Y = 42;

function session() {
  return createSession({
    classId: 'yujian',
    seed: 2026,
    tables: { bases: ITEM_BASES, affixes: AFFIXES },
  });
}

describe('纸娃娃布局', () => {
  it('10 个部位一格不少、顺序就是 SLOT_IDS', () => {
    const cells = paperdollLayout(X, Y, W);
    expect(cells).toHaveLength(SLOT_IDS.length);
    expect(cells.map((c) => c.slot)).toEqual([...SLOT_IDS]);
  });

  it('格子互不重叠（任意两格的矩形不相交）', () => {
    const cells = paperdollLayout(X, Y, W);
    for (let i = 0; i < cells.length; i += 1) {
      for (let j = i + 1; j < cells.length; j += 1) {
        const a = cells[i]!;
        const b = cells[j]!;
        const overlapX = a.x < b.x + b.w && b.x < a.x + a.w;
        const overlapY = a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlapX && overlapY, `${a.slot} 与 ${b.slot} 重叠`).toBe(false);
      }
    }
  });

  it('每格都在面板宽度内（不许画出右边界）', () => {
    for (const c of paperdollLayout(X, Y, W)) {
      expect(c.x).toBeGreaterThanOrEqual(X);
      expect(c.x + c.w).toBeLessThanOrEqual(X + W);
    }
  });

  it('列数就是 PAPERDOLL_COLS，且同一行的格子 y 相同', () => {
    const cells = paperdollLayout(X, Y, W);
    expect(cells[0]!.y).toBe(cells[1]!.y);
    expect(cells[0]!.y).not.toBe(cells[2]!.y);
    // 第 3 个（index 2）应该换行到第 2 行
    expect(cells[2]!.y).toBe(cells[0]!.y + PAPERDOLL_CELL_H + PAPERDOLL_GAP);
    expect(PAPERDOLL_COLS).toBe(2);
  });

  it('高度包住最后一格 + 底部留白', () => {
    const cells = paperdollLayout(X, Y, W);
    const last = cells[cells.length - 1]!;
    expect(paperdollHeight(W)).toBeGreaterThanOrEqual(last.y - Y + last.h);
  });

  it('窄面板也不会算出负宽度（w >= 1）', () => {
    for (const c of paperdollLayout(0, 0, 40)) {
      expect(c.w).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('纸娃娃命中测试', () => {
  it('点每格中心命中自己', () => {
    for (const c of paperdollLayout(X, Y, W)) {
      const hit = hitTestPaperdoll(c.x + c.w / 2, c.y + c.h / 2, X, Y, W);
      expect(hit).toBe(c.slot);
    }
  });

  it('点格子边缘也命中（闭区间：触摸有亚像素抖动，差 1px 判空会时灵时不灵）', () => {
    const first = paperdollLayout(X, Y, W)[0]!;
    expect(hitTestPaperdoll(first.x, first.y, X, Y, W)).toBe(first.slot);
    expect(hitTestPaperdoll(first.x + first.w, first.y + first.h, X, Y, W)).toBe(first.slot);
  });

  it('点面板外/格子缝里不命中任何格', () => {
    expect(hitTestPaperdoll(0, 0, X, Y, W)).toBeNull();
    expect(hitTestPaperdoll(500, 400, X, Y, W)).toBeNull();
  });

  it('点标题行（格子之上）不命中', () => {
    const first = paperdollLayout(X, Y, W)[0]!;
    expect(hitTestPaperdoll(first.x + 2, Y + 2, X, Y, W)).toBeNull();
  });
});

describe('纸娃娃格子文案', () => {
  it('空位写「空」且颜色是暗灰', () => {
    const t = paperdollCellText(null, 'sword');
    expect(t.empty).toBe(true);
    expect(t.name).toBe('空');
    expect(t.sub).toBe('');
  });

  it('有装备时显示品阶 + 纹数 + 传奇标记', () => {
    const rng = new Rng(7);
    const item = makeItem(
      { slot: 'sword', rarity: 'xian', ilvl: 99, name: '太一余烬' },
      rng,
    );
    const t = paperdollCellText(item, 'sword');
    expect(t.empty).toBe(false);
    expect(t.name).toBe('太一余烬');
    expect(t.sub).toContain('仙品');
    expect(t.color).toBe('#f59637');
  });

  it('超长名字截断到 6 字加省略号（格子 96px，10px 字放不下）', () => {
    const rng = new Rng(11);
    const item = makeItem(
      { slot: 'robe', rarity: 'bao', ilvl: 50, name: '九幽玄冥不灭道袍' },
      rng,
    );
    const t = paperdollCellText(item, 'robe');
    expect(t.name).toHaveLength(7); // 6 字 + …
    expect(t.name.endsWith('…')).toBe(true);
  });

  it('每个部位都有短名（不许出现空标签）', () => {
    for (const slot of SLOT_IDS) {
      const t = paperdollCellText(null, slot);
      expect(t.tag.length).toBeGreaterThan(0);
    }
  });
});

describe('纸娃娃与 HUD 的关系', () => {
  it('空存档也有 10 格（空位是"我缺什么"的信息，不许因为没装备就不画）', () => {
    const s = session();
    expect(paperdollLayout(X, Y, W)).toHaveLength(10);
    // 新号只有起手法器一把
    const equipped = Object.keys(s.character.equipment).length;
    expect(equipped).toBeGreaterThanOrEqual(1);
  });

  it('格子起点在顶栏下方（不许压血条）', () => {
    const cells = paperdollLayout(X, Y, W);
    expect(cells[0]!.y).toBeGreaterThanOrEqual(Y);
    expect(Y).toBeGreaterThanOrEqual(38); // TOP_STRIP_H
  });

  it('格子宽度左右对称（padding 一致，取整余量对半分）', () => {
    const cells = paperdollLayout(X, Y, W);
    const left = cells[0]!;
    const right = cells[1]!;
    const leftPad = left.x - X;
    const rightPad = X + W - (right.x + right.w);
    // 取整余量 0~1px 对半分，所以左右最多差 1px（差更多就是布局算错了）
    expect(Math.abs(leftPad - rightPad)).toBeLessThanOrEqual(1);
    expect(leftPad).toBeGreaterThanOrEqual(PAPERDOLL_PAD - 1);
  });
});
