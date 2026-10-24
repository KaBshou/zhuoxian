import { describe, expect, it } from 'vitest';
import { createSession, tickSession } from '../src/core/session';
import { ITEM_BASES } from '../src/data/bases';
import { AFFIXES } from '../src/data/affixes';
import { statsSections } from '../src/render/stats-panel';

/**
 * D204：死因要说得出「谁打的、多少」。
 *
 * 旧行为：死亡只写「气血枯竭，浊脉重凝」—— 等于什么也没说。
 * 深层被一刀秒的玩家最想知道的三件事（谁 / 多少 / 我多少血）里，
 * `damageTaken` 和 `maxHit` 只能回答「我挨过多少」，回答不了「死于谁手」。
 */

const TABLES = { bases: ITEM_BASES, affixes: AFFIXES };
const make = () => createSession({ classId: 'yujian', seed: 2026, tables: TABLES });

/** 跑到第一次死亡为止（把怪挪到脸上、玩家压到 1 血），返回 session。 */
function runUntilDeath(frames = 4000) {
  const s = make();
  for (let i = 0; i < frames; i += 1) {
    const p = s.battle.player;
    // 层 1 的玩家会先打死怪（怪走得慢、血也薄），所以直接把玩家压到 1 血、
    // 护盾清零，保证下一发必死；每帧重置是为了挡住回复灵纹把血拉回来。
    p.hp = 1;
    p.shield = 0;
    for (const m of s.battle.monsters) {
      m.x = p.x;
      m.y = p.y;
      m.cooldown = 0;
    }
    tickSession(s, 1 / 30);
    if (s.deaths > 0) break;
  }
  return s;
}

describe('D204 死因', () => {
  it('没死过时 stats 里写「—」而不是留空', () => {
    const s = make();
    const row = statsSections(s)
      .flatMap((sec) => sec.rows)
      .find((r) => r.label === '最近死因');
    expect(row?.value).toBe('—');
  });

  it('死亡后 battle.lastFatal 记下来源、伤害与挡掉的量', () => {
    const s = runUntilDeath();
    expect(s.deaths).toBeGreaterThan(0);
    const fatal = s.battle.lastFatal;
    expect(fatal).toBeTruthy();
    expect(typeof fatal?.source).toBe('string');
    expect((fatal?.source ?? '').length).toBeGreaterThan(0);
    expect(fatal?.amount ?? 0).toBeGreaterThan(0);
    expect(fatal?.absorbed ?? -1).toBeGreaterThanOrEqual(0);
  });

  it('死亡日志里有两行：一句情绪、一句死因（死因带怪名）', () => {
    const s = runUntilDeath();
    const texts = s.log.map((l) => l.text);
    expect(texts).toContain('气血枯竭，浊脉重凝');
    const cause = texts.find((t) => t.startsWith('死于「'));
    expect(cause).toBeTruthy();
    expect(cause).toContain(s.battle.lastFatal?.source ?? '\u0000');
  });

  it('stats 里的死因与 battle.lastFatal 同源（不是第二份数据）', () => {
    const s = runUntilDeath();
    const row = statsSections(s)
      .flatMap((sec) => sec.rows)
      .find((r) => r.label === '最近死因');
    expect(String(row?.value)).toContain(s.battle.lastFatal?.source ?? '\u0000');
    expect(String(row?.value)).toContain(String(Math.round(s.battle.lastFatal?.amount ?? 0)));
  });

  it('lastFatal 不入档（存档里不该出现死因）', () => {
    // save 层是白名单构造：这点靠「sessionToSave 没有这个字段」保证，
    // 这里只钉 battle 侧是可选字段、不会因缺失而崩。
    const s = make();
    expect(s.battle.lastFatal).toBeUndefined();
  });
});
