// 玉简通道估算 + D78（速度/破绽两个死属性）回归
//
// 这两件事必须一起测，因为它们是同一个问题的两面：
//   - 通道估算（gem-power.ts）是**玩家看到的数字**；
//   - 战斗层的冷却与破绽是**实际生效的数字**；
// 两者不一致时，面板就是在撒谎 —— 本项目已经踩过「HUD 波次与 session 不一致」。
// 所以这里的钉子分两层：纯函数层断言通道值，战斗层断言真的用了速度与破绽。
import { describe, expect, it } from 'vitest';
import {
  autoGemChannels,
  channelText,
  gemChannels,
  CHANNEL_EPS,
} from '../src/core/gem-power';
import { applyGemLoadout } from '../src/core/gem-edit';
import { characterGemLoadout, characterStats, createCharacter } from '../src/core/character';
import {
  createPlayerBattle,
  playerBattleFromCharacter,
  skillCooldown,
  type PlayerBattle,
} from '../src/core/battle';
import { ACTIVE_SKILLS } from '../src/data/skills';
import { gemModifiersFor, getSupportGem, GEM_SLOTS } from '../src/data/support-gems';
import type { ClassId } from '../src/data/classes';

const CLASS: ClassId = 'yujian';

/** 30 重：六条神通与全部 12 条玉简都已解锁 */
function grown(): ReturnType<typeof createCharacter> {
  return { ...createCharacter(CLASS), step: 30 };
}

const ATTACK_SKILL = ACTIVE_SKILLS.find((s) => s.id === 'fentian-zhang')!; // attack / fire，cooldown 3
const SPELL_SKILL = ACTIVE_SKILLS.find((s) => s.id === 'zhuoyan-zhou')!; // spell / fire，cooldown 2.5

function withGems(skillId: string, ids: readonly string[]) {
  const ch = grown();
  // applyGemLoadout 是**原地改**（返 void）—— 写成 `const ch = applyGemLoadout(...)` 会拿到 undefined
  applyGemLoadout(ch, skillId, ids);
  return ch;
}

describe('gemChannels：四条通道', () => {
  it('一条都不装时四条通道全是 1.00，count 0', () => {
    const ch = withGems('fentian-zhang', []);
    const c = gemChannels(ch, 'fentian-zhang');
    expect(c.damage).toBeCloseTo(1, 6);
    expect(c.speed).toBeCloseTo(1, 6);
    expect(c.crit).toBeCloseTo(1, 6);
    expect(c.area).toBeCloseTo(1, 6);
    expect(c.utility).toBe(0);
    expect(c.count).toBe(0);
  });

  it('unknown 神通安静判否（全 1，不抛）', () => {
    const c = gemChannels(grown(), '不存在的神通');
    expect(c.damage).toBe(1);
    expect(c.count).toBe(0);
  });

  it('attack 类神通吃 attackSpeed：装猛攻 → 速度 ×1.25，castSpeed 玉简不影响它', () => {
    const ch = withGems(ATTACK_SKILL.id, ['mengong']);
    expect(gemChannels(ch, ATTACK_SKILL.id).speed).toBeCloseTo(1.25, 6);
    // 急切是 spell 专用（supports: ['spell']），装在 attack 神通上不生效也不进装配
    const ch2 = withGems(ATTACK_SKILL.id, ['jixie']);
    expect(gemChannels(ch2, ATTACK_SKILL.id).speed).toBeCloseTo(1, 6);
  });

  it('spell 类神通吃 castSpeed：装急切 → 速度 ×1.25', () => {
    const ch = withGems(SPELL_SKILL.id, ['jixie']);
    expect(gemChannels(ch, SPELL_SKILL.id).speed).toBeCloseTo(1.25, 6);
  });

  it('元素玉简只对匹配的五行生效（火系神通吃浊火 ×1.30）', () => {
    const fire = withGems(SPELL_SKILL.id, ['zhuo-huo']);
    expect(gemChannels(fire, SPELL_SKILL.id).damage).toBeCloseTo(1.3, 6);
    // 淬金是金属性：火系神通上不生效
    const metal = withGems(SPELL_SKILL.id, ['cuijin']);
    expect(gemChannels(metal, SPELL_SKILL.id).damage).toBeCloseTo(1, 6);
  });

  it('万汇是 more 乘区（与元素 increased 相乘，不是相加）', () => {
    const ch = withGems(SPELL_SKILL.id, ['zhuo-huo', 'wanhui']);
    // (1 + 0.30) × 1.30 = 1.69，若写成相加会是 1.60
    expect(gemChannels(ch, SPELL_SKILL.id).damage).toBeCloseTo(1.69, 6);
  });

  it('拷皮是 more 0.15', () => {
    const ch = withGems(SPELL_SKILL.id, ['kaopi']);
    expect(gemChannels(ch, SPELL_SKILL.id).damage).toBeCloseTo(1.15, 6);
  });

  it('扩撒只进范围通道，不改伤害', () => {
    const ch = withGems(SPELL_SKILL.id, ['kuosan']);
    const c = gemChannels(ch, SPELL_SKILL.id);
    expect(c.area).toBeCloseTo(1.35, 6);
    expect(c.damage).toBeCloseTo(1, 6);
  });

  it('续航类玉简计入 utility，不冒充通道加成', () => {
    const ch = withGems(SPELL_SKILL.id, ['huitou', 'yuanmo']);
    const c = gemChannels(ch, SPELL_SKILL.id);
    expect(c.utility).toBe(2);
    expect(c.damage).toBeCloseTo(1, 6);
    expect(c.speed).toBeCloseTo(1, 6);
  });

  it('贯头进破绽通道（>1），断筋也进破绽通道', () => {
    const ch = withGems(SPELL_SKILL.id, ['guantou']);
    expect(gemChannels(ch, SPELL_SKILL.id).crit).toBeGreaterThan(1);
    const ch2 = withGems(SPELL_SKILL.id, ['duanjin']);
    expect(gemChannels(ch2, SPELL_SKILL.id).crit).toBeGreaterThan(1);
  });

  it('破绽率封顶 1：贯头不会把期望算到天上', () => {
    const ch = withGems(SPELL_SKILL.id, ['guantou']);
    const c = gemChannels(ch, SPELL_SKILL.id);
    expect(Number.isFinite(c.crit)).toBe(true);
    expect(c.crit).toBeGreaterThan(0);
  });
});

describe('autoGemChannels：自动装配是上限参照', () => {
  it('30 重时自动装配装满 4 格，且不弱于手装单一玉简', () => {
    const ch = grown();
    const auto = autoGemChannels(ch, SPELL_SKILL.id);
    expect(auto.count).toBe(GEM_SLOTS);
    const one = gemChannels(withGems(SPELL_SKILL.id, ['zhuo-huo']), SPELL_SKILL.id);
    expect(auto.damage).toBeGreaterThan(one.damage);
  });

  it('自动装配与 characterGemLoadout 的默认序一致（没写过字段时两者相同）', () => {
    const ch = grown();
    for (const skill of ACTIVE_SKILLS) {
      expect(characterGemLoadout(ch, skill.id)).toHaveLength(GEM_SLOTS);
      const cur = gemChannels(ch, skill.id);
      const auto = autoGemChannels(ch, skill.id);
      expect(cur.damage).toBeCloseTo(auto.damage, 6);
      expect(cur.speed).toBeCloseTo(auto.speed, 6);
    }
  });

  it('装错（四条续航）明显弱于自动：伤害 1.00 vs 自动 > 1.5', () => {
    const ch = withGems(SPELL_SKILL.id, ['huitou', 'yuanmo']);
    const cur = gemChannels(ch, SPELL_SKILL.id);
    const auto = autoGemChannels(ch, SPELL_SKILL.id);
    expect(cur.damage).toBeCloseTo(1, 6);
    expect(auto.damage).toBeGreaterThan(1.5);
  });
});

describe('channelText：面板一行文案', () => {
  it('含「已装 n/4」，且不显示恒为 1 的通道（不制造噪音）', () => {
    const ch = withGems(SPELL_SKILL.id, ['zhuo-huo']);
    const text = channelText(ch, SPELL_SKILL.id);
    expect(text).toContain('已装 1/4');
    expect(text).toContain('伤害 ×1.30');
    expect(text).not.toContain('范围');
    expect(text).not.toContain('速度');
  });

  it('空装写「无加成」而不是留空', () => {
    const ch = withGems(SPELL_SKILL.id, []);
    expect(channelText(ch, SPELL_SKILL.id)).toContain('无加成');
  });

  it('续航玉简单独写「续航 n 条」', () => {
    const ch = withGems(SPELL_SKILL.id, ['huitou']);
    expect(channelText(ch, SPELL_SKILL.id)).toContain('续航 1 条');
  });

  it('CHANNEL_EPS 足够小：×1.05 的通道不会被吞掉', () => {
    expect(CHANNEL_EPS).toBeLessThan(0.05);
  });
});

describe('D78：速度与破绽是死属性的回归钉子', () => {
  it('playerBattleFromCharacter 必须把 castSpeed 传下去（漏传则急切/凝神/印成全是死属性）', () => {
    const ch = grown();
    const p = playerBattleFromCharacter(ch);
    expect(p.castSpeed).toBeCloseTo(characterStats(ch).castSpeed, 9);
    expect(p.castSpeed).toBeGreaterThan(0);
  });

  it('skillCooldown 吃面板速度：castSpeed 1.5 → 冷却 ÷1.5', () => {
    const p = createPlayerBattle({
      maxHp: 100,
      level: 1,
      armor: 0,
      damage: 10,
      attackSpeed: 1,
      castSpeed: 1.5,
      critChance: 0,
    });
    expect(skillCooldown(2.5, SPELL_SKILL, p, [])).toBeCloseTo(2.5 / 1.5, 6);
  });

  it('skillCooldown 吃玉简速度：急切 +25% → 再 ÷1.25', () => {
    const p = createPlayerBattle({
      maxHp: 100,
      level: 1,
      armor: 0,
      damage: 10,
      attackSpeed: 1,
      castSpeed: 1,
      critChance: 0,
    });
    const gemMods = gemModifiersFor([getSupportGem('jixie')!], SPELL_SKILL.tags);
    expect(skillCooldown(2.5, SPELL_SKILL, p, gemMods)).toBeCloseTo(2.5 / 1.25, 6);
  });

  it('attack 类神通走 attackSpeed 而不是 castSpeed', () => {
    const p = createPlayerBattle({
      maxHp: 100,
      level: 1,
      armor: 0,
      damage: 10,
      attackSpeed: 2,
      castSpeed: 1,
      critChance: 0,
    });
    expect(skillCooldown(3, ATTACK_SKILL, p, [])).toBeCloseTo(3 / 2, 6);
  });

  it('速度异常值有下限：面板速度 0.01 也不会把冷却放大到无穷', () => {
    const p = createPlayerBattle({
      maxHp: 100,
      level: 1,
      armor: 0,
      damage: 10,
      attackSpeed: 0.01,
      castSpeed: 0.01,
      critChance: 0,
    }) as PlayerBattle;
    // createPlayerBattle 自身就把速度夹到 0.1，再叠加 skillCooldown 的 0.2 下限
    const cd = skillCooldown(2.5, SPELL_SKILL, p, []);
    expect(Number.isFinite(cd)).toBe(true);
    expect(cd).toBeLessThanOrEqual(2.5 / 0.1);
  });

  it('冷却为 0 的神通（普攻形态）不参与速度换算', () => {
    const p = createPlayerBattle({
      maxHp: 100,
      level: 1,
      armor: 0,
      damage: 10,
      attackSpeed: 2,
      castSpeed: 2,
      critChance: 0,
    });
    expect(skillCooldown(0, ATTACK_SKILL, p, [])).toBe(0);
  });
});
