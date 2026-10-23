/**
 * 秘境图单测（D185）。
 *
 * 为什么值得独立测：这个面板是「76 个可点区域 → 76 个跳层动作」的映射，
 * 布局与命中只要差一格，玩家就会「点第 12 层去了第 13 层」——而这类错没有任何
 * 报错，只会让玩家觉得「这游戏乱跳」。所以几何与状态两条都钉死。
 */
import { describe, expect, it } from 'vitest';
import { AFFIXES } from '../src/data/affixes';
import { ITEM_BASES } from '../src/data/bases';
import { MAX_FLOOR } from '../src/data/monsters';
import { createSession, floorSelectableMax, setFloor } from '../src/core/session';
import {
  FLOOR_CELL_H,
  FLOOR_CELL_W,
  FLOOR_MAP_COLS,
  floorCellState,
  floorMapHeight,
  floorMapLayout,
  floorMapWidth,
  hitTestFloorMap,
} from '../src/render/floor-map';

const TABLES = { bases: ITEM_BASES, affixes: AFFIXES };
const ORIGIN_X = 180;
const ORIGIN_Y = 40;

function makeSession() {
  return createSession({ classId: 'yujian', seed: 2026, tables: TABLES });
}

describe('秘境图：几何', () => {
  it('格子数等于层数（1~MAX_FLOOR），编号连续不缺不重', () => {
    const cells = floorMapLayout(ORIGIN_X, ORIGIN_Y);
    expect(cells).toHaveLength(MAX_FLOOR);
    expect(cells.map((c) => c.floor)).toEqual(Array.from({ length: MAX_FLOOR }, (_, i) => i + 1));
  });

  it('每行 10 格，第 11 格换行', () => {
    const cells = floorMapLayout(ORIGIN_X, ORIGIN_Y);
    expect(cells[0].y).toBe(cells[FLOOR_MAP_COLS - 1].y);
    expect(cells[FLOOR_MAP_COLS].y).toBeGreaterThan(cells[0].y);
    expect(cells[0].x).toBe(ORIGIN_X + 16);
  });

  it('任意两格矩形不相交（重叠 = 点哪层都可能跳到邻居）', () => {
    const cells = floorMapLayout(ORIGIN_X, ORIGIN_Y);
    for (let i = 0; i < cells.length; i += 1) {
      for (let j = i + 1; j < cells.length; j += 1) {
        const a = cells[i];
        const b = cells[j];
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap, `${a.floor} 与 ${b.floor} 重叠`).toBe(false);
      }
    }
  });

  it('面板尺寸包得住所有格子（不留半格）', () => {
    const cells = floorMapLayout(ORIGIN_X, ORIGIN_Y);
    const last = cells[cells.length - 1];
    expect(last.x + last.w).toBeLessThanOrEqual(ORIGIN_X + floorMapWidth());
    expect(last.y + last.h).toBeLessThanOrEqual(ORIGIN_Y + floorMapHeight());
    expect(FLOOR_CELL_W).toBeGreaterThan(20);
    expect(FLOOR_CELL_H).toBeGreaterThan(16);
  });

  it('点每格中心命中自己（76 格全覆盖，闭区间）', () => {
    const cells = floorMapLayout(ORIGIN_X, ORIGIN_Y);
    for (const c of cells) {
      expect(hitTestFloorMap(c.x + c.w / 2, c.y + c.h / 2, ORIGIN_X, ORIGIN_Y)).toBe(c.floor);
    }
  });

  it('点面板外与格缝命中 null', () => {
    expect(hitTestFloorMap(ORIGIN_X - 1, ORIGIN_Y, ORIGIN_X, ORIGIN_Y)).toBeNull();
    expect(hitTestFloorMap(ORIGIN_X + 2, ORIGIN_Y + 2, ORIGIN_X, ORIGIN_Y)).toBeNull(); // 左 padding 内
  });
});

describe('秘境图：状态', () => {
  it('新号：第 1 层是 current，其余全是 locked', () => {
    const s = makeSession();
    expect(floorCellState(1, s)).toBe('current');
    expect(floorCellState(2, s)).toBe('locked');
    expect(floorCellState(MAX_FLOOR, s)).toBe('locked');
  });

  it('走到第 5 层后：1~4 可前往、5 当前、6 锁着', () => {
    const s = makeSession();
    s.maxFloorReached = 5;
    s.floor = 5;
    expect(floorCellState(4, s)).toBe('reachable');
    expect(floorCellState(5, s)).toBe('current');
    expect(floorCellState(6, s)).toBe('locked');
  });

  it('已通关的层标记为 cleared（与可前往分开 —— 玩家回刷时要分清）', () => {
    const s = makeSession();
    s.maxFloorReached = 5;
    s.firstClearedFloors = [1, 2, 3];
    s.floor = 5;
    expect(floorCellState(2, s)).toBe('cleared');
    expect(floorCellState(4, s)).toBe('reachable');
  });

  it('回到浅层后，深层仍按「到过的最深」放行（D36-B 的 maxFloorReached 语义）', () => {
    const s = makeSession();
    s.maxFloorReached = 8;
    s.floor = 8;
    setFloor(s, 2);
    expect(s.floor).toBe(2);
    expect(floorSelectableMax(s)).toBeGreaterThanOrEqual(8);
    expect(floorCellState(8, s)).not.toBe('locked');
  });

  it('越界层号不会抛错，也不会被误判成可前往', () => {
    const s = makeSession();
    expect(floorCellState(0, s)).toBe('locked');
    expect(floorCellState(-3, s)).toBe('locked');
    expect(floorCellState(MAX_FLOOR + 10, s)).toBe('locked');
  });
});
