import { describe, expect, it } from 'vitest';

import { AFFIXES } from '../src/data/affixes';
import { ITEM_BASES } from '../src/data/bases';
import { AUTOSAVE_INTERVAL, Autosaver } from '../src/core/autosave';
import { createCharacter } from '../src/core/character';
import { OFFLINE_MAX_SECONDS, OFFLINE_OVERFLOW_RATE, applyOfflineGain, effectiveOfflineSeconds, killsPerMinute, offlineGainIsNoteworthy, simulateOffline } from '../src/core/offline';
import { Rng } from '../src/core/rng';
import { createSession, tickSession } from '../src/core/session';
import { SAVE_KEY, createMemoryAdapter } from '../src/core/storage';
import type { StorageAdapter } from '../src/core/storage';

const TABLES = { bases: ITEM_BASES, affixes: AFFIXES };

/** 模拟"写盘会抛异常"的适配器（Safari 无痕 / 配额满） */
function throwingAdapter(): StorageAdapter {
  return {
    read: () => null,
    write: () => {
      throw new Error('QuotaExceededError');
    },
    remove: () => {},
  };
}

function freshSession(seed = 12345) {
  return createSession({ classId: 'yujian', seed, tables: TABLES });
}

describe('离线收益 offline', () => {
  it('不足 60 秒不弹窗', () => {
    expect(offlineGainIsNoteworthy(59)).toBe(false);
    expect(offlineGainIsNoteworthy(60)).toBe(true);
    expect(offlineGainIsNoteworthy(Number.NaN)).toBe(false);
  });

  it('12 小时封顶，超出部分减半（不是归零）', () => {
    expect(effectiveOfflineSeconds(3600)).toBe(3600);
    expect(effectiveOfflineSeconds(OFFLINE_MAX_SECONDS)).toBe(OFFLINE_MAX_SECONDS);
    const over = OFFLINE_MAX_SECONDS + 3600;
    expect(effectiveOfflineSeconds(over)).toBeCloseTo(
      OFFLINE_MAX_SECONDS + 3600 * OFFLINE_OVERFLOW_RATE,
      6,
    );
    // 归零的话玩家挂两天反而比挂一天亏，那是错的
    expect(effectiveOfflineSeconds(over)).toBeGreaterThan(OFFLINE_MAX_SECONDS);
    expect(effectiveOfflineSeconds(-1)).toBe(0);
    expect(effectiveOfflineSeconds(Number.NaN)).toBe(0);
  });

  it('按层击杀率表：1~27 层都有值，越界钳到端点', () => {
    expect(killsPerMinute(1)).toBeCloseTo(14.6, 6);
    expect(killsPerMinute(27)).toBeCloseTo(14.4, 6);
    expect(killsPerMinute(0)).toBeCloseTo(14.6, 6);
    expect(killsPerMinute(999)).toBeCloseTo(14.4, 6);
  });

  it('同种子同秒数 → 完全相同的产出（防反复刷新读档刷装备）', () => {
    const a = simulateOffline(freshSession(), 3600, new Rng(777));
    const b = simulateOffline(freshSession(), 3600, new Rng(777));
    expect(a.kills).toBe(b.kills);
    expect(a.xp).toBe(b.xp);
    expect(a.items.length).toBe(b.items.length);
    expect(JSON.stringify(a.currency)).toBe(JSON.stringify(b.currency));
    expect(JSON.stringify(a.gems)).toBe(JSON.stringify(b.gems));
  });

  it('1 小时闭关：有击杀、有修为、三类掉落都在（份额与在线一致）', () => {
    const g = simulateOffline(freshSession(), 3600, new Rng(2026));
    expect(g.minutes).toBe(60);
    expect(g.capped).toBe(false);
    expect(g.kills).toBeGreaterThan(800); // 14.6/min × 60 ≈ 876
    expect(g.kills).toBeLessThan(950);
    expect(g.xp).toBeGreaterThan(0);
    const cur = Object.values(g.currency).reduce((a, b) => a + (b ?? 0), 0);
    const gems = Object.values(g.gems).reduce((a, b) => a + b, 0);
    // D46.1：**闸在分流之前** —— 先问「这一击掉不掉」（DROP_CHANCE.normal = 0.28），
    // 再问「掉哪一类」（通货 47.5% / 玉简 12.5% / 法宝 40%）。
    // 所以每杀平均只有 0.28 件物件，法宝份额 = 0.40 × 0.28 ≈ 11.2%。
    // 旧实现把分流放在闸前，通货/玉简各超发 3.57 倍（BALANCE §5.1 有反例注释）。
    const objects = cur + gems + g.items.length;
    expect(objects).toBeGreaterThan(g.kills * 0.22);
    expect(objects).toBeLessThan(g.kills * 0.34);
    const share = g.items.length / g.kills;
    expect(share).toBeGreaterThan(0.06);
    expect(share).toBeLessThan(0.18);
    // 通货份额 47.5% vs 法宝 40% → 通货略多于法宝，但不是压倒性的
    expect(cur).toBeGreaterThan(g.items.length);
    expect(cur).toBeLessThan(g.items.length * 2);
  });

  it('离线不推层：醒来还在同一层（否则睡一觉就通关了）', () => {
    const s = freshSession();
    const before = s.floor;
    const g = simulateOffline(s, 12 * 3600, new Rng(5));
    applyOfflineGain(s, g, (ch, n) => ({ ...ch, xp: ch.xp + n }), (ch, bag, item) => ({
      character: ch,
      bag: [...bag, item],
      message: '',
      equipped: false,
    }));
    expect(s.floor).toBe(before);
  });

  it('越过封顶也会结算（capped=true 且仍有收益）', () => {
    const g = simulateOffline(freshSession(), 3 * 24 * 3600, new Rng(9));
    expect(g.capped).toBe(true);
    expect(g.effectiveSeconds).toBeLessThan(3 * 24 * 3600);
    expect(g.kills).toBeGreaterThan(0);
  });

  it('applyOfflineGain 把修为/通货/玉简/法宝都并进去', () => {
    const s = freshSession();
    const g = simulateOffline(s, 3600, new Rng(31337));
    const xpBefore = s.character.xp;
    const bagBefore = s.bag.length;
    applyOfflineGain(
      s,
      g,
      (ch, n) => ({ ...ch, xp: ch.xp + n }),
      (ch, bag, item) => ({ character: ch, bag: [...bag, item], message: '', equipped: false }),
    );
    // 有突破也可能没有，总之"变了"
    expect(s.character.xp !== xpBefore || s.character.step > 0).toBe(true);
    expect(s.bag.length).toBeGreaterThanOrEqual(bagBefore);
    const cur = Object.values(s.pocket).reduce((a, b) => a + b, 0);
    const gems = Object.values(s.gemPouch).reduce((a, b) => a + b, 0);
    expect(cur + gems).toBeGreaterThan(0);
  });

  it('离线收益不该超过同时间长度的在线收益量级（防离线比在线肥）', () => {
    // 在线跑 5 分钟，对比离线 5 分钟：离线用闭式公式，允许 ±60% 偏差，但不能 5 倍
    const online = freshSession(808);
    for (let i = 0; i < 5 * 60 * 60; i++) tickSession(online, 1 / 60);
    const offline = simulateOffline(freshSession(808), 300, new Rng(808));
    const ratio = offline.kills / Math.max(1, online.battle.kills);
    expect(ratio).toBeLessThan(5);
    expect(ratio).toBeGreaterThan(0.2);
  });
});

describe('存储适配器 storage', () => {
  it('内存适配器读写删', () => {
    const a = createMemoryAdapter();
    expect(a.read(SAVE_KEY)).toBeNull();
    a.write(SAVE_KEY, '{"x":1}');
    expect(a.read(SAVE_KEY)).toBe('{"x":1}');
    a.remove(SAVE_KEY);
    expect(a.read(SAVE_KEY)).toBeNull();
  });

  it('写会抛的适配器能被 Autosaver 吞掉（Safari 无痕模式不白屏）', () => {
    const a = throwingAdapter();
    expect(() => a.write(SAVE_KEY, 'x')).toThrow();
  });
});

describe('自动存档 autosave', () => {
  it('间隔常量是 30 秒', () => {
    expect(AUTOSAVE_INTERVAL).toBe(30);
  });

  it('到点自动存一次，没到点不存', () => {
    const a = createMemoryAdapter();
    const s = freshSession();
    const saver = new Autosaver(a, () => s, TABLES);
    saver.tick(29.9);
    expect(saver.saves).toBe(0);
    saver.tick(0.2);
    expect(saver.saves).toBe(1);
    expect(JSON.parse(a.read(SAVE_KEY) as string).version).toBe(1);
  });

  it('存了能读回来，且离线秒数按 savedAt 差算', () => {
    const a = createMemoryAdapter();
    const s = freshSession(4242);
    const saver = new Autosaver(a, () => s, TABLES);
    saver.saveNow();
    const loaded = saver.load(Date.now() + 90_000);
    expect(loaded).not.toBeNull();
    expect(loaded?.session.character.classId).toBe('yujian');
    expect(loaded?.offlineSeconds).toBeGreaterThan(85);
    expect(loaded?.offlineSeconds).toBeLessThan(95);
  });

  it('没有存档 → load 返回 null（调用方建新档）', () => {
    const a = createMemoryAdapter();
    const saver = new Autosaver(a, () => freshSession(), TABLES);
    expect(saver.load()).toBeNull();
  });

  it('存档损坏 → load 返回 null 而不是抛异常', () => {
    const a = createMemoryAdapter();
    a.write(SAVE_KEY, '{ not json');
    const saver = new Autosaver(a, () => freshSession(), TABLES);
    expect(saver.load()).toBeNull();
  });

  it('版本不兼容 → load 返回 null', () => {
    const a = createMemoryAdapter();
    a.write(SAVE_KEY, JSON.stringify({ version: 999, savedAt: Date.now() }));
    const saver = new Autosaver(a, () => freshSession(), TABLES);
    expect(saver.load()).toBeNull();
  });

  it('存盘失败不抛异常，只记 error（宁可丢一次存档也不能让游戏崩）', () => {
    const saver = new Autosaver(throwingAdapter(), () => freshSession(), TABLES);
    expect(saver.saveNow()).toBe(false);
    expect(saver.error).not.toBeNull();
    expect(saver.saves).toBe(0);
  });

  it('读档回来是空背包/回到层开头（运行时态不入档）', () => {
    const a = createMemoryAdapter();
    const s = freshSession(555);
    tickSession(s, 1 / 60); // 跑一帧，产生运行时态
    new Autosaver(a, () => s, TABLES).saveNow();
    const loaded = new Autosaver(a, () => freshSession(), TABLES).load();
    expect(loaded).not.toBeNull();
    // 重建约定：回到这一层的这一波开头 → 场上有一波刚撒的怪（不是 0）
    expect(loaded?.session.battle.monsters.length).toBeGreaterThan(0);
    // 浮字/日志是纯运行时表现，不入档 → 读回来必须是空的
    expect(loaded?.session.floats.length).toBe(0);
    expect(loaded?.session.log.length).toBe(0);
  });

  it('角色等级与装备能完整往返（19 件装备 + 天赋 + 玉简装配）', () => {
    const a = createMemoryAdapter();
    const s = freshSession(99);
    s.character = {
      ...createCharacter('fenyin'),
      step: 20,
      gemLoadouts: { 'hanshui-jian': ['mengong', 'wanhui'] },
      talentIds: ['t-life-1', 'b-sword-1'],
    };
    new Autosaver(a, () => s, TABLES).saveNow();
    const back = new Autosaver(a, () => freshSession(), TABLES).load()?.session;
    expect(back?.character.classId).toBe('fenyin');
    expect(back?.character.step).toBe(20);
    expect(back?.character.gemLoadouts).toEqual({ 'hanshui-jian': ['mengong', 'wanhui'] });
    expect(back?.character.talentIds).toEqual(['t-life-1', 'b-sword-1']);
    expect(Object.keys(back?.character.equipment ?? {}).sort()).toEqual(['sword']);
  });
});
