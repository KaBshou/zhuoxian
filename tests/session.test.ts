/**
 * 一局游戏的整链路测试。
 *
 * 这里测的不是某个函数，而是「怪死了 → 修为涨了 → 掉了装备 → 换上了」
 * 这条链有没有断。单测每个零件都绿、整条链断了，是最常见的失败。
 */

import { describe, expect, it } from 'vitest';
import {
  BOSS_EVERY,
  WAVE_SIZE,
  breakthroughLogText,
  createSession,
  liveMonsters,
  startWave,
  syncBattleFromCharacter,
  tickSession,
  type GameSession,
} from '../src/core/session';
import { AFFIXES } from '../src/data/affixes';
import { ITEM_BASES } from '../src/data/bases';
import { MAX_FLOOR } from '../src/data/monsters';
import { characterStats } from '../src/core/character';

const TABLES = { bases: ITEM_BASES, affixes: AFFIXES };

function makeSession(seed = 12345): GameSession {
  return createSession({ classId: 'yujian', seed, tables: TABLES });
}

/** 跑 N 秒（按 60fps 固定步长，和真实主循环一致） */
function run(s: GameSession, seconds: number): void {
  const dt = 1 / 60;
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) tickSession(s, dt);
}

describe('一局游戏：初始化', () => {
  it('开局有角色、有战斗、没怪、没掉落', () => {
    const s = makeSession();
    expect(s.character.step).toBe(0);
    expect(s.character.equipment.sword?.name).toBe('铁剑');
    expect(s.bag).toEqual([]);
    expect(s.ground).toEqual([]);
    expect(s.wave).toBe(0);
    expect(s.floor).toBe(1);
    expect(s.battle.monsters).toEqual([]);
  });

  it('开波之后场上有怪，且不是贴脸生成', () => {
    const s = makeSession();
    startWave(s);
    expect(s.wave).toBe(1);
    expect(s.battle.monsters.length).toBe(WAVE_SIZE);
    const p = s.battle.player;
    for (const m of s.battle.monsters) {
      const d = Math.hypot(m.x - p.x, m.y - p.y);
      expect(d).toBeGreaterThan(100);
    }
  });

  it('第 5 波是镇守波，只有一只但更硬', () => {
    const s = makeSession();
    s.wave = BOSS_EVERY - 1;
    startWave(s);
    expect(s.battle.monsters.length).toBe(1);
    expect(s.battle.monsters[0]?.rarity).toBe('boss');
  });
});

describe('一局游戏：跑起来', () => {
  it('跑 30 秒能杀怪、涨修为、涨浊气', () => {
    const s = makeSession();
    startWave(s);
    run(s, 30);
    expect(s.battle.kills).toBeGreaterThan(0);
    expect(s.character.xp + s.character.step * 1000).toBeGreaterThan(0);
    expect(s.battle.xpGained).toBeGreaterThan(0);
    expect(s.battle.turbid.value).toBeGreaterThan(0);
  });

  it('跑 30 秒后怪没被卡在画面外（都在战场范围内）', () => {
    const s = makeSession();
    startWave(s);
    run(s, 30);
    for (const m of liveMonsters(s)) {
      expect(m.x).toBeGreaterThan(-50);
      expect(m.x).toBeLessThan(1010);
      expect(m.y).toBeGreaterThan(-50);
      expect(m.y).toBeLessThan(590);
    }
  });

  it('跑 60 秒不会出现 NaN（NaN 会一路污染所有数字）', () => {
    const s = makeSession();
    startWave(s);
    run(s, 60);
    expect(Number.isFinite(s.battle.player.hp)).toBe(true);
    expect(Number.isFinite(s.battle.player.x)).toBe(true);
    expect(Number.isFinite(s.character.xp)).toBe(true);
    expect(Number.isFinite(s.battle.turbid.value)).toBe(true);
    for (const m of s.battle.monsters) {
      expect(Number.isFinite(m.hp)).toBe(true);
    }
  });

  it('会掉装备（跑够久总得掉点东西）', () => {
    const s = makeSession(777);
    startWave(s);
    run(s, 90);
    expect(s.dropsFound).toBeGreaterThan(0);
  });

  it('掉的东西会被自动拾取，地上的不会永远堆着', () => {
    const s = makeSession(777);
    startWave(s);
    run(s, 90);
    // 拾取延迟 0.9s，跑 90 秒之后地上不该还留着大量过期的
    const stale = s.ground.filter((g) => g.age > 3);
    expect(stale.length).toBe(0);
  });
});

describe('一局游戏：波次推进', () => {
  it('清场之后会开下一波', () => {
    const s = makeSession(999);
    startWave(s);
    // 直接把怪打死，验证「清场 → 下一波」这条链
    for (const m of s.battle.monsters) m.hp = 0;
    run(s, 2);
    expect(s.wave).toBeGreaterThanOrEqual(2);
    expect(s.battle.monsters.length).toBeGreaterThan(0);
  });

  it('打完第 5 波镇守下潜 1 层（1 层 → 2 层，逐层下潜）', () => {
    // 曾写 +3：与 MAX_FLOOR=9 组合出现 1→4→7→9，层 2/3/5/6/8 永不出现
    const s = makeSession(4242);
    s.wave = BOSS_EVERY - 1;
    s.floor = 1;
    startWave(s);
    for (const m of s.battle.monsters) m.hp = 0;
    run(s, 2);
    expect(s.floor).toBe(2);
  });

  it('27 层封顶（BALANCE v2：27 层 = 5.8h）', () => {
    const s = makeSession(4242);
    s.floor = MAX_FLOOR;
    s.wave = BOSS_EVERY - 1;
    startWave(s);
    for (const m of s.battle.monsters) m.hp = 0;
    run(s, 2);
    expect(s.floor).toBe(MAX_FLOOR);
  });
});

describe('一局游戏：突破会同步战斗态', () => {
  it('突破之后气血上限跟着涨（否则升境界没感觉）', () => {
    const s = makeSession(31337);
    startWave(s);
    const before = s.battle.player.maxHp;
    // 直接灌修为，模拟打了很久
    s.character = { ...s.character, xp: 999999 };
    run(s, 0.05);
    // 手动触发一次同步（tick 里只有击杀才会同步，这里模拟突破后的那次）
    syncBattleFromCharacter(s);
    const after = s.battle.player.maxHp;
    expect(after).toBeGreaterThanOrEqual(before);
    // 面板和战斗态必须一致
    const st = characterStats(s.character);
    expect(s.battle.player.maxHp).toBe(st.life);
  });

  it('换装备之后伤害会变（面板→战斗态这条桥是通的）', () => {
    const s = makeSession(1);
    // 换一把更强的剑
    s.character = {
      ...s.character,
      equipment: {
        ...s.character.equipment,
        sword: {
          uid: 'test-sword',
          slot: 'sword',
          rarity: 'bao',
          ilvl: 30,
          name: '测试法剑',
          base: [{ stat: 'damage', op: 'flat', value: 60 }],
          affixes: [],
        },
      },
    };
    syncBattleFromCharacter(s);
    // 武器基底伤害走修正器管线（p.damage 只留拳脚基础 5，这是"铁剑双算"事故后的规矩），
    // 所以"桥是通的"判据 = 法剑的 flat 60 出现在了战斗态的修正器列表里
    const hasSwordFlat = s.battle.player.modifiers.some(
      (m) => m.stat === 'damage' && m.op === 'flat' && m.value === 60,
    );
    expect(hasSwordFlat).toBe(true);
    // 且拳脚基础仍是 5（基础值只能有一个来源）
    expect(s.battle.player.damage).toBe(5);
  });

  it('同步战斗态不会回满血（否则换装备能当药吃）', () => {
    const s = makeSession(1);
    s.battle.player.hp = Math.round(s.battle.player.maxHp * 0.3);
    const hpBefore = s.battle.player.hp;
    syncBattleFromCharacter(s);
    expect(s.battle.player.hp).toBeLessThanOrEqual(hpBefore);
  });
});

describe('一局游戏：浮字与日志', () => {
  it('打起来会有浮字，且过一会儿自动消失（不会无限堆积）', () => {
    const s = makeSession(2024);
    startWave(s);
    // 浮字只在命中时产生、且有寿命（约 1s），所以在「某个时刻」采样必然偶发为 0
    // （D145 每阶 +2 只怪后 rng 序列移位，t=10s 恰好落在两次命中的空档里）。
    // 正解是采「窗口内出现过的最大值」而不是窗口末尾的快照 —— 后者测的是采样时刻。
    let maxFloats = 0;
    for (let sec = 0; sec < 10; sec++) {
      run(s, 1);
      maxFloats = Math.max(maxFloats, s.floats.length);
    }
    expect(maxFloats).toBeGreaterThan(0);
    // 跑久一点，浮字数量必须有上限
    run(s, 60);
    expect(s.floats.length).toBeLessThan(120);
  });

  it('日志最多留 6 行', () => {
    const s = makeSession(2024);
    startWave(s);
    run(s, 120);
    expect(s.log.length).toBeLessThanOrEqual(6);
  });
});

/**
 * D180：满级那一下的日志文案。
 *
 * 旧实现一视同仁写 `突破 ${step+1} 重`，满级时会打印「突破 81 重」——
 * 一个**不存在的境界**（九境九重 = 81 台阶，没有「第 81 重」），
 * 而且完全没提「按 N 能轮回」，玩家会以为游戏卡在满级不动。
 */
describe('突破日志文案（D180）', () => {
  it('普通突破写「突破 N 重」', () => {
    expect(breakthroughLogText(0)).toBe('突破 1 重');
    expect(breakthroughLogText(39)).toBe('突破 40 重');
    expect(breakthroughLogText(79)).toBe('突破 80 重');
  });

  it('满级（step 80）不写重数，改写「渡劫圆满 + 按 N 入轮回」', () => {
    const text = breakthroughLogText(80);
    expect(text).toContain('渡劫圆满');
    expect(text).toContain('按 N');
    expect(text).not.toContain('81');
  });

  it('脏值不崩、不产生 NaN/Infinity', () => {
    expect(breakthroughLogText(Number.NaN)).toBe('突破 1 重');
    expect(breakthroughLogText(-5)).toBe('突破 1 重');
    expect(breakthroughLogText(Number.POSITIVE_INFINITY)).toBe('突破 1 重');
    expect(breakthroughLogText(999)).toBe('渡劫圆满 · 第九境已成 —— 按 N 入轮回');
  });
});
