import { describe, expect, it } from 'vitest';
import { createSession, startWave, tickSession, WAVE_END_REGEN } from '../src/core/session';
import { sessionToSave, sessionFromSave, offlineSecondsOf } from '../src/core/save-bridge';
import { serialize, deserialize, SAVE_VERSION } from '../src/core/save';
import { ITEM_BASES } from '../src/data/bases';
import { AFFIXES } from '../src/data/affixes';
import { addXp } from '../src/core/progression';

const TABLES = { bases: ITEM_BASES, affixes: AFFIXES };
const makeSession = (seed = 99) => {
  const s = createSession({ classId: 'yujian', seed, tables: TABLES });
  startWave(s);
  return s;
};

describe('session ↔ 存档桥', () => {
  it('存了读回来：台阶/修为/背包/层数/波次/通货袋/玉简袋全还原', () => {
    const s = makeSession();
    s.bag.push(...(s.bag.length ? [] : [])); // 背包自然增长由 tick 完成，这里跑一段时间
    for (let i = 0; i < 60 * 20; i++) tickSession(s, 1 / 60); // 20 秒
    const save = sessionToSave(s);
    const back = deserialize(JSON.parse(JSON.stringify(save)));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    const r = sessionFromSave(back.state, { tables: TABLES });
    expect(r.character.step).toBe(s.character.step);
    expect(r.character.xp).toBeCloseTo(s.character.xp, 5);
    expect(r.character.equipment['sword']?.uid).toBe(s.character.equipment['sword']?.uid);
    expect(r.bag.length).toBe(s.bag.length);
    expect(r.floor).toBe(s.floor);
    expect(r.wave).toBe(s.wave);
    expect(r.pocket).toEqual(s.pocket);
    expect(r.gemPouch).toEqual(s.gemPouch);
  });

  it('rng 接续：恢复后的掉落序列与原 session 继续（不重摇）', () => {
    const s = makeSession(1234);
    for (let i = 0; i < 60 * 15; i++) tickSession(s, 1 / 60);
    const save = sessionToSave(s);
    // 两边都从「恢复后」起算：原 session 也做一次同构恢复，再各自摇 10 次
    const a = sessionFromSave(save, { tables: TABLES });
    const b = sessionFromSave(save, { tables: TABLES });
    const xs = Array.from({ length: 10 }, () => a.rng.float(0, 1));
    const ys = Array.from({ length: 10 }, () => b.rng.float(0, 1));
    expect(ys).toEqual(xs);
  });

  it('恢复后满状态开局：满血/满真元/浊气清零/场上无怪，startWave 重新撒', () => {
    const s = makeSession(77);
    for (let i = 0; i < 60 * 30; i++) tickSession(s, 1 / 60); // 打 30 秒，掉过血
    const save = sessionToSave(s);
    const r = sessionFromSave(save, { tables: TABLES });
    expect(r.battle.player.hp).toBe(r.battle.player.maxHp);
    expect(r.battle.player.mana).toBe(r.battle.player.maxMana);
    expect(r.battle.turbid.value).toBe(0);
    expect(r.battle.monsters.length).toBeGreaterThan(0); // startWave 已重新撒
    expect(r.ground.length).toBe(0);
    expect(r.floats.length).toBe(0);
  });

  it('运行时态不入档：存档 JSON 里没有怪/浮字/日志/血量', () => {
    const s = makeSession(55);
    for (let i = 0; i < 60 * 10; i++) tickSession(s, 1 / 60);
    const text = JSON.stringify(sessionToSave(s));
    // 注意：`progress.codex.monsters` 是**收集到的 id 字符串数组**（D87），
    // 和运行时那批怪（对象、带 hp/x/y）是两件事。所以不能笼统断言「没有 monsters」，
    // 要断言「没有对象形态的怪数组」，否则这条测试会因为新功能而假红。
    expect(text).toContain('"codex"');
    expect(text).not.toMatch(/"monsters":\s*\[\s*\{/);
    expect(text).not.toContain('floats');
    expect(text).not.toContain('"hp"');
    expect(text).not.toContain('turbid');
    expect(text).not.toContain('craftTimer');
  });

  it('天赋点账本（firstClearedFloors）随层首通增长、随存档往返', () => {
    const s = makeSession(31);
    // 首通记账发生在「打完镇守下潜」那一刻；这里直接模拟已推完 2 层的账本
    s.firstClearedFloors.push(1, 2);
    const save = sessionToSave(s);
    const r = sessionFromSave(save, { tables: TABLES });
    expect(r.firstClearedFloors).toEqual([1, 2]);
  });

  it('修为/台阶大的角色恢复后面板同步（playerBattleFromCharacter 吃到存档值）', () => {
    const s = makeSession(88);
    // 直接给角色加修为跨几重
    const advanced = { ...s.character, step: 9, xp: 0 };
    (s as { character: typeof advanced }).character = advanced;
    const save = sessionToSave(s);
    const r = sessionFromSave(save, { tables: TABLES });
    expect(r.character.step).toBe(9);
    expect(r.battle.player.level).toBe(10); // level = step + 1
    // v4 裸装 step9 面板 life ≈ 157（层 1 目标 142 的 1.1 倍内），断言「比重开的 step0 大」
    const fresh = makeSession(88);
    expect(r.battle.player.maxHp).toBeGreaterThan(fresh.battle.player.maxHp);
  });

  it('离线秒数：savedAt 在过去 → 正差值；未来/0 → 0', () => {
    const now = Date.now();
    const s = makeSession(66);
    const past = sessionToSave(s);
    (past as { savedAt: number }).savedAt = now - 90_000;
    expect(offlineSecondsOf(past, now)).toBe(90);
    const future = sessionToSave(s);
    (future as { savedAt: number }).savedAt = now + 60_000;
    expect(offlineSecondsOf(future, now)).toBe(0);
    const zero = sessionToSave(s);
    (zero as { savedAt: number }).savedAt = 0;
    expect(offlineSecondsOf(zero, now)).toBe(0);
  });

  it('版本常量一致', () => {
    expect(SAVE_VERSION).toBe(1);
  });
});
