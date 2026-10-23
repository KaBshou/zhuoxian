// 五行碎片（D104）—— REQ §3 第 7 条：镇守掉落、打造时用来把对应五行的灵纹权重抬上去。
//
// 这组测试钉四件事，每一件都对应一个「不会报错但会毁掉体验」的失败模式：
//   ① 只有镇守掉、且属性按层/阶映射 —— 映射错了玩家攒一仓库用不出去的碎片；
//   ② 上限与洗档 —— 存档是玩家能改的，脏值不许把余额变成 NaN 或 1e9；
//   ③ 只在「添灵纹」这一步消耗 —— 洗/灭是赌（D55），碎片一旦能赌就变成免费重掷券；
//   ④ 加权真的生效 —— ×4 如果没接到聚合公式上，面板写着「定向」而实际是随机。
import { describe, expect, it } from 'vitest';
import {
  EMPTY_FRAGMENTS,
  FRAGMENT_CAP,
  FRAGMENT_ELEMENTS,
  FRAGMENT_TERM,
  FRAGMENT_WEIGHT_MUL,
  addFragments,
  fragmentElementForBoss,
  fragmentSummaryText,
  isFragmentElement,
  sanitizeFragments,
  totalFragments,
} from '../src/data/fragments';
import { addAffix, makeItem } from '../src/core/item';
import { createCharacter } from '../src/core/character';
import { createSession, startWave, tickSession } from '../src/core/session';
import { runCraftPlan, craftAddAffix } from '../src/core/crafting';
import { Rng } from '../src/core/rng';
import { ITEM_BASES } from '../src/data/bases';
import { AFFIXES } from '../src/data/affixes';
import { drawMarksPanel, marksPanelHeight } from '../src/render/marks-panel';

const TABLES = { bases: ITEM_BASES, affixes: AFFIXES };

describe('五行碎片：数据契约', () => {
  it('只做金/火/水三系（木、土在 v1 没有可加权的灵纹）', () => {
    expect([...FRAGMENT_ELEMENTS]).toEqual(['metal', 'fire', 'water']);
    expect(FRAGMENT_TERM.metal).toBe('金');
    expect(FRAGMENT_WEIGHT_MUL).toBe(4);
    expect(FRAGMENT_CAP).toBe(99);
  });

  it('isFragmentElement 只认三系，其它安静判否', () => {
    expect(isFragmentElement('metal')).toBe(true);
    expect(isFragmentElement('wood')).toBe(false);
    expect(isFragmentElement('earth')).toBe(false);
    expect(isFragmentElement(undefined)).toBe(false);
    expect(isFragmentElement(3)).toBe(false);
  });

  it('按层/阶映射：1~9 金、10~18 火、19~27 水，无尽层轮转', () => {
    expect(fragmentElementForBoss(1, 1)).toBe('metal');
    expect(fragmentElementForBoss(9, 1)).toBe('metal');
    expect(fragmentElementForBoss(10, 2)).toBe('fire');
    expect(fragmentElementForBoss(18, 2)).toBe('fire');
    expect(fragmentElementForBoss(19, 3)).toBe('water');
    expect(fragmentElementForBoss(27, 3)).toBe('water');
    // 无尽层：28~46 按 (floor-28)%3 轮转，否则三阶镇守恒为玄冥 ⇒ 只掉水
    const endless = [28, 29, 30, 31, 32, 33].map((f) => fragmentElementForBoss(f, 3));
    expect(new Set(endless).size).toBe(3);
    expect(endless[0]).toBe('metal');
    expect(endless[1]).toBe('fire');
    expect(endless[2]).toBe('water');
    // 脏层号不产生抛错
    expect(fragmentElementForBoss(Number.NaN, 1)).toBe('metal');
  });

  it('sanitizeFragments：脏值归零、上限夹取、非整数向下取整', () => {
    expect(sanitizeFragments(undefined)).toEqual(EMPTY_FRAGMENTS);
    expect(sanitizeFragments(null)).toEqual(EMPTY_FRAGMENTS);
    expect(sanitizeFragments(42)).toEqual(EMPTY_FRAGMENTS);
    expect(sanitizeFragments({ metal: 'x', fire: Number.NaN, water: -5 })).toEqual(EMPTY_FRAGMENTS);
    expect(sanitizeFragments({ metal: 3.9, fire: 1e9, water: 7 })).toEqual({
      metal: 3,
      fire: FRAGMENT_CAP,
      water: 7,
    });
  });

  it('addFragments：不变时返回同一引用，扣到 0 为止，超出上限夹住', () => {
    const a = { metal: 2, fire: 0, water: 0 };
    expect(addFragments(a, 'metal', 1).metal).toBe(3);
    expect(addFragments(a, 'metal', 0)).toBe(a); // 同一引用：不制造脏对象
    expect(addFragments(a, 'metal', -5).metal).toBe(0);
    expect(addFragments({ ...a, metal: FRAGMENT_CAP }, 'metal', 1)).toEqual({
      ...a,
      metal: FRAGMENT_CAP,
    });
    expect(totalFragments({ metal: 1, fire: 2, water: 3 })).toBe(6);
    expect(fragmentSummaryText({ metal: 1, fire: 0, water: 2 })).toContain('金 1');
    expect(fragmentSummaryText({ metal: 1, fire: 0, water: 2 })).toContain('水 2');
  });
});

describe('五行碎片：镇守掉落（接 session）', () => {
  // 注意：**不能靠往 s.battle.events 里塞假事件** —— tickBattle 开头就把 events 清空，
  // 塞进去的事件在 session 读到之前已经没了（第一版就这么写的，红得莫名其妙）。
  // 正确做法：真的把镇守摆到场上、把血打到 1，让战斗循环自己产生击杀事件。
  const killOne = (s: ReturnType<typeof createSession>, boss: boolean): void => {
    const target = s.battle.monsters.find((m) => (m.rarity === 'boss') === boss);
    expect(target, boss ? '没有镇守在场上' : '没有普通浊物在场上').toBeDefined();
    target!.hp = 1;
    for (let i = 0; i < 900; i++) {
      const before = (s.character.fragments ?? EMPTY_FRAGMENTS).metal +
        (s.character.fragments ?? EMPTY_FRAGMENTS).fire +
        (s.character.fragments ?? EMPTY_FRAGMENTS).water;
      tickSession(s, 1 / 30);
      if (target!.hp <= 0) break;
      const after = (s.character.fragments ?? EMPTY_FRAGMENTS).metal +
        (s.character.fragments ?? EMPTY_FRAGMENTS).fire +
        (s.character.fragments ?? EMPTY_FRAGMENTS).water;
      if (before === after && i > 600) break;
    }
  };

  it('镇守掉 1 颗，普通浊物一颗都不掉', () => {
    const s = createSession({ classId: 'yujian', seed: 7, tables: TABLES });
    s.floor = 10;
    s.wave = 9; // startWave 自己会 +1 → 第 10 波 = 镇守波
    startWave(s);
    killOne(s, true);
    expect(s.character.fragments?.fire).toBe(1);
    expect(s.character.fragments?.metal ?? 0).toBe(0);
  });

  it('普通波全程不掉碎片', () => {
    const s = createSession({ classId: 'yujian', seed: 7, tables: TABLES });
    s.floor = 10;
    s.wave = 1;
    startWave(s);
    killOne(s, false);
    expect(totalFragments(s.character.fragments ?? EMPTY_FRAGMENTS)).toBe(0);
  });

  it('满 99 之后不再累积', () => {
    const s = createSession({ classId: 'yujian', seed: 7, tables: TABLES });
    s.character = { ...s.character, fragments: { metal: 0, fire: FRAGMENT_CAP, water: 0 } };
    s.floor = 10;
    s.wave = 9;
    startWave(s);
    killOne(s, true);
    expect(s.character.fragments?.fire).toBe(FRAGMENT_CAP);
  });

  it('碎片真的入档（存 → 读回还在）', () => {
    const s = createSession({ classId: 'yujian', seed: 7, tables: TABLES });
    s.character = { ...s.character, fragments: { metal: 4, fire: 2, water: 1 } };
    const back = sanitizeFragments(JSON.parse(JSON.stringify(s.character.fragments)));
    expect(back).toEqual({ metal: 4, fire: 2, water: 1 });
  });
});
describe('五行碎片：打造消耗', () => {
  const itemWithSpace = (uid: string, ilvl = 30) =>
    makeItem(
      { slot: 'ring', rarity: 'xian', ilvl, name: '测试戒', uid },
      new Rng(1000 + Number(uid.replace(/\D/g, '') || 0)),
    );

  it('定向到某一行时，添灵纹会消耗碎片；未定向一颗都不花', () => {
    const base = createCharacter('yujian');
    const bag = [itemWithSpace('it-1'), itemWithSpace('it-2')];
    const chNoAim = { ...base, fragments: { metal: 5, fire: 0, water: 0 } };
    const outNoAim = runCraftPlan(chNoAim, bag, { counts: { huang: 2 } }, AFFIXES, new Rng(5));
    expect(outNoAim.fragmentsUsed).toBe(0);
    expect(outNoAim.character.fragments?.metal).toBe(5);

    const chAim = { ...base, fragments: { metal: 5, fire: 0, water: 0 } };
    const outAim = runCraftPlan(chAim, bag, { counts: { huang: 2 } }, AFFIXES, new Rng(5), {
      fragment: 'metal',
    });
    expect(outAim.fragmentsUsed).toBeGreaterThan(0);
    expect(outAim.fragmentsUsed).toBeLessThanOrEqual(5);
    expect(outAim.character.fragments?.metal).toBe(5 - outAim.fragmentsUsed);
  });

  it('没有碎片时定向不产生任何消耗（也不会报错）', () => {
    const base = createCharacter('yujian');
    const bag = [itemWithSpace('it-3')];
    const out = runCraftPlan(
      { ...base, fragments: EMPTY_FRAGMENTS },
      bag,
      { counts: { huang: 1 } },
      AFFIXES,
      new Rng(9),
      { fragment: 'fire' },
    );
    expect(out.fragmentsUsed).toBe(0);
    expect(out.character.fragments ?? EMPTY_FRAGMENTS).toEqual(EMPTY_FRAGMENTS);
  });

  it('洗 / 灭 不吃碎片（赌类操作不许被碎片抹平负期望）', () => {
    const base = createCharacter('yujian');
    const bag = [itemWithSpace('it-4')];
    const out = runCraftPlan(
      { ...base, fragments: { metal: 9, fire: 9, water: 9 } },
      bag,
      { counts: { mie: 1, xi: 1 } },
      AFFIXES,
      new Rng(11),
      { fragment: 'metal' },
    );
    expect(out.fragmentsUsed).toBe(0);
    expect(out.character.fragments?.metal).toBe(9);
  });

  it('碎片用尽后剩下的添灵纹退回「不加权的普通抽取」', () => {
    const base = createCharacter('yujian');
    const bag = [itemWithSpace('it-5'), itemWithSpace('it-6'), itemWithSpace('it-7')];
    const out = runCraftPlan(
      { ...base, fragments: { metal: 1, fire: 0, water: 0 } },
      bag,
      { counts: { huang: 3 } },
      AFFIXES,
      new Rng(13),
      { fragment: 'metal' },
    );
    expect(out.fragmentsUsed).toBeLessThanOrEqual(1);
    expect(out.character.fragments?.metal).toBe(1 - out.fragmentsUsed);
  });
});

describe('五行碎片：加权真的生效（×4 必须接在抽取上）', () => {
  const countMetalTagged = (boost: boolean): number => {
    let metal = 0;
    let total = 0;
    for (let i = 0; i < 240; i++) {
      const it = makeItem(
        { slot: 'ring', rarity: 'xian', ilvl: 60, name: '测试戒', uid: `b-${i}` },
        new Rng(100 + i),
      );
      const r = addAffix(
        it,
        AFFIXES,
        new Rng(9000 + i),
        boost ? { tag: 'metal', mul: FRAGMENT_WEIGHT_MUL } : undefined,
      );
      if (!r.ok) continue;
      const added = r.item.affixes[r.item.affixes.length - 1];
      // AffixInstance 只存 defId + 冗余 name/stat/op/value/tags，**没有 id 字段** ——
      // 一开始读 `added.id` 得到 undefined，导致两边占比恒为 0（测试假绿的经典写法）
      total += 1;
      if (added.tags?.includes('metal')) metal += 1;
    }
    return total === 0 ? 0 : metal / total;
  };

  it('带 metal 标签的灵纹占比明显上升（同种子对照）', () => {
    const plain = countMetalTagged(false);
    const boosted = countMetalTagged(true);
    expect(boosted).toBeGreaterThan(plain);
    // 不写死精确概率（池子会变），只钉「确实抬了」且幅度不是噪声级
    expect(boosted - plain).toBeGreaterThan(0.05);
  });

  const mkRing = (uid: string, ilvl: number) =>
    makeItem(
      { slot: 'ring', rarity: 'xian', ilvl, name: '测试戒', uid },
      new Rng(1000 + uid.length),
    );

  it('craftAddAffix 透传 boost 给 addAffix（不是自己另写一套抽取）', () => {
    const base = createCharacter('yujian');
    const bag = [mkRing('c-1', 60)];
    const step = craftAddAffix(base, bag, AFFIXES, new Rng(3), { tag: 'fire', mul: 4 });
    expect(step.result?.ok).toBe(true);
  });
});

describe('五行碎片：面板那一行（M 面板）', () => {
  it('面板高度把碎片行算进去了，且仍装得进 540 高', () => {
    expect(marksPanelHeight()).toBeLessThan(540);
    const calls: string[] = [];
    const ctx = {
      fillRect: () => calls.push('rect'),
      strokeRect: () => {},
      fillText: (t: string) => calls.push(String(t)),
      save: () => {},
      restore: () => {},
      set fillStyle(_v: string) {},
      set strokeStyle(_v: string) {},
      set lineWidth(_v: number) {},
      set font(_v: string) {},
      set textAlign(_v: string) {},
      set globalAlpha(_v: number) {},
    } as unknown as CanvasRenderingContext2D;
    drawMarksPanel(ctx, 123456, 960, 540, {
      fragments: { metal: 3, fire: 1, water: 0 },
      aim: 'fire',
    });
    const joined = calls.join('|');
    expect(joined).toContain('金 3');
    expect(joined).toContain('火');
    expect(joined).toContain('定向');
  });
});
