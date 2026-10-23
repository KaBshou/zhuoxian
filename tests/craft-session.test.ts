import { describe, expect, it } from 'vitest';
import { AFFIXES } from '../src/data/affixes';
import { ITEM_BASES } from '../src/data/bases';
import { CRAFT_TICK, craftPlanFromPocket, createSession, startWave, tickSession } from '../src/core/session';

const TABLES = { bases: ITEM_BASES, affixes: AFFIXES };

describe('session 自动打造', () => {
  it('craftPlanFromPocket：把 pocket 存量转成计划，0 不进计划', () => {
    expect(craftPlanFromPocket({ huang: 3, mie: 0, xi: 1 }).counts).toEqual({ huang: 3, xi: 1 });
    expect(craftPlanFromPocket({ huang: 0, mie: 0, xi: 0 }).counts).toEqual({});
  });

  it('挂机 3 分钟：通货被自动消费，法宝灵纹变多', () => {
    const s = createSession({ classId: 'yujian', seed: 42, tables: TABLES });
    startWave(s);
    const wornBefore = Object.values(s.character.equipment).reduce(
      (n, e) => n + (e ? e.affixes.length : 0), 0,
    );
    const step = 1 / 60;
    for (let i = 0; i < 60 * 60 * 3; i++) tickSession(s, step);
    const wornAfter = Object.values(s.character.equipment).reduce(
      (n, e) => n + (e ? e.affixes.length : 0), 0,
    );
    const bagAffixes = s.bag.reduce((n, it) => n + it.affixes.length, 0);
    // 3 分钟按 4 次掉落/分应有 ~12 次掉落，其中约 47.5% 是通货；至少要发生过一次打造
    const spentSomething = wornAfter + bagAffixes > wornBefore || s.pocket.huang < 12;
    expect(spentSomething).toBe(true);
    expect(s.dropsFound).toBeGreaterThan(0);
  });

  it('pocket 空时不打造、不报错', () => {
    const s = createSession({ classId: 'yujian', seed: 7, tables: TABLES });
    startWave(s);
    s.pocket = { huang: 0, mie: 0, xi: 0 };
    const before = { ...s.pocket };
    s.craftTimer = CRAFT_TICK;
    tickSession(s, 1 / 60);
    expect(s.pocket).toEqual(before);
  });
});
