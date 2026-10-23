// 无尽层下潜：层 28 曾经是硬天花板（ceshi FINDING 1）
//
// 根因：下潜判据里带了 `hasBossFloor(s.floor)`，而无尽层只有 30/35/40/45 有镇守
// → 层 28/29/31.. 永远没有镇守波 → 永远不满足下潜条件 → 层 29~46 不可达。
//
// 这组测试锁住三条：
// 1. 无尽区普通层（28，没有镇守）清完第 10 波也要下潜
// 2. 无尽区镇守层（30）清完第 10 波（=镇守波）也要下潜
// 3. 主线段行为不变：层 27 清完第 10 波（=镇守波）下潜到 28
import { describe, expect, it } from 'vitest';
import { BOSS_EVERY, createSession, startWave, tickSession } from '../src/core/session';
import { MAX_FLOOR } from '../src/data/monsters';

/** 把会话强行摆到 `floor` 的第 `BOSS_EVERY` 波刚开打的状态 */
function atFinalWave(floor: number) {
  const s = createSession({
    classId: 'yujian',
    seed: 2026,
    tables: { bases: [], affixes: [] },
    autoTalents: false,
  });
  s.floor = floor;
  s.maxFloorReached = floor;
  s.wave = BOSS_EVERY - 1;
  s.waveTimer = 0;
  s.battle.monsters = [];
  s.battle.reviveCooldown = 0;
  s.battle.deathCleanup = false;
  startWave(s);
  return s;
}

/** 清空场上所有怪（模拟「这一波打完了」），然后推进足够帧让 waveTimer 走完 WAVE_GAP */
function clearAndSettle(s: ReturnType<typeof atFinalWave>) {
  s.battle.monsters = [];
  s.battle.reviveCooldown = 0;
  s.battle.deathCleanup = false;
  for (let i = 0; i < 120; i++) tickSession(s, 1 / 60);
}

describe('无尽层下潜', () => {
  it('层 28（无尽区、无镇守）清完第 10 波会下潜到 29', () => {
    const s = atFinalWave(28);
    expect(s.wave).toBe(BOSS_EVERY);
    // 层 28 不是镇守层，这一波应该是普通怪
    expect(s.battle.monsters.length).toBeGreaterThan(0);
    clearAndSettle(s);
    expect(s.floor).toBe(29);
    expect(s.maxFloorReached).toBe(29);
  });

  it('层 30（无尽区、镇守层）清完第 10 波会下潜到 31', () => {
    const s = atFinalWave(30);
    expect(s.battle.monsters.length).toBe(1);
    expect(s.battle.monsters[0].rarity).toBe('boss');
    clearAndSettle(s);
    expect(s.floor).toBe(31);
  });

  it('主线段行为不变：层 27 清完第 10 波（镇守波）下潜到 28', () => {
    const s = atFinalWave(27);
    expect(s.battle.monsters.length).toBe(1);
    expect(s.battle.monsters[0].rarity).toBe('boss');
    clearAndSettle(s);
    expect(s.floor).toBe(28);
  });

  it('层 46（MAX_FLOOR）不再下潜，波次继续推进', () => {
    const s = atFinalWave(MAX_FLOOR);
    expect(s.wave).toBe(BOSS_EVERY);
    clearAndSettle(s);
    expect(s.floor).toBe(MAX_FLOOR);
    expect(s.wave).toBeGreaterThan(BOSS_EVERY);
  });

  // 波次是**全局计数器**（跨层不清零，下潜后 startWave 只是 +1），所以「这一层的最后一波」
  // 永远是下一个 BOSS_EVERY 的整数倍。
  function clearNextFinalWave(s: ReturnType<typeof atFinalWave>) {
    const next = (Math.floor(s.wave / BOSS_EVERY) + 1) * BOSS_EVERY;
    s.wave = next - 1;
    s.battle.monsters = [];
    s.battle.reviveCooldown = 0;
    s.battle.deathCleanup = false;
    startWave(s);
    clearAndSettle(s);
  }

  it('一路从 28 推到 32：每层 10 波都真的下潜（不是只在 28 修好）', () => {
    const s = atFinalWave(28);
    clearAndSettle(s);
    expect(s.floor).toBe(29);
    for (let f = 30; f <= 32; f++) {
      clearNextFinalWave(s);
      expect(s.floor).toBe(f);
    }
    expect(s.maxFloorReached).toBe(32);
  });
});
