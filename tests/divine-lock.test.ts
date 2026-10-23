import { describe, expect, it } from 'vitest';

import { createSession, tickSession } from '../src/core/session';
import { spendMarks } from '../src/core/marks-runtime';
import { MARKS_COST } from '../src/data/marks';
import { sessionToSave, sessionFromSave } from '../src/core/save-bridge';
import { deserialize } from '../src/core/save';
import { AFFIXES } from '../src/data/affixes';
import { ITEM_BASES } from '../src/data/bases';

/**
 * D137 方案 d：定渊 = 一次性解锁「锁层挂机」，不是跳层。
 *
 * 背景：旧实现是「送到 highestFloorReached」，而 prestige() 把 maxFloorReached 重置成 1
 * ⇒ 新周目一开始就返回「已经在最深处（第 1 层）」，**一分钱花不出去**（实测携带 3000 万渊痕
 * 只花在夺造化/聚灵上，时长一动不动）。而「跳层」本身也不该存在：它买走时长，
 * 且全重置后从深层起跑等于自杀。
 */
const TABLES = { bases: ITEM_BASES, affixes: AFFIXES };

function fresh() {
  return createSession({ classId: 'yujian', seed: 4242, tables: TABLES });
}

function withMarks(n: number) {
  const s = fresh();
  s.character = { ...s.character, marks: n };
  return s;
}

/** 把状态摆成「第 10 波刚清完、马上要下潜」 */
function readyToDescend(floor: number, unlocked: boolean) {
  const s = fresh();
  s.maxFloorReached = floor;
  s.floor = floor;
  s.character = { ...s.character, diveLockUnlocked: unlocked };
  s.wave = 10;
  s.battle.monsters = [];
  s.battle.deathCleanup = false;
  s.waveTimer = 2;
  s.floorDeaths = 0;
  s.battle.floorDeaths = 0;
  return s;
}

describe('定渊（D137）：一次性解锁锁层挂机', () => {
  it('未解锁时花钱：扣 720k、置 unlocked、写日志', () => {
    const s = withMarks(MARKS_COST.setStartFloor + 5_000);
    const before = s.character.marks ?? 0;
    const r = spendMarks(s, 'setStartFloor');
    expect(r.ok).toBe(true);
    expect(s.character.diveLockUnlocked).toBe(true);
    expect(s.character.marks).toBe(before - MARKS_COST.setStartFloor);
    expect(s.log.some((l) => l.text.includes('定渊'))).toBe(true);
  });

  it('已经解锁后再点：不扣钱、返回 false（一次性永久）', () => {
    const s = withMarks(MARKS_COST.setStartFloor * 3);
    expect(spendMarks(s, 'setStartFloor').ok).toBe(true);
    const after = s.character.marks ?? 0;
    const again = spendMarks(s, 'setStartFloor');
    expect(again.ok).toBe(false);
    expect(s.character.marks).toBe(after);
    expect(again.reason ?? '').toContain('已开');
  });

  it('渊痕不够：不扣钱、不解锁', () => {
    const s = withMarks(MARKS_COST.setStartFloor - 1);
    const r = spendMarks(s, 'setStartFloor');
    expect(r.ok).toBe(false);
    expect(s.character.diveLockUnlocked).toBeFalsy();
    expect(s.character.marks).toBe(MARKS_COST.setStartFloor - 1);
  });

  it('不锁 = 照常下潜（回归：别把下潜整个关掉）', () => {
    const free = readyToDescend(20, true);
    tickSession(free, 0.02);
    expect(free.floor).toBe(21);
  });

  it('锁层 = 清完第 10 波不下潜，停在本层继续刷', () => {
    const locked = readyToDescend(20, true);
    locked.diveLock = true;
    tickSession(locked, 0.02);
    expect(locked.floor).toBe(20);
  });

  it('没开定渊时 diveLock 无效（不能让未解锁的玩家白嫖锁层）', () => {
    const s = readyToDescend(20, false);
    s.diveLock = true;
    tickSession(s, 0.02);
    expect(s.floor).toBe(21);
  });

  it('定渊解锁入档：刷新后还在（否则玩家每次刷新丢 720k）', () => {
    const s = withMarks(0);
    s.character = { ...s.character, diveLockUnlocked: true };
    const text = JSON.stringify(sessionToSave(s));
    expect(text).toContain('diveLockUnlocked');
    const back = deserialize(JSON.parse(text));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    const r = sessionFromSave(back.state, { tables: TABLES });
    expect(r.character.diveLockUnlocked).toBe(true);
  });

  it('老档没有这个字段：读回来是 false（不产生 undefined 漂移）', () => {
    const s = withMarks(0);
    const save = sessionToSave(s);
    const back = deserialize(JSON.parse(JSON.stringify(save)));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    const r = sessionFromSave(back.state, { tables: TABLES });
    expect(r.character.diveLockUnlocked).toBe(false);
  });
});
