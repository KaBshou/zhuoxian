import { describe, expect, it } from 'vitest';
import { Autosaver } from '../src/core/autosave';
import { createMemoryAdapter } from '../src/core/storage';
import { SAVE_KEY, SAVE_BACKUP_KEY } from '../src/core/storage';
import { createSession } from '../src/core/session';
import { ITEM_BASES } from '../src/data/bases';
import { AFFIXES } from '../src/data/affixes';

/**
 * D201：存档双写 —— 主档坏了还有上一份。
 *
 * 这一层不做「历史存档」，只做**一份安全网**：每次写主档之前，先把上一份主档搬到
 * 备份键。所以备份永远是「上一次成功保存的内容」，不是随时同步的副本。
 */

const TABLES = { bases: ITEM_BASES, affixes: AFFIXES };

function makeSession() {
  return createSession({ classId: 'yujian', seed: 2026, tables: TABLES });
}

describe('D201 存档备份', () => {
  it('第一次保存不会产生备份（旧档不存在时不许写空备份）', () => {
    const adapter = createMemoryAdapter();
    const s = makeSession();
    const saver = new Autosaver(adapter, () => s, TABLES);
    expect(saver.saveNow()).toBe(true);
    expect(adapter.read(SAVE_KEY)).toBeTruthy();
    expect(adapter.read(SAVE_BACKUP_KEY)).toBeNull();
  });

  it('第二次保存把**上一份**主档搬进备份（不是新档）', () => {
    const adapter = createMemoryAdapter();
    const s = makeSession();
    const saver = new Autosaver(adapter, () => s, TABLES);
    saver.saveNow();
    const first = adapter.read(SAVE_KEY);
    // 改一个**真的会进存档**的字段：`kills` 是运行时态（不入档），拿它当哨兵会写出假绿。
    s.character = { ...s.character, xp: 12345 };
    saver.saveNow();
    const backup = adapter.read(SAVE_BACKUP_KEY);
    expect(backup).toBe(first);
    expect(adapter.read(SAVE_KEY)).not.toBe(first);
    expect(adapter.read(SAVE_KEY)).toContain(String(12345));
  });

  it('主档正常时 load 不标记从备份恢复', () => {
    const adapter = createMemoryAdapter();
    const s = makeSession();
    const saver = new Autosaver(adapter, () => s, TABLES);
    saver.saveNow();
    const res = saver.load();
    expect(res).not.toBeNull();
    expect(res?.restoredFromBackup).toBe(false);
  });

  it('主档被写坏 → 从备份恢复，并且明确标记 restoredFromBackup', () => {
    const adapter = createMemoryAdapter();
    const s = makeSession();
    const saver = new Autosaver(adapter, () => s, TABLES);
    saver.saveNow();
    s.kills = 7;
    saver.saveNow();
    const goodBackup = adapter.read(SAVE_BACKUP_KEY);
    expect(goodBackup).toBeTruthy();
    adapter.write(SAVE_KEY, '{"version": 999, "player": ');
    const res = saver.load();
    expect(res).not.toBeNull();
    expect(res?.restoredFromBackup).toBe(true);
    // 坏档不许被自动删：玩家还能导出它
    expect(adapter.read(SAVE_KEY)).toBe('{"version": 999, "player": ');
  });

  it('主档与备份都坏 → 返回 null（调用方建新档），不抛', () => {
    const adapter = createMemoryAdapter();
    const s = makeSession();
    const saver = new Autosaver(adapter, () => s, TABLES);
    saver.saveNow();
    saver.saveNow();
    adapter.write(SAVE_KEY, 'not json');
    adapter.write(SAVE_BACKUP_KEY, 'also not json');
    expect(saver.load()).toBeNull();
  });

  it('clear() 连备份一起清（重开新档之后不该还能退回旧进度）', () => {
    const adapter = createMemoryAdapter();
    const s = makeSession();
    const saver = new Autosaver(adapter, () => s, TABLES);
    saver.saveNow();
    saver.saveNow();
    expect(adapter.read(SAVE_BACKUP_KEY)).toBeTruthy();
    saver.clear();
    expect(adapter.read(SAVE_KEY)).toBeNull();
    expect(adapter.read(SAVE_BACKUP_KEY)).toBeNull();
    expect(saver.load()).toBeNull();
  });

  it('从备份恢复时离线秒数按备份的 savedAt 算（不是 0）', () => {
    const adapter = createMemoryAdapter();
    const s = makeSession();
    const saver = new Autosaver(adapter, () => s, TABLES);
    saver.saveNow();
    const backupSavedAt = JSON.parse(adapter.read(SAVE_KEY) as string).savedAt as number;
    saver.saveNow();
    adapter.write(SAVE_KEY, 'broken');
    const res = saver.load(backupSavedAt + 120_000);
    expect(res?.restoredFromBackup).toBe(true);
    expect(res?.offlineSeconds).toBeGreaterThan(100);
    expect(res?.offlineSeconds).toBeLessThan(140);
  });
});
