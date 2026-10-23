import { describe, expect, it } from 'vitest';

import { spawnMonster } from '../src/core/battle';
import { AFFIXES } from '../src/data/affixes';
import { ITEM_BASES } from '../src/data/bases';
import {
  CYCLE_DMG_MUL,
  CYCLE_HP_MUL,
  CYCLE_MARKS_PER,
  CYCLE_SOFT_CAP,
  clampCycle,
  cycleDmgMul,
  effectiveCycle,
  cycleHpMul,
  cycleMarksMul,
  cycleName,
} from '../src/data/cycles';
import { getMonster, MAX_FLOOR } from '../src/data/monsters';
import { TOTAL_STEPS } from '../src/core/progression';
import { createSession, prestige, prestigeReady, tickSession } from '../src/core/session';
import { sessionFromSave, sessionToSave } from '../src/core/save-bridge';

/**
 * 周目 v1（D36-A / D130）。
 *
 * 这是全项目**唯一不可撤销**的玩家操作，所以测试钉的不是「数字好不好」，
 * 而是三件更容易错的事：
 * 1. 倍率曲线（乘方 vs 线性）—— 写反了没人看得出来，只有实测会抖；
 * 2. 轮回「保留什么 / 重置什么」—— 漏掉一个字段就是静默丢玩家资产；
 * 3. 存档往返 —— 周目号不入档，刷新就等于回到初临（`marks` 那次事故的同族）。
 *
 * 一条口径提醒：**周目只乘怪、不乘玩家**，也不给修为（满级后修为只能换渊痕）。
 */
const TABLES = { bases: ITEM_BASES, affixes: AFFIXES };

function fresh(cycle = 0) {
  return createSession({ classId: 'yujian', seed: 2026, tables: TABLES, cycle });
}

function maxedSession() {
  const s = fresh();
  s.character = { ...s.character, step: TOTAL_STEPS - 1, marks: 123_456 };
  return s;
}

describe('周目曲线', () => {
  it('怪物倍率是乘方：第 0 周目恒等，第 1 周目 = 常量', () => {
    expect(cycleHpMul(0)).toBe(1);
    expect(cycleDmgMul(0)).toBe(1);
    expect(cycleHpMul(1)).toBeCloseTo(CYCLE_HP_MUL, 10);
    expect(cycleDmgMul(1)).toBeCloseTo(CYCLE_DMG_MUL, 10);
    expect(cycleHpMul(2)).toBeCloseTo(CYCLE_HP_MUL * CYCLE_HP_MUL, 10);
  });

  it('渊痕倍率是线性（不是乘方）：第 N 周目 = 1 + N', () => {
    expect(cycleMarksMul(0)).toBe(1);
    expect(cycleMarksMul(1)).toBeCloseTo(1 + CYCLE_MARKS_PER, 10);
    expect(cycleMarksMul(3)).toBeCloseTo(1 + 3 * CYCLE_MARKS_PER, 10);
    // 线性与乘方在第 3 周目必须能区分开（写反时的哨兵）
    expect(cycleMarksMul(3)).not.toBeCloseTo(Math.pow(1 + CYCLE_MARKS_PER, 3), 2);
  });

  it('脏输入按第 0 周目（倍率恒等），不产生 NaN', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1, -99.5]) {
      expect(cycleHpMul(bad)).toBe(1);
      expect(cycleDmgMul(bad)).toBe(1);
      expect(cycleMarksMul(bad)).toBe(1);
    }
    expect(clampCycle(Number.NaN)).toBe(0);
    expect(clampCycle('3')).toBe(0);
    expect(clampCycle(null)).toBe(0);
    expect(clampCycle(-2)).toBe(0);
    expect(clampCycle(2.9)).toBe(2);
    expect(clampCycle(9999)).toBe(CYCLE_SOFT_CAP);
  });

  it('显示名：0 = 初临，其余「第 N 周目」', () => {
    expect(cycleName(0)).toBe('初临');
    expect(cycleName(1)).toBe('第 1 周目');
    expect(cycleName(Number.NaN)).toBe('初临');
  });

  it('深层（渐入满）：周目越高气血越大，与曲线逐位吻合', () => {
    const def = getMonster('fangshi-yuanke');
    if (!def) throw new Error('数据表缺 fangshi-yuanke');
    // 层 20：fade = min(1, (20-9)/9) = 1 ⇒ effCycle = 周目数
    const m0 = spawnMonster(def, 20, 1, 0, 0, 'normal', [], 0);
    const m1 = spawnMonster(def, 20, 1, 0, 0, 'normal', [], 1);
    const m2 = spawnMonster(def, 20, 1, 0, 0, 'normal', [], 2);
    // 每只怪各自 round 一次，所以比曲线时容差 1 点（差 2 点以上就是曲线写错）
    expect(Math.abs(m1.maxHp - m0.maxHp * CYCLE_HP_MUL)).toBeLessThanOrEqual(1);
    expect(Math.abs(m2.maxHp - m0.maxHp * CYCLE_HP_MUL * CYCLE_HP_MUL)).toBeLessThanOrEqual(2);
  });

  it('攻不再吃周目（D134）：任何周目、任何层，攻伐倍率恒为 1', () => {
    const def = getMonster('fangshi-yuanke');
    if (!def) throw new Error('数据表缺 fangshi-yuanke');
    const base = spawnMonster(def, 20, 1, 0, 0, 'normal', [], 0);
    for (const cycle of [1, 2, 5, 20]) {
      const m = spawnMonster(def, 20, 1, 0, 0, 'normal', [], cycle);
      expect(m.damage).toBe(base.damage);
    }
    expect(CYCLE_DMG_MUL).toBe(1);
  });

  it('渐入（D135）：层 1~9 完全不吃周目倍率，层 14 吃一半，层 18+ 吃满', () => {
    const def = getMonster('fangshi-yuanke');
    if (!def) throw new Error('数据表缺 fangshi-yuanke');
    // 层 5：fade = 0 ⇒ 与第 0 周目完全一致（不然「轮回后在层 1 被打死」）
    const early0 = spawnMonster(def, 5, 1, 0, 0, 'normal', [], 0);
    const early1 = spawnMonster(def, 5, 1, 0, 0, 'normal', [], 1);
    expect(early1.maxHp).toBe(early0.maxHp);
    expect(effectiveCycle(1, 5)).toBe(0);
    expect(effectiveCycle(1, 9)).toBe(0);
    // 层 14：fade = 5/9
    expect(effectiveCycle(1, 14)).toBeCloseTo(5 / 9, 10);
    const mid = spawnMonster(def, 14, 1, 0, 0, 'normal', [], 1);
    const mid0 = spawnMonster(def, 14, 1, 0, 0, 'normal', [], 0);
    const expectMid = mid0.maxHp * Math.pow(CYCLE_HP_MUL, 5 / 9);
    expect(Math.abs(mid.maxHp - expectMid)).toBeLessThanOrEqual(1);
    // 层 18 与 20 都吃满
    expect(effectiveCycle(1, 18)).toBe(1);
    expect(effectiveCycle(2, 40)).toBe(2);
    // 脏层号安静归到「最浅」（fade 0），不产生 NaN
    expect(effectiveCycle(3, Number.NaN)).toBe(0);
  });

  it('默认参数等价于第 0 周目（向后兼容硬断言）', () => {
    const def = getMonster('fangshi-yuanke');
    if (!def) throw new Error('数据表缺 fangshi-yuanke');
    const a = spawnMonster(def, 9, 1, 0, 0);
    const b = spawnMonster(def, 9, 1, 0, 0, 'normal', [], 0);
    expect(a.maxHp).toBe(b.maxHp);
    expect(a.damage).toBe(b.damage);
  });
});

describe('轮回条件与代价', () => {
  it('未满级不能轮回，且不改变任何状态', () => {
    const s = fresh();
    expect(prestigeReady(s)).toBe(false);
    const before = { floor: s.floor, cycle: s.cycle, step: s.character.step };
    expect(prestige(s)).toBe(false);
    expect(s.floor).toBe(before.floor);
    expect(s.cycle).toBe(before.cycle);
    expect(s.character.step).toBe(before.step);
  });

  it('死亡冷却中不能轮回（避免在复活帧里重开一轮）', () => {
    const s = maxedSession();
    s.battle.reviveCooldown = 1;
    expect(prestigeReady(s)).toBe(false);
    s.battle.reviveCooldown = 0;
    expect(prestigeReady(s)).toBe(true);
  });

  it('满级后轮回：周目 +1、境界归零、回到第 1 层第 1 波', () => {
    const s = maxedSession();
    s.floor = 40;
    s.wave = 3;
    s.bag.push({ uid: 'x', name: '测试', slot: 'sword', rarity: 'fan', ilvl: 10, base: [], affixes: [] });
    expect(prestige(s)).toBe(true);
    expect(s.cycle).toBe(1);
    expect(s.character.step).toBe(0);
    expect(s.floor).toBe(1);
    expect(s.wave).toBe(1);
    expect(s.bag.length).toBe(0);
    expect(s.maxFloorReached).toBe(1);
    expect(s.firstClearedFloors.length).toBe(0);
  });

  it('轮回保留跨周目资产：渊痕 / 图鉴 / 成就 / 引导进度', () => {
    const s = maxedSession();
    s.codex = { monsters: ['fangshi-yuanke'], legendaries: [], variants: [] };
    s.achievements = { unlocked: ['kill-1'] };
    s.tutorialStep = 11;
    expect(prestige(s)).toBe(true);
    expect(s.character.marks).toBe(123_456);
    expect(s.codex.monsters).toContain('fangshi-yuanke');
    expect(s.achievements.unlocked).toContain('kill-1');
    expect(s.tutorialStep).toBe(11);
  });

  it('轮回后战斗态按新周目重建（怪更肉），且能继续跑帧不死锁', () => {
    const s = maxedSession();
    expect(prestige(s)).toBe(true);
    const hp0 = s.battle.monsters.reduce((n, m) => n + m.maxHp, 0);
    for (let i = 0; i < 30; i += 1) tickSession(s, 1 / 60);
    // 新周目的怪必须在场（第 1 波），且总量 > 0
    expect(s.battle.monsters.length).toBeGreaterThan(0);
    expect(hp0).toBeGreaterThan(0);
    expect(Number.isFinite(s.battle.player.hp)).toBe(true);
  });

  it('周目上限有防御（不会因为连点 N 变成天文数字）', () => {
    const s = maxedSession();
    s.cycle = CYCLE_SOFT_CAP;
    expect(prestige(s)).toBe(true);
    expect(s.cycle).toBeLessThanOrEqual(CYCLE_SOFT_CAP);
  });

  it('层 76 仍是当前内容的封顶（周目不清空「到过的层」这条内容边界）', () => {
    expect(MAX_FLOOR).toBe(76);
  });
});

describe('周目入档', () => {
  it('存档往返保留周目号', () => {
    const s = fresh(3);
    s.character = { ...s.character, marks: 9_999 };
    const save = sessionToSave(s);
    const t = sessionFromSave(save, { tables: TABLES });
    expect(t.cycle).toBe(3);
    expect(t.character.marks).toBe(9_999);
  });

  it('老档缺字段视为初临（不产生 NaN）', () => {
    const s = fresh();
    const save = sessionToSave(s);
    const progress = { ...save.progress } as Record<string, unknown>;
    delete progress.cycle;
    const t = sessionFromSave({ ...save, progress } as unknown as typeof save, { tables: TABLES });
    expect(t.cycle).toBe(0);
  });
});
