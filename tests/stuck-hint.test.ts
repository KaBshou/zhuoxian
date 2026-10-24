import { describe, expect, it } from 'vitest';
import {
  createSession,
  maybeStuckHint,
  STUCK_HINT_SECONDS,
  tickSession,
} from '../src/core/session';
import { ITEM_BASES } from '../src/data/bases';
import { AFFIXES } from '../src/data/affixes';

/**
 * D205：两件事。
 *
 * 1. `floorMinutes` 之前只声明、从没累加过（注释说它算「本层真实击杀率」，
 *    但没人喂它 ⇒ 永远是 0，任何读它的诊断都在读假数）。这是死通道家族的新成员：
 *    **不是没人读，是没人写**。
 * 2. 同一层泡太久时给一次「往哪走」的提示 —— 挂机玩家不会自己去发现「原来能回刷」。
 */

const TABLES = { bases: ITEM_BASES, affixes: AFFIXES };
const make = () => createSession({ classId: 'yujian', seed: 2026, tables: TABLES });

describe('D205 floorMinutes 真的在累加', () => {
  it('跑 3 秒，floorMinutes 与 playedSeconds 同口径增长', () => {
    const s = make();
    for (let i = 0; i < 90; i += 1) tickSession(s, 1 / 30);
    expect(s.floorMinutes).toBeGreaterThan(2.9);
    expect(s.floorMinutes).toBeLessThan(3.1);
    expect(Math.abs(s.floorMinutes - s.playedSeconds)).toBeLessThan(0.05);
  });

  it('脏 dt 不污染（NaN / 超大 dt）', () => {
    const s = make();
    tickSession(s, Number.NaN);
    tickSession(s, 10);
    expect(Number.isFinite(s.floorMinutes)).toBe(true);
    expect(s.floorMinutes).toBeLessThanOrEqual(0.25 + 0.001);
  });

  it('换层清零（回刷浅层时不该带着上一层的分钟数）', () => {
    const s = make();
    for (let i = 0; i < 300; i += 1) tickSession(s, 1 / 30);
    expect(s.floorMinutes).toBeGreaterThan(9);
    // 直接构造：把最深推进到 5 层再回刷
    s.maxFloorReached = 5;
    s.floor = 5;
    s.floorMinutes = 0;
    tickSession(s, 1 / 30);
    expect(s.floorMinutes).toBeLessThan(0.1);
  });
});

describe('D205 卡住了给一次提示', () => {
  it('没到阈值不出声', () => {
    const s = make();
    s.floorMinutes = STUCK_HINT_SECONDS - 5;
    maybeStuckHint(s);
    expect(s.log.some((l) => l.text.includes('泡了'))).toBe(false);
    expect(s.stuckHintFloor).toBeUndefined();
  });

  it('到了阈值给一次，且同一层不重复给', () => {
    const s = make();
    s.floorMinutes = STUCK_HINT_SECONDS + 1;
    maybeStuckHint(s);
    const hits = s.log.filter((l) => l.text.includes('泡了'));
    expect(hits).toHaveLength(1);
    expect(hits[0]?.text).toContain('P 回浅层');
    expect(hits[0]?.text).toContain('H 看操作');
    maybeStuckHint(s);
    expect(s.log.filter((l) => l.text.includes('泡了'))).toHaveLength(1);
  });

  it('换到新的一层之后可以再提示一次（每层各一次）', () => {
    const s = make();
    s.floorMinutes = STUCK_HINT_SECONDS + 1;
    maybeStuckHint(s);
    s.floor = 7;
    s.floorMinutes = STUCK_HINT_SECONDS + 1;
    maybeStuckHint(s);
    expect(s.log.filter((l) => l.text.includes('泡了'))).toHaveLength(2);
    expect(s.stuckHintFloor).toBe(7);
  });

  it('复活冷却里不提示（别在人家被劝退时补刀）', () => {
    const s = make();
    s.floorMinutes = STUCK_HINT_SECONDS + 100;
    s.battle.reviveCooldown = 3;
    maybeStuckHint(s);
    expect(s.stuckHintFloor).toBeUndefined();
  });

  it('提示行是老实的灰字，不是总结式鼓励', () => {
    const s = make();
    s.floorMinutes = STUCK_HINT_SECONDS + 1;
    maybeStuckHint(s);
    const line = s.log.find((l) => l.text.includes('泡了'));
    expect(line?.color).toBe('#6d665c');
    expect(line?.text).not.toContain('加油');
  });
});
