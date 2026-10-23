// 玉简编辑层（`core/gem-edit.ts`）：把「每条神通 4 槽」从只读变成玩家能改。
//
// 这组测试的重点不是「函数能跑」，而是三条容易被改坏的性质：
//   1. **必须能真的清空**（以前 `characterGemLoadout` 会把空装配自动填回去 ⇒ 点清空等于没反应）；
//   2. **不能装上去能选但不该生效的玉简**（未解锁 / 不命中标签 / 越界 → 安静判否）；
//   3. **同一玉简不许占两格**，也不许因为它占两格而把别的槽挤掉。
import { describe, expect, it } from 'vitest';
import {
  applyGemLoadout,
  cycleGemAt,
  gemAtSlot,
  gemOptions,
  gemSlotOptions,
  moveSkillCursor,
  moveSlotCursor,
  orderedSkillRows,
  resetGemLoadout,
  setGemAt,
} from '../src/core/gem-edit';
import { characterGemLoadout, type CharacterState } from '../src/core/character';
import { SUPPORT_GEMS, gemAffects, getSupportGem } from '../src/data/support-gems';
import { ACTIVE_SKILLS } from '../src/data/skills';

/** 造一个「全解锁」的角色（编辑层的校验大多取决于解锁进度） */
function makeChar(step = 80): CharacterState {
  return { step, gemLoadouts: {} } as unknown as CharacterState;
}

/** 第一条能被某玉简影响的神通 */
function skillForGem(gemId: string): string {
  const gem = getSupportGem(gemId);
  if (!gem) throw new Error('未知玉简 ' + gemId);
  const skill = ACTIVE_SKILLS.find((s) => gemAffects(gem, s.tags));
  if (!skill) throw new Error('没有神通吃 ' + gemId);
  return skill.id;
}

describe('gem-edit · 面板行序', () => {
  it('行序与解锁台阶一致，未解锁的排在后面但不隐藏', () => {
    const rows = orderedSkillRows(makeChar(0));
    expect(rows.length).toBe(ACTIVE_SKILLS.length);
    const steps = rows.map((r) => r.skill.unlockStep);
    expect(steps).toEqual([...steps].sort((a, b) => a - b));
    // step=0 时前两条（unlockStep=0）已解锁、后面的未解锁 —— 这条钉子防的是
    // 「把解锁判据写成从 1 开始」，那会让开局根本没有神通可用。
    expect(rows.filter((r) => r.unlocked).length).toBe(2);
    expect(rows[0].unlocked).toBe(true);
  });

  it('解锁进度真的反映在 unlocked 上', () => {
    const rows = orderedSkillRows(makeChar(80));
    expect(rows.every((r) => r.unlocked)).toBe(true);
  });
});

describe('gem-edit · 候选与校验', () => {
  it('只给已解锁且命中标签的玉简', () => {
    const ch = makeChar(80);
    const skillId = ACTIVE_SKILLS[0].id;
    const opts = gemOptions(ch, skillId);
    for (const o of opts) {
      const def = getSupportGem(o.id);
      expect(def).toBeDefined();
      expect(ch.step >= (def?.unlockStep ?? 0)).toBe(true);
      expect(gemAffects(def as never, ACTIVE_SKILLS[0].tags)).toBe(true);
    }
    // 全解锁时必然不止一条，否则「可编辑」这件事无从谈起
    expect(opts.length).toBeGreaterThan(1);
  });

  it('开局（step=0）只给 unlockStep=0 的玉简，后面的按台阶解锁', () => {
    const ch = makeChar(0);
    const opts = gemOptions(ch, ACTIVE_SKILLS[0].id);
    expect(opts.length).toBeGreaterThan(0);
    for (const o of opts) {
      expect(getSupportGem(o.id)?.unlockStep).toBe(0);
    }
    // 全解锁之后候选只会变多，不会变少
    expect(gemOptions(makeChar(80), ACTIVE_SKILLS[0].id).length).toBeGreaterThanOrEqual(opts.length);
  });

  it('未知神通安静返回空表', () => {
    expect(gemOptions(makeChar(80), 'no-such-skill')).toEqual([]);
  });

  it('候选里排除已装在别的槽的玉简（否则能选却装不上）', () => {
    const ch = makeChar(80);
    const skillId = skillForGem('kaopi');
    const current = characterGemLoadout(ch, skillId);
    expect(current.length).toBeGreaterThan(0);
    const opts = gemSlotOptions(ch, skillId, 1);
    const usedElsewhere = current.filter((_, i) => i !== 1);
    for (const o of opts) {
      if (o) expect(usedElsewhere).not.toContain(o.id);
    }
  });

  it('候选第一位永远是「空槽」= null', () => {
    const ch = makeChar(80);
    const opts = gemSlotOptions(ch, skillForGem('kaopi'), 0);
    expect(opts[0]).toBeNull();
  });
});

describe('gem-edit · 设置槽位', () => {
  it('能把某槽换成另一条合法玉简', () => {
    const ch = makeChar(80);
    const skillId = skillForGem('kaopi');
    const before = characterGemLoadout(ch, skillId);
    const target = gemOptions(ch, skillId).find((o) => !before.includes(o.id));
    expect(target).toBeDefined();
    const next = setGemAt(ch, skillId, 0, target?.id ?? null);
    expect(next[0]).toBe(target?.id);
    expect(next.length).toBeLessThanOrEqual(4);
  });

  it('同一玉简不许占两格（装到第二槽会把第一槽那份摘掉）', () => {
    const ch = makeChar(80);
    const skillId = skillForGem('kaopi');
    const before = characterGemLoadout(ch, skillId);
    const first = before[0];
    const next = setGemAt(ch, skillId, 2, first);
    expect(next.filter((id) => id === first).length).toBe(1);
  });

  it('清空某槽真的清得掉（不再被自动装配填回）', () => {
    const ch = makeChar(80);
    const skillId = skillForGem('kaopi');
    const before = characterGemLoadout(ch, skillId);
    expect(before.length).toBeGreaterThan(0);
    const next = setGemAt(ch, skillId, 0, null);
    expect(next.length).toBe(before.length - 1);
    expect(next).not.toContain(before[0]);
  });

  it('四槽全清之后仍然是空的 —— 这是一条显式选择，不是「没配过」', () => {
    const ch = makeChar(80);
    const skillId = skillForGem('kaopi');
    // 注意：每次都必须把结果提交回角色，否则 `setGemAt` 读到的永远是初始四槽，
    // 循环会一直「从 4 条里删掉 1 条」。第一版就踩了这个死循环（vitest 卡住 3 分钟）。
    let cur = characterGemLoadout(ch, skillId);
    for (let guard = 0; guard < 8 && cur.length > 0; guard++) {
      cur = setGemAt(ch, skillId, 0, null);
      applyGemLoadout(ch, skillId, cur);
    }
    expect(cur).toEqual([]);
    // 关键：写进角色之后，读回来仍然是空（老实现会在这里偷偷填满 4 条默认）
    expect(characterGemLoadout(ch, skillId)).toEqual([]);
  });

  it('未解锁的玉简装不上去（安静忽略，不抛异常）', () => {
    const ch = makeChar(80);
    const skillId = skillForGem('kaopi');
    // 找一条确实存在但「未解锁」的玉简：用 step=1 的角色去装全解锁角色能装的
    const locked = makeChar(1);
    const next = setGemAt(locked, skillId, 0, 'kaopi');
    // 不能断言「空表」：step=1 时仍有 unlockStep=0 的玉简会自动填默认装配，
    // 这条测试要钉的是「kaopi 没进去」，不是「什么都没装」。
    expect(next).not.toContain('kaopi');
    // 用全解锁角色装同一条则成功，证明确实是「解锁门槛」在起作用
    applyGemLoadout(ch, skillId, setGemAt(ch, skillId, 0, 'kaopi'));
    expect(characterGemLoadout(ch, skillId)).toContain('kaopi');
  });

  it('越界槽位安静返回原装配', () => {
    const ch = makeChar(80);
    const skillId = skillForGem('kaopi');
    const before = characterGemLoadout(ch, skillId);
    expect(setGemAt(ch, skillId, -1, 'kaopi')).toEqual(before);
    expect(setGemAt(ch, skillId, 9, 'kaopi')).toEqual(before);
    expect(setGemAt(ch, skillId, 1.5, 'kaopi')).toEqual(before);
  });

  it('不存在的玉简 id 塞不进去', () => {
    const ch = makeChar(80);
    const skillId = skillForGem('kaopi');
    const before = characterGemLoadout(ch, skillId);
    expect(setGemAt(ch, skillId, 0, 'no-such-gem')).toEqual(before);
  });
});

describe('gem-edit · 轮换', () => {
  it('连按空格会真的在变（不是画了光标什么都不发生）', () => {
    const ch = makeChar(80);
    const skillId = skillForGem('kaopi');
    const start = characterGemLoadout(ch, skillId);
    const once = cycleGemAt(ch, skillId, 0, 1);
    expect(once).not.toEqual(start);

    // 不断按：装配必须一直合法，而且确实在变。
    // 这里**不**断言「转一圈回到起点」—— 摘掉某槽会让后面的槽整体前移，
    // 状态不是置换环，路径长度不是常数（第一版按「候选数」圈数断言，卡在这里）。
    const seen = new Set<string>();
    let cur = once;
    applyGemLoadout(ch, skillId, cur);
    for (let i = 0; i < 40; i++) {
      cur = cycleGemAt(ch, skillId, 0, 1);
      applyGemLoadout(ch, skillId, cur);
      seen.add(JSON.stringify(cur));
      expect(cur.length).toBeLessThanOrEqual(4);
      expect(new Set(cur).size).toBe(cur.length);
    }
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });

  it('反方向轮换也能动（不会卡住）', () => {
    const ch = makeChar(80);
    const skillId = skillForGem('kaopi');
    expect(cycleGemAt(ch, skillId, 0, -1)).not.toEqual(characterGemLoadout(ch, skillId));
  });

  it('轮换结果永远合法（长度 ≤4、无重复、都已解锁）', () => {
    const ch = makeChar(80);
    for (const skill of ACTIVE_SKILLS) {
      for (let slot = 0; slot < 4; slot++) {
        const next = cycleGemAt(ch, skill.id, slot, 1);
        expect(next.length).toBeLessThanOrEqual(4);
        expect(new Set(next).size).toBe(next.length);
        for (const id of next) {
          const def = SUPPORT_GEMS.find((g) => g.id === id);
          expect(def).toBeDefined();
          expect(ch.step >= (def?.unlockStep ?? 0)).toBe(true);
        }
      }
    }
  });
});

describe('gem-edit · 恢复自动', () => {
  it('R 恢复自动：删掉覆盖项，回到默认装配', () => {
    const ch = makeChar(80);
    const skillId = skillForGem('kaopi');
    applyGemLoadout(ch, skillId, []);
    expect(characterGemLoadout(ch, skillId)).toEqual([]);
    const restored = resetGemLoadout(ch, skillId);
    expect(restored.length).toBeGreaterThan(0);
    expect(characterGemLoadout(ch, skillId)).toEqual(restored);
    expect(ch.gemLoadouts?.[skillId]).toBeUndefined();
  });

  it('恢复自动之后仍然可以再手动改（不是一次性开关）', () => {
    const ch = makeChar(80);
    const skillId = skillForGem('kaopi');
    resetGemLoadout(ch, skillId);
    const next = setGemAt(ch, skillId, 0, null);
    applyGemLoadout(ch, skillId, next);
    expect(characterGemLoadout(ch, skillId)).toEqual(next);
  });
});

describe('gem-edit · 光标', () => {
  it('技能光标夹取不环绕', () => {
    expect(moveSkillCursor(0, -1, 6)).toBe(0);
    expect(moveSkillCursor(5, 1, 6)).toBe(5);
    expect(moveSkillCursor(2, 1, 6)).toBe(3);
    expect(moveSkillCursor(2, 0, 6)).toBe(2);
  });

  it('技能光标对脏值安静归零', () => {
    expect(moveSkillCursor(Number.NaN, 1, 6)).toBe(0);
    expect(moveSkillCursor(2, 1, 0)).toBe(0);
    expect(moveSkillCursor(2, 1, Number.NaN)).toBe(0);
  });

  it('槽位光标环绕（只有 4 格，转圈最省按键）', () => {
    expect(moveSlotCursor(0, -1)).toBe(3);
    expect(moveSlotCursor(3, 1)).toBe(0);
    expect(moveSlotCursor(1, 1)).toBe(2);
    expect(moveSlotCursor(Number.NaN, 0)).toBe(0);
  });
});

describe('gem-edit · 读槽', () => {
  it('gemAtSlot 读得到名字，空槽返回 null', () => {
    const ch = makeChar(80);
    const skillId = skillForGem('kaopi');
    const first = characterGemLoadout(ch, skillId)[0];
    expect(gemAtSlot(ch, skillId, 0)?.id).toBe(first);
    expect(gemAtSlot(ch, skillId, 3) === null || gemAtSlot(ch, skillId, 3)?.id !== undefined).toBe(true);
  });

  it('越界槽位安静返回 null', () => {
    const ch = makeChar(80);
    expect(gemAtSlot(ch, ACTIVE_SKILLS[0].id, -1)).toBeNull();
    expect(gemAtSlot(ch, ACTIVE_SKILLS[0].id, 99)).toBeNull();
  });
});
