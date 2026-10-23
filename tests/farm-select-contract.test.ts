/**
 * T2（`tools/run-timeline.mjs --farm=deepest|best`）所依赖的选层契约。
 *
 * 作者版 `tests/select-floor.test.ts` 已经覆盖了「回刷已到过的层、不许跳关」的规则；
 * 这里只补 T2 工具**直接依赖**的那三条契约，防止工具悄悄依赖一个会「静默夹取」的接口：
 *   1. 越界返回 false，且**不夹取**（s.floor 一动不动）——否则工具会以为挪层成功，统计全是假的
 *   2. 上限 = 曾到过的最深层，不会因为回刷而回退（否则「冻结在层 21」会越刷越浅）
 *   3. 永远选不到 MAX_FLOOR 之后（27 层模型的天花板）
 */
import { describe, expect, it } from 'vitest';

import {
  createSession,
  floorSelectableMax,
  highestFloorReached,
  setFloor,
  startWave,
} from '../src/core/session';
import { MAX_FLOOR } from '../src/data/monsters';
import { AFFIXES } from '../src/data/affixes';
import { ITEM_BASES } from '../src/data/bases';

const TABLES = { bases: ITEM_BASES, affixes: AFFIXES };

function makeSession(seed = 97531) {
  const s = createSession({ classId: 'yujian', seed, tables: TABLES, autoTalents: false });
  startWave(s);
  return s;
}

describe('选层契约（T2 farm 档依赖）', () => {
  it('越界不夹取：setFloor(上限+1) 返回 false 且层数不动', () => {
    const s = makeSession();
    s.floor = 21;
    s.maxFloorReached = 21;
    expect(floorSelectableMax(s)).toBe(21);
    expect(setFloor(s, 22)).toBe(false);
    expect(s.floor, '越界时被静默夹到 21 会让工具把「没挪成」记成「挪成了」').toBe(21);
  });

  it('回刷不降低上限：在层 2 农完，仍能选回曾到过的 21 层', () => {
    const s = makeSession();
    s.floor = 21;
    s.maxFloorReached = 21;
    expect(setFloor(s, 2)).toBe(true);
    expect(highestFloorReached(s), '回刷把上限拖回去的话，deepest 档会越刷越浅').toBe(21);
    expect(floorSelectableMax(s)).toBe(21);
    expect(setFloor(s, 21)).toBe(true);
  });

  it('天花板是 MAX_FLOOR：到过 27 之后也选不到 28', () => {
    const s = makeSession();
    s.floor = MAX_FLOOR;
    s.maxFloorReached = MAX_FLOOR;
    expect(floorSelectableMax(s)).toBe(MAX_FLOOR);
    expect(setFloor(s, MAX_FLOOR + 1)).toBe(false);
    expect(s.floor).toBe(MAX_FLOOR);
    // 已经在这层也返回 false（setFloor 的语义是「发生了挪层」），所以先退到 1 再回来验证天花板可用
    expect(setFloor(s, MAX_FLOOR)).toBe(false);
    expect(setFloor(s, 1)).toBe(true);
    expect(setFloor(s, MAX_FLOOR)).toBe(true);
  });
});
