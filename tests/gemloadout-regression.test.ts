// shuzhi 请求的三条回归测试（m05012 默认装配价值序修正）：
// R1 默认装配倍率每台阶单调不减（解锁新玉简不该让 DPS 变弱）
// R2 step18/27 每神通倍率 ≥ 2.45×（最优 2.484×）
// R3 只含万汇的神通 gemCostMulFor > 1（costMul 语义接线正确）
import { describe, it, expect } from 'vitest';
import { createCharacter, gainXp, defaultGemLoadout, characterGemLoadout } from '../src/core/character';
import { xpForStep } from '../src/core/progression';
import { ACTIVE_SKILLS, getActiveSkill } from '../src/data/skills';
import { SUPPORT_GEMS, gemModifiersFor, gemCostMulFor } from '../src/data/support-gems';
import { unlockedSkills } from '../src/core/skills-runtime';
import type { CharacterState } from '../src/core/character';

function charAtStep(step: number): CharacterState {
  let ch = createCharacter('yujian');
  while (ch.step < step) ch = gainXp(ch, xpForStep(ch.step));
  return ch;
}

/** 装配表 → DPS 乘区倍率（damage × 攻速/结印速度，与期望 DPS 同口径）。
 *  shuzhi 的 2.484× 是 DPS 口径：伤害乘区 1.9435 × 速度 1.25 = 2.429，
 *  再加默认破绽链 ~2% ≈ 2.48。光统计 damage 会假红。 */
function loadoutMultiplier(ch: CharacterState, skillId: string): number {
  const loadout = characterGemLoadout(ch, skillId);
  const skill = getActiveSkill(skillId)!;
  const mods = gemModifiersFor(
    loadout.map((id) => SUPPORT_GEMS.find((g) => g.id === id)!).filter(Boolean),
    skill.tags,
  );
  let dmgInc = 0;
  let dmgMore = 1;
  let speedInc = 0; // 攻击或结印速度（一个神通只会命中其一）
  for (const m of mods) {
    if (m.stat === 'damage') {
      if (m.op === 'increased') dmgInc += m.value;
      if (m.op === 'more') dmgMore *= 1 + m.value;
    }
    if (m.stat === 'attackSpeed' || m.stat === 'castSpeed') {
      if (m.op === 'increased') speedInc += m.value;
    }
  }
  return (1 + dmgInc) * dmgMore * (1 + speedInc);
}

describe('默认装配回归（shuzhi m05012）', () => {
  it('R1: 默认装配倍率每台阶单调不减', () => {
    const steps = [0, 4, 9, 13, 18, 27, 40, 80];
    for (const skill of ACTIVE_SKILLS) {
      let prev = 0;
      for (const s of steps) {
        const cur = loadoutMultiplier(charAtStep(s), skill.id);
        expect(cur, `${skill.name} 在 step ${s} 倍率 ${cur.toFixed(3)} 低于前一级 ${prev.toFixed(3)}`)
          .toBeGreaterThanOrEqual(prev);
        prev = cur;
      }
    }
  });

  it('R2: step18 与 step27 每神通 DPS 倍率 ≥ 2.42×（不含破绽链）', () => {
    // shuzhi 口径的 2.484× 含破绽链（critChance+0.06 flat → DPS +~2.2%）。
    // 本测试只统计 damage×speed 两个乘区，所以阈值取 2.42（= 2.484 / 1.0225 保守）。
    // 破绽链的贡献由 damage.test.ts 的 computeDamage 断言覆盖，这里不重复建模。
    for (const step of [18, 27]) {
      const ch = charAtStep(step);
      for (const skill of unlockedSkills(ch)) {
        if (skill.cooldown <= 0) continue; // 普攻形态不吃玉简
        const mul = loadoutMultiplier(ch, skill.id);
        expect(mul, `${skill.name}@step${step} = ${mul.toFixed(3)}×`)
          .toBeGreaterThanOrEqual(2.42);
      }
    }
  });

  it('R3: 万汇的 costMul 只在装配里生效，gemCostMulFor 返回 >1', () => {
    const wanhui = SUPPORT_GEMS.find((g) => g.id === 'wanhui')!;
    expect(wanhui.costMul).toBe(1.5);
    const gemById = (ids: string[]) => ids.map((id) => SUPPORT_GEMS.find((g) => g.id === id)!).filter(Boolean);
    // 单独万汇装配 → costMul 1.5
    expect(gemCostMulFor(gemById(['wanhui']), getActiveSkill('zhuoyan-zhou')!.tags)).toBe(1.5);
    // 没装万汇 → costMul 1
    expect(gemCostMulFor(gemById(['kaopi', 'mengong']), getActiveSkill('zhuoyan-zhou')!.tags)).toBe(1);
    // 默认装配里包含万汇的技能，其实付成本 = manaCost × 1.5
    const ch = charAtStep(18);
    for (const skill of unlockedSkills(ch)) {
      if (skill.cooldown <= 0) continue;
      const loadout = characterGemLoadout(ch, skill.id);
      const costMul = gemCostMulFor(gemById(loadout), skill.tags);
      if (loadout.includes('wanhui')) {
        expect(costMul).toBe(1.5);
      }
    }
  });
});
