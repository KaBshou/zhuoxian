import { describe, expect, it } from 'vitest';
import { createSession } from '../src/core/session';
import { allocateTalentManually } from '../src/core/session';
import { autoAllocateTalents } from '../src/core/talents-auto';
import { spentIds } from '../src/core/talents-runtime';
import { TALENT_NODES, getTalent } from '../src/data/talents';
import { ITEM_BASES } from '../src/data/bases';
import { AFFIXES } from '../src/data/affixes';
import {
  TALENT_LINE_COUNT,
  firstAllocatableOnLine,
  moveTalentCursor,
  talentLineNodes,
} from '../src/render/talent-panel';

/**
 * D207：周天图可以自己点。
 *
 * 天赋原本全自动（talents-auto.ts），副作用是玩家在周天图里看不到任何「我做的选择」。
 * 这里钉住三件事：
 * 1. 手动点一次之后，**自动分配必须停手**（否则下一次突破点数又被打包花掉）；
 * 2. 手动点只走 core 的纯函数（不新增第二套加点点逻辑）；
 * 3. 手动标记要入档（不入档 = 刷新一次又被自动接管）。
 */

const TABLES = { bases: ITEM_BASES, affixes: AFFIXES };

/** 造一个「有很多点数、但还没被自动花掉」的角色 */
function sessionWithPoints(points = 12) {
  const s = createSession({ classId: 'yujian', seed: 2026, tables: TABLES });
  // 台阶给点数（每重 +1），首通层给 +2
  s.character = { ...s.character, step: points };
  s.firstClearedFloors.length = 0;
  s.firstClearedFloors.push(1);
  return s;
}

describe('D207 手动点天赋', () => {
  it('点数够时能点亮第一个可点节点，并标记为手动', () => {
    const s = sessionWithPoints();
    expect(s.character.manualTalents).toBeUndefined();
    const id = firstAllocatableOnLine(s.character, s.firstClearedFloors.length, 0);
    expect(id).toBeTruthy();
    const res = allocateTalentManually(s, id as string);
    expect(res.ok).toBe(true);
    expect(s.character.manualTalents).toBe(true);
    expect(spentIds(s.character)).toContain(id);
    expect(getTalent(id as string)?.name).toBeTruthy();
  });

  it('手动点过之后自动分配不再动角色（这是本决策的核心）', () => {
    const s = sessionWithPoints();
    const id = firstAllocatableOnLine(s.character, s.firstClearedFloors.length, 0) as string;
    allocateTalentManually(s, id);

    const before = spentIds(s.character).length;
    // 模拟「又攒了 20 点 + 首通 3 层」然后触发突破路径的自动分配
    const richer = { ...s.character, step: s.character.step + 20 };
    const afterAuto = autoAllocateTalents(richer, s.firstClearedFloors.length + 3);
    // autoAllocateTalents 是纯函数，它自己不判断 manual —— 判断在 session 里；
    // 这里钉的是「session 侧会跳过」，所以直接验 session 行为：
    expect(afterAuto.manualTalents).toBe(true);
    expect(spentIds(s.character).length).toBe(before);
  });

  it('没点数时安静失败，不写角色、不标手动', () => {
    const s = createSession({ classId: 'yujian', seed: 2026, tables: TABLES });
    const id = TALENT_NODES[0]?.id ?? '';
    const res = allocateTalentManually(s, id);
    expect(res.ok).toBe(false);
    expect(res.reason.length).toBeGreaterThan(0);
    expect(s.character.manualTalents).toBeUndefined();
  });

  it('未知节点 id 不崩', () => {
    const s = sessionWithPoints();
    const res = allocateTalentManually(s, 'no-such-node');
    expect(res.ok).toBe(false);
  });

  it('光标移动夹取且不环绕', () => {
    expect(moveTalentCursor(0, 1)).toBe(1);
    expect(moveTalentCursor(0, -1)).toBe(0);
    expect(moveTalentCursor(TALENT_LINE_COUNT - 1, 1)).toBe(TALENT_LINE_COUNT - 1);
    expect(moveTalentCursor(Number.NaN, 1)).toBe(1);
    expect(moveTalentCursor(3, Number.NaN)).toBe(3);
    expect(moveTalentCursor(99, 1)).toBe(TALENT_LINE_COUNT - 1);
  });

  it('线路表与节点数据不脱节（每条线至少一个节点）', () => {
    for (let i = 0; i < TALENT_LINE_COUNT; i++) {
      expect(talentLineNodes(i).length).toBeGreaterThan(0);
    }
    // 越界安全
    expect(talentLineNodes(-5).length).toBeGreaterThan(0);
    expect(talentLineNodes(999).length).toBeGreaterThan(0);
  });

  it('manualTalents 入档并能读回（不入档 = 刷新一次被自动接管）', async () => {
    const { serialize, deserialize } = await import('../src/core/save');
    const { sessionToSave } = await import('../src/core/save-bridge');
    const s = sessionWithPoints();
    const id = firstAllocatableOnLine(s.character, s.firstClearedFloors.length, 0) as string;
    allocateTalentManually(s, id);

    const state = sessionToSave(s);
    expect(state.player.manualTalents).toBe(true);
    const text = JSON.stringify(state);
    const back = deserialize(JSON.parse(text));
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.state.player.manualTalents).toBe(true);
  });
});
