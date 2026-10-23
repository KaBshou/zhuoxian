/**
 * 损伤详解面板（按 D 开关）的独立一致性验收。
 *
 * 与 `tests/breakdown.test.ts`（作者版，只覆盖层 1 + `MONSTERS[0]`）互补：
 * 这里刻意换**不同的怪 / 不同的层 / 镇守 / 神通路径 / 多组种子**，
 * 守的是同一件事——面板读的数字必须就是刚打出去那一下的 `computeDamage` 结果，
 * 不许为了面板好看另算一套（另算一套的典型症状：数字对得上但差 1、暴击时反而更小）。
 *
 * 数据源：`src/core/battle.ts` 的 `BattleState.lastBreakdown`（playerStrike L665 / skillStrike L605 写入）。
 */
import { describe, expect, it } from 'vitest';

import {
  createBattle,
  createPlayerBattle,
  playerBattleFromCharacter,
  spawnMonster,
  tickBattle,
} from '../src/core/battle';
import { createCharacter } from '../src/core/character';
import { Rng } from '../src/core/rng';
import { createTurbid } from '../src/core/turbid';
import type { BattleState, PlayerBattle } from '../src/core/battle';
import type { MonsterDef } from '../src/data/monsters';
import { bossOfTier, monstersOfTier } from '../src/data/monsters';

/** 攻伐 60、出手 1/s、不暴击、射程 200 —— 一击打不死任何一只（后续断言依赖「怪还活着」）。 */
function makePlayer(overrides: Partial<PlayerBattle> = {}): PlayerBattle {
  const base = createPlayerBattle({
    maxHp: 500,
    level: 1,
    armor: 0,
    damage: 60,
    attackSpeed: 1,
    critChance: 0,
    range: 200,
  });
  return { ...base, ...overrides };
}

/** 造一场只有一只怪的战斗，怪贴在玩家脸上（保证在射程内）。 */
function battleWith(def: MonsterDef, floor: number, player: PlayerBattle) {
  const s = createBattle(player, createTurbid());
  const m = spawnMonster(def, floor, 1, player.x + 40, player.y);
  s.monsters.push(m);
  return { s, m };
}

/** 打一帧，返回这一帧的拆解。 */
function strikeOnce(
  def: MonsterDef,
  floor: number,
  seed: number,
  critChance: number,
): { amount: number; isCrit: boolean; label: string; steps: number } {
  const { s } = battleWith(def, floor, makePlayer({ critChance }));
  tickBattle(s, 1 / 60, new Rng(seed));
  const bd = s.lastBreakdown;
  if (bd === null) throw new Error('这一帧没有产生 lastBreakdown');
  return { amount: bd.amount, isCrit: bd.isCrit, label: bd.label, steps: bd.steps.length };
}

function lastStepAfter(s: BattleState): number {
  const bd = s.lastBreakdown;
  if (bd === null) throw new Error('lastBreakdown 为 null');
  const last = bd.steps[bd.steps.length - 1];
  if (last === undefined) throw new Error('steps 为空，链条断了');
  return last.after;
}

describe('损伤详解一致性（独立版：换怪 / 换层 / 镇守 / 神通）', () => {
  it('① 面板金额 = 怪的真实掉血（普通怪 × 三阶 × 镇守，四种层位）', () => {
    const cases: readonly { what: string; floor: number; def: MonsterDef }[] = [
      { what: '一阶普通怪 @ 层 9', floor: 9, def: monstersOfTier(1)[0]! },
      { what: '二阶普通怪 @ 层 15', floor: 15, def: monstersOfTier(2)[1]! },
      { what: '三阶普通怪 @ 层 24', floor: 24, def: monstersOfTier(3)[2]! },
      { what: '三阶镇守 @ 层 27', floor: 27, def: bossOfTier(3)! },
    ];

    for (const c of cases) {
      expect(c.def, `${c.what} 的怪定义不存在`).toBeDefined();
      const { s, m } = battleWith(c.def, c.floor, makePlayer());
      // 前提：这一击打不死它（打死了 hp 会被钳到 0，等式就不再成立）
      expect(m.maxHp, `${c.what} 血量太低，一击就死`).toBeGreaterThan(150);

      const before = m.hp;
      tickBattle(s, 1 / 60, new Rng(20261021 + c.floor));
      expect(m.hp, `${c.what} 被一击打死，换更厚的怪或更深层`).toBeGreaterThan(0);

      const bd = s.lastBreakdown;
      expect(bd, `${c.what} 没有产生损伤详解`).not.toBeNull();
      expect(bd!.steps.length, `${c.what} 拆解为空`).toBeGreaterThan(0);
      expect(bd!.amount, `${c.what} 伤害非正`).toBeGreaterThanOrEqual(1);
      // 核心断言：面板数字 = 真实掉血，一位都不许差
      expect(before - m.hp, `${c.what}：面板 ${bd!.amount} ≠ 实际掉血 ${before - m.hp}`).toBe(
        bd!.amount,
      );
      // 飘字 / 事件里的数字必须同源，否则同一个伤害会有两个数
      const evt = s.events.find((e) => e.kind === 'player-hit' || e.kind === 'player-crit');
      expect(evt?.amount, `${c.what} 飘字金额与面板不一致`).toBe(bd!.amount);
      expect(bd!.label, `${c.what} 标签不对`).toBe(`普攻 → ${m.name}`);
    }
  });

  it('② 链条不断：最后一步 after 与 amount 差 ≤1（普攻路径，多层）', () => {
    for (const floor of [7, 18, 27]) {
      const { s } = battleWith(monstersOfTier(3)[0]!, floor, makePlayer());
      tickBattle(s, 1 / 60, new Rng(777 + floor));
      const amount = s.lastBreakdown!.amount;
      expect(Math.abs(lastStepAfter(s) - amount), `层 ${floor} 链条末端与最终伤害差过大`).toBeLessThanOrEqual(1);
    }
  });

  it('② 链条不断：神通路径（step 27 解锁的神通，打三阶怪）', () => {
    const ch = createCharacter('yujian');
    const stepped = { ...ch, step: 27 };
    const p = playerBattleFromCharacter(stepped);
    const s = createBattle(p, stepped.turbid, stepped);
    expect(s.skillRotation.length, 'step 27 应该有可施放神通').toBeGreaterThan(0);

    const m = spawnMonster(monstersOfTier(3)[0]!, 20, 1, p.x + 40, p.y);
    s.monsters.push(m);
    const before = m.hp;
    tickBattle(s, 1 / 60, new Rng(31337));

    const bd = s.lastBreakdown;
    expect(bd, '神通出手没有产生拆解').not.toBeNull();
    // 走的是 skillStrike 而不是普攻兜底
    expect(bd!.label, `期望神通标签，实际是「${bd!.label}」`).not.toContain('普攻');
    expect(bd!.label).toContain('→');
    expect(bd!.steps.length).toBeGreaterThan(0);
    expect(before - m.hp, '神通：面板金额 ≠ 实际掉血').toBe(bd!.amount);
    expect(Math.abs(lastStepAfter(s) - bd!.amount), '神通：链条末端与最终伤害差过大').toBeLessThanOrEqual(1);
  });

  it('③ 同源：同种子的暴击伤害 ≥ 非暴击（多组种子，不许出现「暴击更小」）', () => {
    const def = monstersOfTier(2)[0]!;
    for (const seed of [1, 7, 13, 99, 424242]) {
      const hit = strikeOnce(def, 11, seed, 0);
      const crit = strikeOnce(def, 11, seed, 1);
      expect(hit.isCrit, `种子 ${seed}：critChance=0 却判成暴击`).toBe(false);
      expect(crit.isCrit, `种子 ${seed}：critChance=1 却没判成暴击`).toBe(true);
      // 默认破绽倍率 1.5、伤害浮动 0.9~1.1、四舍五入 ±0.5 —— 理论上限比 ≥1.22，留到 1.2
      expect(
        crit.amount,
        `种子 ${seed}：暴击 ${crit.amount} < 非暴击 ${hit.amount}（面板与实战不同源的典型症状）`,
      ).toBeGreaterThan(hit.amount);
      expect(crit.amount / hit.amount, `种子 ${seed}：暴击倍率异常`).toBeGreaterThan(1.2);
    }
  });

  it('④ 面板逐次刷新：第二次出手是新对象、新数字，不是开局缓存', () => {
    // 用层 27 的三阶怪（血量足够厚，两次都不该死，否则 hp 会被钳到 0）
    const { s, m } = battleWith(monstersOfTier(3)[3]!, 27, makePlayer());
    tickBattle(s, 1 / 60, new Rng(555));
    const first = s.lastBreakdown;
    expect(first).not.toBeNull();

    // 出手间隔 1s，最多等 2 秒；在「拆解被替换的那一帧」就地核对掉血
    let guard = 0;
    let checked = false;
    while (!checked && guard < 130) {
      const hpBefore = m.hp;
      tickBattle(s, 1 / 60, new Rng(556 + guard));
      if (s.lastBreakdown !== first) {
        const second = s.lastBreakdown!;
        expect(second, '第二次出手没有替换拆解对象').not.toBe(first);
        expect(hpBefore - m.hp, '第二次出手：面板金额 ≠ 实际掉血').toBe(second.amount);
        expect(second.amount).toBeGreaterThanOrEqual(1);
        checked = true;
      }
      guard += 1;
    }
    expect(checked, '两秒内没有第二次出手').toBe(true);
  });

  it('⑤ 致死一击：面板金额 ≥ 剩余血量（面板是「我打了多少」，血条是「你还剩多少」）', () => {
    // 口径（lead m01975 定）：致死那一击 `before - hp` 只等于剩余血量，
    // 因为死亡分支会把 hp 钳到 0。所以这里不是等式，而是「面板不许少于实际掉的血」。
    const def = monstersOfTier(1)[0]!;
    const { s, m } = battleWith(def, 1, makePlayer({ damage: 400 }));
    const before = m.hp;
    expect(before, '要构造致死一击，怪必须先有血').toBeGreaterThan(0);

    tickBattle(s, 1 / 60, new Rng(2468));

    const bd = s.lastBreakdown;
    expect(bd, '致死一击没有产生拆解').not.toBeNull();
    expect(m.hp, '400 攻伐打层 1 的怪应该致死').toBe(0);
    expect(bd!.amount, `面板 ${bd!.amount} < 实际掉的血 ${before}（面板说谎）`).toBeGreaterThanOrEqual(
      before,
    );
    // 链条在致死一击上也要闭合：显示的是全量伤害，不是被血条截断后的部分
    expect(Math.abs(lastStepAfter(s) - bd!.amount)).toBeLessThanOrEqual(1);
    expect(s.events.some((e) => e.kind === 'player-kill'), '致死一击没有产生击杀事件').toBe(true);
  });
});
