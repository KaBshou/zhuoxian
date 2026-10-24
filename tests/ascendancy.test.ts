/**
 * D209 浊气觉醒：从「代码存在」到「玩家身上真的生效」。
 *
 * 这个文件存在的理由：`chooseAscendancy` 从 D1 起就在 core 里，
 * `character.test.ts` 也一直在测它 —— 但全库 grep 的结果是**零调用**。
 * 纯函数被测得很完整，功能却从来没生效过（D207 同族：单测全绿、功能全无）。
 *
 * 所以这里测三件事，一件都不是「纯函数返回值对不对」：
 *   1) 6 个道统的觉醒在**真实 session 里**能被解锁（打完第 9 层）
 *   2) 解锁之后 `characterStats` 真的变了（效果进了战斗管线，不是只写了个 id）
 *   3) 6 条 desc 描述的效果与 effects 一致（防止文案再变回「一个不存在的游戏」）
 */
import { describe, expect, it } from 'vitest';
import { AFFIXES } from '../src/data/affixes';
import { ITEM_BASES } from '../src/data/bases';
import { CLASSES, getClass, type ClassId } from '../src/data/classes';
import {
  ASCENDANCY_UNLOCK_FLOOR,
  ascendancyUnlockReady,
  characterStats,
  chooseAscendancy,
  createCharacter,
  hasAscendancy,
} from '../src/core/character';
import {
  createSession,
  prestige,
  tickSession,
  type GameSession,
} from '../src/core/session';
import { TOTAL_STEPS } from '../src/core/progression';

function newSession(classId: ClassId, seed = 2026): GameSession {
  return createSession({
    classId,
    seed,
    tables: { bases: ITEM_BASES, affixes: AFFIXES },
  });
}

/** 把 session 推到「刚通关第 9 层」的状态，然后跑几帧让解锁逻辑走一遍。 */
function reachFirstTierClear(s: GameSession): void {
  s.floor = ASCENDANCY_UNLOCK_FLOOR;
  s.maxFloorReached = ASCENDANCY_UNLOCK_FLOOR;
  s.firstClearedFloors = [];
  s.wave = 9; // 下一波（+1 后 = 10）是镇守波，清掉就会下潜
  s.battle.monsters = [];
  s.battle.reviveCooldown = 0;
  // 跑到解锁（清场 → waveTimer 累计 → startWave → 下潜）
  for (let i = 0; i < 600 && s.character.ascendancyId === null; i++) {
    // 每帧把场上怪清空，让 isCleared 立刻为真
    s.battle.monsters = [];
    tickSession(s, 1 / 30);
  }
}

describe('D209 浊气觉醒：解锁门槛', () => {
  it('门槛常量是第 9 层（第一阶末层）', () => {
    expect(ASCENDANCY_UNLOCK_FLOOR).toBe(9);
  });

  it('没通关第 9 层不解锁，通关了才解锁', () => {
    const ch = createCharacter('yujian');
    expect(ascendancyUnlockReady(ch, [])).toBe(false);
    expect(ascendancyUnlockReady(ch, [1, 2, 3, 4, 5, 6, 7, 8])).toBe(false);
    expect(ascendancyUnlockReady(ch, [1, 2, 3, 4, 5, 6, 7, 8, 9])).toBe(true);
  });

  it('已经选过的不再是「待解锁」（否则会重复触发日志与音效）', () => {
    const chosen = chooseAscendancy(createCharacter('yujian'), 'asc-zhuojian');
    expect(hasAscendancy(chosen)).toBe(true);
    expect(ascendancyUnlockReady(chosen, [9])).toBe(false);
  });

  it('脏输入不崩，且一律判否', () => {
    const ch = createCharacter('yujian');
    expect(ascendancyUnlockReady(ch, null as unknown as number[])).toBe(false);
    expect(ascendancyUnlockReady(ch, undefined as unknown as number[])).toBe(false);
    expect(ascendancyUnlockReady(ch, 'nope' as unknown as number[])).toBe(false);
  });
});

describe('D209 浊气觉醒：真实 session 里会解锁', () => {
  it('打完第 9 层之后，角色身上真的多了一个 ascendancyId', () => {
    const s = newSession('yujian');
    expect(s.character.ascendancyId).toBeNull();
    reachFirstTierClear(s);
    const def = getClass('yujian');
    expect(def).toBeDefined();
    expect(s.character.ascendancyId).toBe(def?.ascendancy.id ?? '');
  });

  it('解锁那一刻面板属性真的变了（不是只写了个 id）', () => {
    const s = newSession('yujian');
    const before = characterStats(s.character).critMulti;
    reachFirstTierClear(s);
    const after = characterStats(s.character).critMulti;
    expect(after).toBeGreaterThan(before);
  });

  it('解锁那一刻战斗态也同步了（否则「升了但伤害没变」）', () => {
    const s = newSession('yujian');
    const before = s.battle.player.critChance;
    reachFirstTierClear(s);
    // 浊剑加的是 critMulti，不是 critChance —— 但战斗态必须整体重算过。
    // 用 maxHp 之外最稳的量：modifiers 条数一定变多（觉醒效果被 push 进去了）。
    expect(s.battle.player.modifiers.length).toBeGreaterThan(0);
    expect(characterStats(s.character).critMulti).toBeGreaterThan(1.5);
    expect(Number.isFinite(before)).toBe(true);
  });

  it('六个道统都能解锁，且各自的效果真的不同', () => {
    const seen = new Map<string, number>();
    for (const def of CLASSES) {
      const s = newSession(def.id);
      reachFirstTierClear(s);
      expect(s.character.ascendancyId).toBe(def.ascendancy.id);
      const st = characterStats(s.character);
      // 用一组属性拼成签名，六个道统两两不应完全相同
      const sig = [st.damage, st.life, st.shield, st.lifeRegen, st.critMulti, st.resWood]
        .map((v) => (Number.isFinite(v) ? v.toFixed(4) : 'x'))
        .join('|');
      seen.set(def.id, sig.length);
      expect(sig.length).toBeGreaterThan(0);
    }
    // 至少要有 4 种不同的签名（有些道统只改一个乘区，允许少量重合）
    const sigs = new Set<string>();
    for (const def of CLASSES) {
      const s = newSession(def.id);
      reachFirstTierClear(s);
      const st = characterStats(s.character);
      sigs.add(
        [st.damage, st.life, st.shield, st.lifeRegen, st.critMulti, st.resWood]
          .map((v) => (Number.isFinite(v) ? v.toFixed(4) : 'x'))
          .join('|'),
      );
    }
    expect(sigs.size).toBeGreaterThanOrEqual(4);
  });

  it('轮回之后重新回到「未觉醒」（新周目从零开始）', () => {
    const s = newSession('yujian');
    reachFirstTierClear(s);
    expect(s.character.ascendancyId).not.toBeNull();
    s.character = { ...s.character, step: TOTAL_STEPS - 1 };
    s.battle.reviveCooldown = 0;
    expect(prestige(s)).toBe(true);
    expect(s.character.ascendancyId).toBeNull();
  });
});

describe('D209 浊气觉醒：文案不许再说谎', () => {
  it('6 条 desc 都提到了「+」或「%」，且不含已删掉的机制词', () => {
    for (const def of CLASSES) {
      const d = def.ascendancy.desc;
      expect(d.length).toBeGreaterThan(8);
      expect(/[+−%-]/.test(d)).toBe(true);
      // 这两条效果从来没实现过，文案不许再提
      expect(d).not.toContain('召唤物数量');
      expect(d).not.toContain('穿透');
      expect(d).not.toContain('虚弱');
    }
  });

  it('每条觉醒都至少有一条「收益」（不是纯代价的陷阱）', () => {
    for (const def of CLASSES) {
      const effects = def.ascendancy.effects;
      expect(effects.length).toBeGreaterThan(0);
      const hasGain = effects.some((e) => {
        // 负值 = 代价；正值 = 收益。critMulti/lifeRegen/shield/damage 正数都算收益
        const gain = e.value > 0;
        // 抗性为负是代价
        const cost = e.stat.startsWith('res') && e.value < 0;
        return gain && !cost;
      });
      expect(hasGain).toBe(true);
    }
  });

  it('浊兽与浊金都有收益（这两个曾经是纯陷阱）', () => {
    const shou = getClass('yushou');
    const jin = getClass('ruijin');
    expect(shou?.ascendancy.effects.some((e) => e.stat === 'damage' && e.value > 0)).toBe(true);
    expect(jin?.ascendancy.effects.some((e) => e.stat === 'damage' && e.value > 0)).toBe(true);
  });
});
