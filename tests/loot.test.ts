import { describe, expect, it } from 'vitest';

import { ITEM_BASES, baseMainValue, basesForSlot, validateItemBases } from '../src/data/bases';
import type { AffixDef } from '../src/data/affix-def';
import { RARITIES, RARITY_BASE_WEIGHT } from '../src/data/rarity';
import { SLOT_KINDS } from '../src/data/slots';
import {
  passesBasicFilter,
  rollBase,
  rollLoot,
  rollLootMany,
  rollRarity,
} from '../src/core/loot';
import { Rng } from '../src/core/rng';

/** 覆盖 9 个部位的测试池（真实池由数值策划交付） */
const POOL: readonly AffixDef[] = [
  { id: 'p-life', name: '厚土', stat: 'life', op: 'flat', value: 20, perIlvl: 2, tier: 'huang', ilvl: 1, weight: 10 },
  { id: 'p-dmg', name: '锋锐', stat: 'damage', op: 'increased', value: 0.1, perIlvl: 0.005, tier: 'huang', ilvl: 1, weight: 10 },
  { id: 'p-armor', name: '坚壁', stat: 'armor', op: 'flat', value: 15, perIlvl: 3, tier: 'huang', ilvl: 1, weight: 8, slots: ['robe', 'belt', 'boots'] },
  { id: 'p-crit', name: '破军', stat: 'critChance', op: 'flat', value: 0.02, perIlvl: 0.001, tier: 'huang', ilvl: 1, weight: 4 },
  { id: 'p-fire', name: '焚心', stat: 'damage', op: 'increased', value: 0.12, perIlvl: 0.006, tier: 'huang', ilvl: 1, weight: 5, tags: ['fire'] },
  { id: 'p-xuan', name: '玄铁', stat: 'armor', op: 'increased', value: 0.06, perIlvl: 0.003, tier: 'xuan', ilvl: 16, weight: 6 },
  { id: 'p-tian', name: '天罡', stat: 'damage', op: 'more', value: 0.05, perIlvl: 0.002, tier: 'tian', ilvl: 46, weight: 3 },
];

describe('基底表 bases', () => {
  it('27 个基底，9 个部位各 3 阶', () => {
    expect(ITEM_BASES).toHaveLength(27);
    for (const slot of SLOT_KINDS) {
      expect(basesForSlot(ITEM_BASES, slot), slot).toHaveLength(3);
    }
  });

  it('validateItemBases 对现表返回空数组', () => {
    expect(validateItemBases(ITEM_BASES)).toEqual([]);
  });

  it('每个基底名字非空、主属性值递增', () => {
    for (const b of ITEM_BASES) {
      expect(b.name.length, b.id).toBeGreaterThan(0);
      expect(baseMainValue(b, 10)).toBeGreaterThan(baseMainValue(b, 1));
    }
  });

  it('同部位内高阶基底更强', () => {
    const swords = basesForSlot(ITEM_BASES, 'sword');
    const t1 = baseMainValue(swords.find((b) => b.tier === 1)!, 10);
    const t3 = baseMainValue(swords.find((b) => b.tier === 3)!, 10);
    expect(t3).toBeGreaterThan(t1);
  });
});

describe('品阶抽取', () => {
  it('默认分布接近 60/28/10/2（±3%）', () => {
    const rng = new Rng(2024);
    const N = 40000;
    const count: Record<string, number> = { fan: 0, ling: 0, bao: 0, xian: 0 };
    for (let i = 0; i < N; i++) count[rollRarity(rng)]++;
    for (const r of RARITIES) {
      const expected = RARITY_BASE_WEIGHT[r] / 100;
      expect(Math.abs(count[r] / N - expected), r).toBeLessThan(0.03);
    }
  });

  it('rarityBonus > 1 时高阶明显更多', () => {
    const plain = new Rng(7);
    const boosted = new Rng(7);
    let plainHigh = 0;
    let boostHigh = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) {
      if (rollRarity(plain, 1) !== 'fan') plainHigh++;
      if (rollRarity(boosted, 3) !== 'fan') boostHigh++;
    }
    expect(boostHigh).toBeGreaterThan(plainHigh);
  });

  it('极端 bonus 也不会让凡品完全消失（地上总有垃圾是设计底线）', () => {
    // bonus 被封顶在 MAX_RARITY_BONUS=10，此时凡品权重 60 / 总权重 586 ≈ 10%
    const rng = new Rng(9);
    let fan = 0;
    const N = 5000;
    for (let i = 0; i < N; i++) if (rollRarity(rng, 100) === 'fan') fan++;
    expect(fan / N).toBeGreaterThan(0.05);
  });

  it('bonus 超过上限时被钳住（不出现分布塌陷）', () => {
    const a = new Rng(88);
    const b = new Rng(88);
    const seqA: string[] = [];
    const seqB: string[] = [];
    for (let i = 0; i < 200; i++) {
      seqA.push(rollRarity(a, 12));
      seqB.push(rollRarity(b, 1e9));
    }
    // 12 和 1e9 都会被钳到 10，序列必须一致
    expect(seqA).toEqual(seqB);
  });

  it('同种子抽出的品阶序列一致', () => {
    const a = new Rng(55);
    const b = new Rng(55);
    const seqA: string[] = [];
    const seqB: string[] = [];
    for (let i = 0; i < 50; i++) {
      seqA.push(rollRarity(a));
      seqB.push(rollRarity(b));
    }
    expect(seqA).toEqual(seqB);
  });
});

describe('基底抽取的灵蕴门槛', () => {
  it('灵蕴 5 只掉一阶基底', () => {
    const rng = new Rng(1);
    for (let i = 0; i < 300; i++) {
      const b = rollBase(ITEM_BASES, 'sword', 5, rng);
      expect(b).not.toBeNull();
      expect(b!.tier).toBe(1);
    }
  });

  it('灵蕴 30 能掉到三阶基底', () => {
    const rng = new Rng(2);
    const tiers = new Set<number>();
    for (let i = 0; i < 500; i++) tiers.add(rollBase(ITEM_BASES, 'sword', 30, rng)!.tier);
    expect(tiers.has(3)).toBe(true);
    expect(tiers.has(1)).toBe(true);
  });

  it('基底表缺该部位时返回 null，不抛错', () => {
    const rng = new Rng(3);
    expect(rollBase([], 'sword', 10, rng)).toBeNull();
  });
});

describe('掉落生成', () => {
  const baseParams = { ilvl: 20 };

  it('同种子出同一件装备（掉落可复现，这是核心断言）', () => {
    const a = rollLoot(new Rng(4321), ITEM_BASES, POOL, baseParams);
    const b = rollLoot(new Rng(4321), ITEM_BASES, POOL, baseParams);
    expect(a.item).toEqual(b.item);
  });

  it('凡品固定 0 条灵纹', () => {
    const rng = new Rng(11);
    let checked = 0;
    for (let i = 0; i < 3000 && checked < 30; i++) {
      const r = rollLoot(rng, ITEM_BASES, POOL, baseParams);
      if (r.rarity === 'fan') {
        expect(r.item.affixes).toHaveLength(0);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('灵品 1~2 条、宝品 3~4 条', () => {
    const rng = new Rng(12);
    let ling = 0;
    let bao = 0;
    for (let i = 0; i < 4000 && (ling < 20 || bao < 20); i++) {
      const r = rollLoot(rng, ITEM_BASES, POOL, { ilvl: 20 });
      if (r.rarity === 'ling') {
        expect(r.item.affixes.length).toBeGreaterThanOrEqual(1);
        expect(r.item.affixes.length).toBeLessThanOrEqual(2);
        ling++;
      } else if (r.rarity === 'bao') {
        expect(r.item.affixes.length).toBeGreaterThanOrEqual(3);
        expect(r.item.affixes.length).toBeLessThanOrEqual(4);
        bao++;
      }
    }
    expect(ling).toBeGreaterThan(0);
    expect(bao).toBeGreaterThan(0);
  });

  it('指定部位必生效', () => {
    const rng = new Rng(13);
    for (let i = 0; i < 100; i++) {
      const r = rollLoot(rng, ITEM_BASES, POOL, { ilvl: 20, slot: 'ring' });
      expect(r.slot).toBe('ring');
      expect(r.item.slot).toBe('ring');
    }
  });

  it('extraAffixes 追加灵纹条数', () => {
    const rng = new Rng(14);
    // 强制宝品：用超大 rarityBonus 多抽几次，找一件宝品对比
    const plain = rollLoot(new Rng(99), ITEM_BASES, POOL, { ilvl: 40, rarityBonus: 1000 });
    const extra = rollLoot(new Rng(99), ITEM_BASES, POOL, { ilvl: 40, rarityBonus: 1000, extraAffixes: 2 });
    expect(extra.item.affixes.length).toBeGreaterThanOrEqual(plain.item.affixes.length);
  });

  it('名字带品阶前缀', () => {
    const rng = new Rng(15);
    const r = rollLoot(rng, ITEM_BASES, POOL, baseParams);
    expect(r.item.name).toContain('·');
    expect(['凡品', '灵品', '宝品', '仙品'].some((p) => r.item.name.startsWith(p))).toBe(true);
  });

  it('每件掉落都有一条基底主属性', () => {
    const rng = new Rng(16);
    for (let i = 0; i < 100; i++) {
      const r = rollLoot(rng, ITEM_BASES, POOL, baseParams);
      expect(r.item.base).toHaveLength(1);
      expect(Number.isFinite(r.item.base[0].value)).toBe(true);
    }
  });

  it('基底表为空时不崩，产出可识别的占位法宝', () => {
    const rng = new Rng(17);
    const r = rollLoot(rng, [], POOL, baseParams);
    expect(r.item.name).toContain('缺基底');
    expect(r.item.base).toHaveLength(0);
  });

  it('ilvl 非法（NaN / 0 / 负数）被归一化到 1', () => {
    const a = rollLoot(new Rng(20), ITEM_BASES, POOL, { ilvl: Number.NaN });
    const b = rollLoot(new Rng(20), ITEM_BASES, POOL, { ilvl: 1 });
    expect(a.item).toEqual(b.item);
  });

  it('掉 0 件返回空数组', () => {
    const rng = new Rng(21);
    expect(rollLootMany(rng, ITEM_BASES, POOL, baseParams, 0)).toEqual([]);
    expect(rollLootMany(rng, ITEM_BASES, POOL, baseParams, -5)).toEqual([]);
  });

  it('掉 N 件就是 N 件', () => {
    const rng = new Rng(22);
    expect(rollLootMany(rng, ITEM_BASES, POOL, baseParams, 7)).toHaveLength(7);
  });

  it('掉落过滤器：默认过滤掉凡品', () => {
    const rng = new Rng(23);
    let fanSeen = 0;
    for (let i = 0; i < 500; i++) {
      const r = rollLoot(rng, ITEM_BASES, POOL, baseParams);
      if (r.rarity === 'fan') {
        expect(passesBasicFilter(r)).toBe(false);
        fanSeen++;
      } else {
        expect(passesBasicFilter(r)).toBe(true);
      }
    }
    expect(fanSeen).toBeGreaterThan(0);
  });

  it('掉落过滤器阈值可调（凡品也捡）', () => {
    const rng = new Rng(24);
    const fan = Array.from({ length: 200 }, () => rollLoot(rng, ITEM_BASES, POOL, baseParams)).find(
      (r) => r.rarity === 'fan',
    );
    expect(fan).toBeDefined();
    expect(passesBasicFilter(fan!, 'fan')).toBe(true);
  });
});

describe('掉落节奏的粗略验算（不是标定，只是防呆）', () => {
  it('灵蕴 20 掉 200 件，宝品数量落在合理量级（每 100 件 8~14 件）', () => {
    const rng = new Rng(1234);
    const N = 2000;
    let bao = 0;
    for (let i = 0; i < N; i++) if (rollLoot(rng, ITEM_BASES, POOL, { ilvl: 20 }).rarity === 'bao') bao++;
    const per100 = (bao / N) * 100;
    expect(per100).toBeGreaterThan(8);
    expect(per100).toBeLessThan(14);
  });

  it('灵蕴 20 时高阶灵纹几乎不出（门槛生效）', () => {
    const rng = new Rng(5678);
    let tian = 0;
    for (let i = 0; i < 2000; i++) {
      const r = rollLoot(rng, ITEM_BASES, POOL, { ilvl: 20 });
      if (r.item.affixes.some((a) => a.defId === 'p-tian')) tian++;
    }
    expect(tian).toBe(0);
  });
});
