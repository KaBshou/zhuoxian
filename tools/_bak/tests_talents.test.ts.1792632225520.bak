// tests/talents.test.ts — 周天图契约测试
import { describe, expect, it } from 'vitest';
import { createCharacter } from '../src/core/character';
import { characterModifiers, characterStats } from '../src/core/character';
import {
  allocateTalent,
  canAllocate,
  hasSwitch,
  talentModifiers,
  talentPointsAvailable,
  talentPointsEarned,
  talentPointsSpent,
  withTalents,
} from '../src/core/talents-runtime';
import { TALENT_NODES, validateTalents } from '../src/data/talents';
import { TALENT_SWITCHES, KNOWN_SWITCH_IDS } from '../src/data/talent-def';

describe('周天图数据', () => {
  it('数据自检零问题', () => {
    expect(validateTalents()).toEqual([]);
  });

  it('节点数与开关数符合 v1 设计', () => {
    // 24 主干 + 5 支线 × 6 = 54
    expect(TALENT_NODES.length).toBe(54);
    expect(TALENT_SWITCHES.length).toBe(5);
    // 每个开关节点都登记过
    for (const s of TALENT_SWITCHES) expect(KNOWN_SWITCH_IDS.includes(s)).toBe(true);
  });

  it('全图总威力预算：全部 increased 类节点加总在 ×1.05 附近', () => {
    // 把全部 stat 节点的 increased 值按主统计加总（粗粒度预算检查）
    let damageInc = 0;
    let lifeInc = 0;
    for (const n of TALENT_NODES) {
      for (const mo of n.mods ?? []) {
        if (mo.stat === 'damage' && mo.op === 'increased') damageInc += mo.value;
        if (mo.stat === 'life' && mo.op === 'increased') lifeInc += mo.value;
      }
    }
    // 伤害通道：主干 7%（v4.17 D38 N1 从 14% 砍半）+ 剑修支线 0 = 7%；气血通道 18% + 浊脉 6% = 24%
    // 砍半的理由：自动点天赋会吃满 54 点，实测满级时长 405.8 → 340.1 min，
    // 战斗天赋对进度是平方级影响（先打死怪就不挨打），所以 D38 只砍战斗侧、不动生存/资源/收益。
    expect(damageInc).toBeCloseTo(0.07, 5);
    expect(lifeInc).toBeCloseTo(0.24, 5);
  });
});

describe('点数账本', () => {
  it('收入 = 台阶×1 + 首通层×2', () => {
    expect(talentPointsEarned(0, 0)).toBe(0);
    expect(talentPointsEarned(10, 5)).toBe(10 + 10);
    expect(talentPointsEarned(81, 27)).toBe(80 + 54); // 上限口径：step 最多按 80 算（0~80 共 81 重，收入按台阶数封顶 80）
    expect(talentPointsEarned(999, 999)).toBe(80 + 999 * 2); // step 夹到 80，层不夹
    expect(talentPointsEarned(-5, -3)).toBe(0); // 负数防
  });

  it('非法 step/层 不产生 NaN', () => {
    const e = talentPointsEarned(Number.NaN, Number.NaN);
    expect(Number.isFinite(e)).toBe(true);
    expect(e).toBe(0);
  });

  it('可用点数 = 收入 - 已花', () => {
    const ch = createCharacter('yujian');
    expect(talentPointsSpent(ch)).toBe(0);
    expect(talentPointsAvailable(ch, 0)).toBe(0); // step0 无首通 = 0 点可用
  });
});

describe('点亮流程', () => {
  it('step0 没点数时点不了', () => {
    const ch = createCharacter('yujian');
    const check = canAllocate(ch, 't-dmg-1', 0);
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('点数不足');
    const res = allocateTalent(ch, 't-dmg-1', 0);
    expect(res.ok).toBe(false);
    expect(res.character).toBe(ch); // 不可变：失败原样返回
  });

  it('有 2 点（首通 1 层）时能点一个主干起点', () => {
    const ch = createCharacter('yujian');
    const res = allocateTalent(ch, 't-dmg-1', 1); // 1 层首通 = 2 点
    expect(res.ok).toBe(true);
    expect(res.character.talentIds).toEqual(['t-dmg-1']);
    // 原对象不变
    expect(ch.talentIds).toBeUndefined();
  });

  it('前置没点时不能跳点', () => {
    const ch = withTalents(createCharacter('yujian'), ['t-dmg-1']);
    const check = canAllocate(ch, 't-dmg-3', 5);
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('前置未点亮');
  });

  it('重复点同一节点被拒', () => {
    const ch = withTalents(createCharacter('yujian'), ['t-dmg-1']);
    const check = canAllocate(ch, 't-dmg-1', 5);
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('已经点过了');
  });

  it('不存在的节点被拒且不产生 Modifier', () => {
    const ch = createCharacter('yujian');
    expect(canAllocate(ch, 'no-such-node', 9).ok).toBe(false);
    expect(talentModifiers(withTalents(ch, ['no-such-node']))).toEqual([]);
    expect(talentPointsSpent(withTalents(ch, ['no-such-node']))).toBe(0); // 未知 id 不计钱
  });

  it('支线需要先点满对应主干终点', () => {
    const ch = withTalents(createCharacter('yujian'), ['t-dmg-1', 't-dmg-2', 't-dmg-3']);
    // 剑修支线挂在 t-dmg-4 上，还没点
    expect(canAllocate(ch, 'b-sword-1', 99).ok).toBe(false);
    const with4 = allocateTalent(ch, 't-dmg-4', 99);
    expect(with4.ok).toBe(true);
    expect(canAllocate(with4.character, 'b-sword-1', 99).ok).toBe(true);
  });
});

describe('天赋变成面板', () => {
  it('talentModifiers 只出 stat 节点、来源是周天图', () => {
    const ch = withTalents(createCharacter('yujian'), ['t-dmg-1', 'b-sword-6']);
    const mods = talentModifiers(ch);
    expect(mods.length).toBe(1); // b-sword-6 是开关，不出 Modifier
    expect(mods[0].source?.kind).toBe('talent');
  });

  it('点伤害天赋后面板 damage 增大', () => {
    const ch = createCharacter('yujian');
    const before = characterStats(ch).damage;
    const ch2 = withTalents(ch, ['t-dmg-1', 't-dmg-2', 't-dmg-3', 't-dmg-4']);
    const after = characterStats(ch2).damage;
    // v4.17 D38（N1）：四条伤害节点合计 +7%（原 +14%，砍半）
    expect(after).toBeCloseTo(before * 1.07, 5);
    // characterModifiers 通道也含天赋（这是真正的接线断言）
    expect(characterModifiers(ch2).some((mo) => mo.source?.kind === 'talent')).toBe(true);
  });

  it('hasSwitch：点亮的开关为真、未知开关恒假', () => {
    const ch = withTalents(createCharacter('yujian'), ['b-sword-6']);
    expect(hasSwitch(ch, 'turbid-boom-plus')).toBe(true);
    expect(hasSwitch(ch, 'wave-regen-plus')).toBe(false);
    expect(hasSwitch(ch, 'no-such-switch')).toBe(false);
  });
});
