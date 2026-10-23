import { describe, expect, it } from 'vitest';
import { DROP_CHANCE, ilvlForTier,
  ilvlForFloor, rollMonsterDrop } from '../src/core/drop';
import { Rng } from '../src/core/rng';
import { AFFIXES } from '../src/data/affixes';
import { ITEM_BASES } from '../src/data/bases';
import { validateAffixPool } from '../src/data/affix-def';
import { validateItemBases } from '../src/data/bases';

const TABLES = { bases: ITEM_BASES, affixes: AFFIXES };

describe('掉落数据表健康度', () => {
  it('灵纹表没有结构问题（60 条）', () => {
    expect(validateAffixPool(AFFIXES)).toEqual([]);
    expect(AFFIXES.length).toBe(60);
  });

  it('基底表没有结构问题', () => {
    expect(validateItemBases(ITEM_BASES)).toEqual([]);
  });

  it('每个部位都有至少一条灵纹能出（否则那个部位永远是白板）', () => {
    const slots = ['sword', 'relic', 'crown', 'robe', 'bracer', 'boots', 'belt', 'ring', 'pendant'] as const;
    for (const slot of slots) {
      const fitting = AFFIXES.filter((a) => !a.slots || a.slots.includes(slot));
      expect(fitting.length, `${slot} 一条灵纹都没有`).toBeGreaterThan(0);
    }
  });
});

describe('掉落：真的会掉', () => {
  it('跑 500 次普通怪，掉率接近 DROP_CHANCE.normal', () => {
    const rng = new Rng(20240101);
    let drops = 0;
    for (let i = 0; i < 500; i++) {
      if (rollMonsterDrop('m-fangshi', 1, 'normal', rng, TABLES)) drops += 1;
    }
    const rate = drops / 500;
    expect(rate).toBeGreaterThan(DROP_CHANCE.normal - 0.06);
    expect(rate).toBeLessThan(DROP_CHANCE.normal + 0.06);
  });

  it('镇守必掉（否则打镇守没意义）', () => {
    const rng = new Rng(555);
    for (let i = 0; i < 30; i++) {
      expect(rollMonsterDrop('boss-shikuigui', 1, 'boss', rng, TABLES)).not.toBeNull();
    }
  });

  it('掉出来的东西结构完整（有名字、有部位、有灵蕴）', () => {
    const rng = new Rng(777);
    for (let i = 0; i < 60; i++) {
      const item = rollMonsterDrop('m-fangshi', 1, 'boss', rng, TABLES);
      expect(item).not.toBeNull();
      expect(item?.name.length).toBeGreaterThan(0);
      expect(item?.slot.length).toBeGreaterThan(0);
      expect(item?.ilvl).toBe(ilvlForTier(1));
      expect(Array.isArray(item?.affixes)).toBe(true);
      expect(Array.isArray(item?.base)).toBe(true);
    }
  });

  it('兼容包装：ilvlForTier(tier) = 该阶第一层的 ilvlForFloor', () => {
    expect(ilvlForTier(1)).toBe(ilvlForFloor(1));
    expect(ilvlForTier(2)).toBe(ilvlForFloor(10));
    expect(ilvlForTier(3)).toBe(ilvlForFloor(19));
    // BALANCE v2 表 F：层 1 = 4、层 4 = 15（黄顶格）、层 27 = 99
    expect(ilvlForFloor(1)).toBe(4);
    expect(ilvlForFloor(10)).toBe(37);
    expect(ilvlForFloor(19)).toBe(70);
    expect(ilvlForFloor(27)).toBe(99);
  });

  it('掉落有品阶分布（不是全凡品）', () => {
    const rng = new Rng(31337);
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const item = rollMonsterDrop('m-fangshi', 1, 'boss', rng, TABLES);
      if (item) seen.add(item.rarity);
    }
    // 镇守 bonus=4，至少能出灵品和宝品
    expect(seen.size).toBeGreaterThanOrEqual(2);
  });
});
