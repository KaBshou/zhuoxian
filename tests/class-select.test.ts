import { describe, expect, it } from 'vitest';
import { CLASSES, CLASS_IDS } from '../src/data/classes';
import { classCardRects, indexFromDigit, moveClassIndex } from '../src/render/class-select';

/**
 * 开局选道统的纯逻辑（D1：6 职业，开局选一个）。
 *
 * 只测「位置算得对、越界不炸、数字键映射对」——
 * 画不画得出来靠探针 probe-class 验（像素级），这里不假装能测渲染。
 */
describe('class-select 纯逻辑', () => {
  it('六个道统都有卡片位置，且互不重叠', () => {
    const rects = classCardRects(960, 540);
    expect(rects.length).toBe(CLASSES.length);
    expect(rects.length).toBe(6);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        const overlap =
          a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap, `${a.classId} 与 ${b.classId} 重叠`).toBe(false);
      }
    }
  });

  it('卡片顺序与 CLASSES 一致（渲染和选中的是同一份数据）', () => {
    const rects = classCardRects(960, 540);
    expect(rects.map((r) => r.classId)).toEqual([...CLASS_IDS]);
  });

  it('卡片全部落在画布内（不留半张卡在屏幕外）', () => {
    for (const [w, h] of [
      [960, 540],
      [1280, 720],
      [800, 600],
    ]) {
      for (const r of classCardRects(w, h)) {
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(w);
        expect(r.y + r.h).toBeLessThanOrEqual(h);
      }
    }
  });

  it('左右移动会回绕（末位右移回到第一位）', () => {
    expect(moveClassIndex(0, 1, 0)).toBe(1);
    expect(moveClassIndex(5, 1, 0)).toBe(0);
    expect(moveClassIndex(0, -1, 0)).toBe(5);
  });

  it('上下移动跨行（一行 3 张）', () => {
    expect(moveClassIndex(0, 0, 1)).toBe(3);
    expect(moveClassIndex(3, 0, -1)).toBe(0);
    // 下越界回绕到同列第一行
    expect(moveClassIndex(3, 0, 1)).toBe(0);
    expect(moveClassIndex(1, 0, 1)).toBe(4);
  });

  it('下标非法时回到 0、不返回负数', () => {
    expect(moveClassIndex(Number.NaN, 1, 0)).toBe(1);
    expect(moveClassIndex(-5, 1, 0)).toBe(1);
    expect(moveClassIndex(99, 0, 0)).toBe(5);
  });

  it('数字键 1..6 映射到下标 0..5，其余返回 null', () => {
    expect(indexFromDigit('Digit1')).toBe(0);
    expect(indexFromDigit('Digit6')).toBe(5);
    expect(indexFromDigit('Digit7')).toBeNull();
    expect(indexFromDigit('Digit0')).toBeNull();
    expect(indexFromDigit('KeyA')).toBeNull();
    expect(indexFromDigit('Enter')).toBeNull();
  });
});
