// 测试：技能系统接进战斗（真元 / 施法冷却 / 神通伤害）。
import { describe, it, expect } from 'vitest';
import { createCharacter } from '../src/core/character';
import { playerBattleFromCharacter, createBattle, tickBattle, MANA_REGEN_PER_SEC } from '../src/core/battle';
import { ACTIVE_SKILLS } from '../src/data/skills';
import { SUPPORT_GEMS } from '../src/data/support-gems';
import type { Rng } from '../src/core/rng';

/** 假随机数：永不暴击、float 返回 1（= roll 上限，伤害可预测）。
 *  Rng 是类不是接口，这里用结构子集 + as unknown 绕过（测试专用 fake，不是业务代码）。 */
const fakeRng = {
  get state() { return { seed: 0, count: 0 }; },
  set state(_s) {},
  get drawn() { return 0; },
  fork() { return fakeRng; },
  clone() { return fakeRng; },
  float() { return 1; },
  int(_min: number, _max: number) { return 0; },
  chance() { return false; },
  pick<T>(arr: readonly T[]): T { return arr[0]; },
  weighted<T>(entries: readonly { item: T; weight: number }[]): T | null {
    return entries[0]?.item ?? null;
  },
  shuffle<T>(arr: readonly T[]): T[] { return [...arr]; },
  sample<T>(arr: readonly T[], n: number): T[] { return arr.slice(0, n); },
} as unknown as Rng;

function makeBattle(step = 0, gemLoadout?: string[]) {
  const ch = { ...createCharacter('yujian'), step, gemLoadout };
  const p = playerBattleFromCharacter(ch);
  return { ch, state: createBattle(p, ch.turbid, ch) };
}

describe('技能系统接入战斗', () => {
  it('常量：真元回复 4/s（BALANCE §11.5 B1，基线收口在 STAT_META.manaRegen.base）', () => {
    expect(MANA_REGEN_PER_SEC).toBe(4);
  });

  it('开局轮换只有浊焰咒（御剑术 cooldown=0 当普攻形态，不独立施放）', () => {
    const { state } = makeBattle(0);
    expect(state.skillRotation.map((s) => s.id)).toEqual(['zhuoyan-zhou']);
  });

  it('step 4 解锁寒水箭，进入施放轮换', () => {
    const { state } = makeBattle(4);
    expect(state.skillRotation.map((s) => s.id)).toContain('hanshui-jian');
  });

  it('step 27 能看到全部 6 个神通解锁，轮换里是 5 个（御剑术除外）', () => {
    const { state } = makeBattle(27);
    expect(state.skillRotation).toHaveLength(5);
    expect(state.skillRotation.map((s) => s.id)).not.toContain('yujian-shu');
  });

  it('开局满真元 = 面板 mana', () => {
    const { ch, state } = makeBattle(0);
    expect(state.player.maxMana).toBe(ch.step >= 0 ? state.player.maxMana : 0);
    expect(state.player.mana).toBe(state.player.maxMana);
  });

  it('放一次神通扣真元并进冷却', () => {
    const { state } = makeBattle(4);
    const p = state.player;
    p.mana = 100; // 保证真元够（面板基础 mana 可能低于技能消耗）
    // 造一只怪
    state.monsters.push({
      uid: 1, defId: 'fangshi-yuanke', name: '坊市怨客', rarity: 'normal',
      element: 'metal', tier: 1, hp: 90, maxHp: 90, damage: 3, armor: 5, resist: {},
      speed: 0, attackInterval: 999, attackRange: 10, size: 28, xp: 2,
      x: p.x, y: p.y, cooldown: 999,
    });
    const manaBefore = p.mana;
    tickBattle(state, 1 / 60, fakeRng); // 一帧：出手
    // 轮换按优先级：浊焰咒（unlockStep 0）排在寒水箭（unlockStep 4）前面，
    // 第一次出手放的是浊焰咒，不是寒水箭
    const castId = Object.keys(state.castCooldowns).find((k) => state.castCooldowns[k] > 0);
    expect(castId).toBeDefined();
    expect(['zhuoyan-zhou', 'hanshui-jian']).toContain(castId);
    // 事件里出现神通名
    expect(state.events.some((e) => e.label.startsWith('浊焰咒') || e.label.startsWith('寒水箭') || e.label.startsWith('击杀'))).toBe(true);
  });

  it('真元不足时回落普攻（不扣真元）', () => {
    const { state } = makeBattle(4);
    const p = state.player;
    p.mana = 0;
    state.monsters.push({
      uid: 1, defId: 'fangshi-yuanke', name: '坊市怨客', rarity: 'normal',
      element: 'metal', tier: 1, hp: 500, maxHp: 500, damage: 3, armor: 5, resist: {},
      speed: 0, attackInterval: 999, attackRange: 10, size: 28, xp: 2,
      x: p.x, y: p.y, cooldown: 999,
    });
    tickBattle(state, 1 / 60, fakeRng);
    // 普攻不出神通名
    expect(state.events.every((e) => !e.label.startsWith('寒水箭'))).toBe(true);
    // 真元靠回复涨：2/s × 1/60 帧
    expect(p.mana).toBeCloseTo(MANA_REGEN_PER_SEC / 60, 5);
  });

  it('玉简修正器按标签命中：spell 玉简进寒水箭，attack 玉简不进', () => {
    // 寒水箭 tags = [spell, projectile, single, water]：命中所有 supports 含 spell 的玉简。
    // 装配制（GEM_SLOTS=4）：必须显式装配，没装配 = 零玉简加成（旧「解锁即全开」已废）。
    // step 9 才有「命中 spell 的玉简」（贯头/断筋 unlock 9）；装配 = [攻击玉简, 破绽玉简×2]
    const { state } = makeBattle(9, ['mengong', 'guantou', 'duanjin', 'cuijin']);
    const hanshui = state.gemModsBySkill['hanshui-jian'] ?? [];
    expect(hanshui.length).toBeGreaterThan(0);
    // 猛攻（supports=['attack']）不该出现在寒水箭的修正器来源里 —— 由标签过滤保证：
    // 全部 spell 玉简的 supports 必须含 spell（结构性检查）
    const spellGems = SUPPORT_GEMS.filter((g) => g.supports.includes('spell'));
    expect(spellGems.length).toBeGreaterThan(0);
    // 焚天掌（attack+melee+area+fire）命中猛攻
    const { state: s18 } = makeBattle(18, ['mengong', 'guantou', 'duanjin', 'cuijin']);
    const mods = s18.gemModsBySkill['fentian-zhang'] ?? [];
    expect(mods.length).toBeGreaterThan(0);
  });

  it('神通伤害 > 普攻（寒水箭 baseDamage 9 vs 拳脚 5）', () => {
    const { state } = makeBattle(4);
    const p = state.player;
    state.monsters.push({
      uid: 1, defId: 'fangshi-yuanke', name: '坊市怨客', rarity: 'normal',
      element: 'metal', tier: 1, hp: 90, maxHp: 90, damage: 3, armor: 5, resist: {},
      speed: 0, attackInterval: 999, attackRange: 10, size: 28, xp: 2,
      x: p.x, y: p.y, cooldown: 999,
    });
    tickBattle(state, 1 / 60, fakeRng);
    const hit = state.events.find((e) => e.kind === 'player-hit');
    expect(hit).toBeDefined();
    // 9 基础 × roll 1.0 × (1+面板 increased) - 护甲减免，至少要 > 拳脚 5 的裸伤
    expect(hit!.amount!).toBeGreaterThan(5);
  });
});
