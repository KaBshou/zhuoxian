/**
 * 背包动作（D189）：穿上 / 丢弃。
 *
 * 这两条都是「自动换装没替玩家做的那一半」：
 * - 穿上：自动换装只在同部位战力 ≥1.02 时动手，玩家想穿一件「战力略低但有传奇/对口词条」的件时没有入口；
 * - 丢弃：背包 40 格满了会 `trimBag` 自动丢最弱的，但玩家想主动清垃圾时也没有入口。
 *
 * 钉子重点是有没有「凭空消失 / 凭空多出来」：
 * 穿上的那件必须离开背包，换下来的必须回到背包；丢弃只减不加（不给任何产出）。
 */
import { describe, expect, it } from 'vitest';
import { createSession, discardFromBag, equipFromBag } from '../src/core/session';
import { createCharacter, equip } from '../src/core/character';
import { ITEM_BASES } from '../src/data/bases';
import { AFFIXES } from '../src/data/affixes';
import type { Item } from '../src/core/item';

const TABLES = { bases: ITEM_BASES, affixes: AFFIXES };

function makeSession() {
  return createSession({ classId: 'yujian', seed: 2026, tables: TABLES });
}

function fakeItem(over: Partial<Item> = {}): Item {
  return {
    uid: `u-${Math.random().toString(36).slice(2, 8)}`,
    slot: 'sword',
    rarity: 'bao',
    ilvl: 20,
    name: '测试剑',
    base: [{ stat: 'damage', op: 'flat', value: 12 }],
    affixes: [],
    ...over,
  };
}

describe('穿背包里的法宝（D189）', () => {
  it('穿上后：该件离开背包、进入装备坑，换下来的回背包', () => {
    const s = makeSession();
    const item = fakeItem();
    s.bag = [item];
    // 新号自带起始法器（D172），所以「换下来的回背包」这条一定有内容，不是条件分支
    const before = s.character.equipment.sword;
    expect(before).toBeDefined();
    const r = equipFromBag(s, 0);
    expect(r.ok).toBe(true);
    expect(s.character.equipment.sword?.uid).toBe(item.uid);
    expect(s.bag.map((i) => i.uid)).toEqual([before?.uid]);
  });

  it('背包空时返回失败且不改状态（不许把空指针当件）', () => {
    const s = makeSession();
    s.bag = [];
    const r = equipFromBag(s, 0);
    expect(r.ok).toBe(false);
    expect(r.message).toBe('这一格是空的');
    expect(s.bag).toHaveLength(0);
  });

  it('越界下标 / 小数 / 负数都安静失败', () => {
    const s = makeSession();
    s.bag = [fakeItem()];
    for (const bad of [-1, 2, 1.5, Number.NaN]) {
      const r = equipFromBag(s, bad);
      expect(r.ok).toBe(false);
    }
    expect(s.bag).toHaveLength(1);
  });

  it('穿上会同步战斗态（面板变了战斗里也得变）', () => {
    const s = makeSession();
    const strong = fakeItem({ base: [{ stat: 'damage', op: 'flat', value: 200 }] });
    s.bag = [strong];
    equipFromBag(s, 0);
    const mods = s.battle.player.modifiers;
    expect(mods.some((m) => m.stat === 'damage' && m.op === 'flat' && m.value === 200)).toBe(true);
  });

  it('戒指两坑：有空坑优先进空坑', () => {
    const s = makeSession();
    const ring = fakeItem({ slot: 'ring', name: '测试戒' });
    s.bag = [ring];
    const r = equipFromBag(s, 0);
    expect(r.ok).toBe(true);
    const equipped = [s.character.equipment.ring1, s.character.equipment.ring2].filter(
      (x) => x?.uid === ring.uid,
    );
    expect(equipped).toHaveLength(1);
  });

  it('原地改 session（返回值只说明成不成，不返回新对象）', () => {
    const s = makeSession();
    s.bag = [fakeItem()];
    const sameSession = s;
    equipFromBag(s, 0);
    expect(sameSession.character.equipment.sword).toBeDefined();
  });
});

describe('丢背包里的法宝（D189）', () => {
  it('丢弃只减不加：件数 -1、装备不动、不给通货/渊痕', () => {
    const s = makeSession();
    const a = fakeItem({ uid: 'a' });
    const b = fakeItem({ uid: 'b' });
    s.bag = [a, b];
    const swordBefore = s.character.equipment.sword?.uid;
    const marksBefore = s.character.marks ?? 0;
    const pocketBefore = JSON.stringify(s.pocket);
    const r = discardFromBag(s, 0);
    expect(r.ok).toBe(true);
    expect(s.bag.map((i) => i.uid)).toEqual(['b']);
    expect(s.character.equipment.sword?.uid).toBe(swordBefore);
    expect(s.character.marks ?? 0).toBe(marksBefore);
    expect(JSON.stringify(s.pocket)).toBe(pocketBefore);
  });

  it('丢弃空位 / 越界失败', () => {
    const s = makeSession();
    s.bag = [fakeItem()];
    expect(discardFromBag(s, 3).ok).toBe(false);
    expect(discardFromBag(s, -1).ok).toBe(false);
    expect(s.bag).toHaveLength(1);
  });

  it('丢弃会计一条日志（玩家要知道东西真没了）', () => {
    const s = makeSession();
    s.bag = [fakeItem({ name: '废剑' })];
    discardFromBag(s, 0);
    expect(s.log.some((l) => l.text.includes('丢弃') && l.text.includes('废剑'))).toBe(true);
  });
});

describe('穿装与 equip() 的坑位规则一致', () => {
  it('部位不匹配时 equip() 会拒绝，equipFromBag 也失败', () => {
    const ch = createCharacter('yujian');
    const ring = fakeItem({ slot: 'ring' });
    const res = equip(ch, 'sword', ring);
    expect(res.ok).toBe(false);
  });
});
