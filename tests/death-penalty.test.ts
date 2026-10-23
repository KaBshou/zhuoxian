// 测试：死亡惩罚掉 10% 当前修为（DECISIONS 默认值）。
import { describe, it, expect } from 'vitest';
import { createSession, startWave, tickSession, DEATH_XP_PENALTY } from '../src/core/session';
import { createCharacter } from '../src/core/character';
import { ITEM_BASES } from '../src/data/bases';
import { AFFIXES } from '../src/data/affixes';

function makeSession() {
  return createSession({
    classId: 'yujian',
    seed: 42,
    tables: { bases: ITEM_BASES, affixes: AFFIXES },
  });
}

/** 把角色修为顶到指定存量（直接改字段，测试辅助） */
function withXp(s: ReturnType<typeof createSession>, xp: number) {
  s.character = { ...s.character, xp };
}

describe('死亡惩罚', () => {
  it('常量 = 0.1（DECISIONS 默认值）', () => {
    expect(DEATH_XP_PENALTY).toBe(0.1);
  });

  it('玩家死亡后当前修为掉 10%', () => {
    const s = makeSession();
    startWave(s);
    withXp(s, 10);
    const p = s.battle.player;
    // 直接把玩家打死（绕过战斗，只为测惩罚逻辑）
    p.hp = 1;
    const monsters = s.battle.monsters;
    if (monsters.length > 0) {
      const m = monsters[0];
      // 让最近的怪在攻击范围内并立即出手
      m.x = p.x;
      m.y = p.y;
    }
    // 跑 2 秒，让怪把玩家打死
    for (let i = 0; i < 120; i++) tickSession(s, 1 / 60);
    expect(s.battle.deaths).toBeGreaterThan(0);
    // 修为掉了：10 × 0.1 = 1，floor → 9（且不会被突破吃掉，门槛 14 > 9）
    expect(s.character.xp).toBe(9);
  });

  it('修为为 0 时死亡不掉到负数', () => {
    const s = makeSession();
    startWave(s);
    withXp(s, 0);
    const p = s.battle.player;
    p.hp = 1;
    const monsters = s.battle.monsters;
    if (monsters.length > 0) {
      monsters[0].x = p.x;
      monsters[0].y = p.y;
    }
    for (let i = 0; i < 120; i++) tickSession(s, 1 / 60);
    expect(s.battle.deaths).toBeGreaterThan(0);
    expect(s.character.xp).toBe(0);
  });
});
