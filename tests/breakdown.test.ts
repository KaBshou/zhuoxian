/**
 * 损伤详解：面板读的数据必须是「刚打出去的那一下」的真实拆解。
 *
 * 这组测试守的是「面板和实战同源」——如果哪天有人为了面板好看去另算一套数字，
 * 这里会红。GDD 4.7 说它同时是玩家计算器、调试工具、新手引导，三者都依赖同一份 steps。
 */
import { describe, expect, it } from 'vitest';

import { createBattle, createPlayerBattle, spawnMonster, tickBattle } from '../src/core/battle';
import { createTurbid } from '../src/core/turbid';
import { Rng } from '../src/core/rng';
import { MONSTERS } from '../src/data/monsters';
import type { PlayerBattle } from '../src/core/battle';

function makePlayer(): PlayerBattle {
  // 用工厂而不是手搓字面量：接口加字段时**这里不会静默缺字段**（`as PlayerBattle`
  // 会把它藏起来，直到 tsc 在别处报错 —— 本轮加传奇旗子就是这么暴露的）。
  return createPlayerBattle({
    maxHp: 500,
    level: 1,
    armor: 0,
    damage: 30,
    attackSpeed: 1,
    critChance: 0,
    range: 200,
    maxMana: 100,
  });
}

describe('损伤详解（lastBreakdown）', () => {
  it('开局还没有任何一次伤害时是 null（面板不该显示 0）', () => {
    const s = createBattle(makePlayer(), createTurbid());
    expect(s.lastBreakdown).toBeNull();
  });

  it('普攻打出去之后留下拆解，金额和怪掉的血完全一致', () => {
    const s = createBattle(makePlayer(), createTurbid());
    const m = spawnMonster(MONSTERS[0]!, 1, 1, 500, 270, 'normal');
    s.monsters.push(m);
    const before = m.hp;

    tickBattle(s, 1 / 60, new Rng(7));

    expect(s.lastBreakdown).not.toBeNull();
    const bd = s.lastBreakdown!;
    expect(bd.label).toContain('普攻');
    expect(bd.steps.length).toBeGreaterThan(0); // 拆解不是空的
    expect(bd.amount).toBeGreaterThan(0);
    expect(before - m.hp).toBe(bd.amount); // 面板数字 = 真实掉血，不许两套算法
    // 每一步都要有 before/after，面板才画得出来
    for (const st of bd.steps) {
      expect(Number.isFinite(st.before)).toBe(true);
      expect(Number.isFinite(st.after)).toBe(true);
      expect(st.label.length).toBeGreaterThan(0);
    }
  });

  it('拆解最后一步的结果等于最终伤害（链条不断）', () => {
    const s = createBattle(makePlayer(), createTurbid());
    s.monsters.push(spawnMonster(MONSTERS[0]!, 1, 1, 500, 270, 'normal'));
    tickBattle(s, 1 / 60, new Rng(11));

    const bd = s.lastBreakdown!;
    const last = bd.steps[bd.steps.length - 1]!;
    expect(Math.abs(last.after - bd.amount)).toBeLessThanOrEqual(1);
  });

  it('暴击时 isCrit 为真（面板要能标「破绽」）', () => {
    const p = { ...makePlayer(), critChance: 1 };
    const s = createBattle(p, createTurbid());
    s.monsters.push(spawnMonster(MONSTERS[0]!, 1, 1, 500, 270, 'normal'));
    tickBattle(s, 1 / 60, new Rng(3));
    expect(s.lastBreakdown!.isCrit).toBe(true);
  });
});
