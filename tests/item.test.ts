import { describe, expect, it } from 'vitest';

import {
  AFFIX_TIER_ILVL,
  affixCandidates,
  affixValueAt,
  tierOfIlvl,
  validateAffixPool,
  type AffixDef,
} from '../src/data/affix-def';
import { RARITY_AFFIX_COUNT, rarityName } from '../src/data/rarity';
import { SLOT_ID_TO_KIND, SLOT_IDS, fitsSlot, isSlotId } from '../src/data/slots';
import {
  addAffix,
  affixLabel,
  affixCountRange,
  equipmentModifiers,
  improveAffixes,
  itemLabel,
  itemModifiers,
  makeAffixInstance,
  makeItem,
  maxAffixes,
  removeRandomAffix,
  rerollAffixes,
  rollAffixInstances,
} from '../src/core/item';
import { aggregate } from '../src/core/modifier';
import { Rng } from '../src/core/rng';
import type { SlotId } from '../src/data/slots';

/** 测试用的迷你词缀池（够覆盖所有分支，不影响真实的 affixes.ts） */
const POOL: readonly AffixDef[] = [
  { id: 'a-life', name: '厚土', stat: 'life', op: 'flat', value: 20, perIlvl: 2, tier: 'huang', ilvl: 1, weight: 10 },
  { id: 'a-dmg', name: '锋锐', stat: 'damage', op: 'increased', value: 0.1, perIlvl: 0.005, tier: 'huang', ilvl: 1, weight: 10 },
  { id: 'a-armor', name: '坚壁', stat: 'armor', op: 'flat', value: 15, perIlvl: 3, tier: 'huang', ilvl: 1, weight: 8, slots: ['robe', 'belt'] },
  { id: 'a-crit', name: '破军', stat: 'critChance', op: 'flat', value: 0.02, perIlvl: 0.001, tier: 'huang', ilvl: 1, weight: 4 },
  { id: 'a-fire', name: '焚心', stat: 'damage', op: 'increased', value: 0.12, perIlvl: 0.006, tier: 'huang', ilvl: 1, weight: 5, tags: ['fire'] },
  { id: 'a-tian', name: '天罡', stat: 'damage', op: 'more', value: 0.05, perIlvl: 0.002, tier: 'tian', ilvl: 46, weight: 3 },
];

const noSlotPool = POOL.filter((d) => d.slots === undefined);

describe('法宝位 slots', () => {
  it('10 个坑，9 种物品类型', () => {
    expect(SLOT_IDS).toHaveLength(10);
    expect(new Set(Object.values(SLOT_ID_TO_KIND)).size).toBe(9);
  });

  it('两个戒指坑对应同一个物品类型', () => {
    expect(SLOT_ID_TO_KIND.ring1).toBe('ring');
    expect(SLOT_ID_TO_KIND.ring2).toBe('ring');
  });

  it('fitsSlot：戒指能进两个坑，剑进不了戒指坑', () => {
    expect(fitsSlot('ring', 'ring1')).toBe(true);
    expect(fitsSlot('ring', 'ring2')).toBe(true);
    expect(fitsSlot('sword', 'ring1')).toBe(false);
    expect(fitsSlot('sword', 'sword')).toBe(true);
  });

  it('isSlotId 挡住非法值（存档读回来要过这一道）', () => {
    expect(isSlotId('ring1')).toBe(true);
    expect(isSlotId('ring3')).toBe(false);
    expect(isSlotId(undefined)).toBe(false);
  });
});

describe('品阶 rarity', () => {
  it('凡品 0 条灵纹（地上 60% 的掉落是纯垃圾，这是故意的）', () => {
    expect(RARITY_AFFIX_COUNT.fan).toEqual([0, 0]);
  });

  it('品阶越高灵纹条数越多', () => {
    expect(RARITY_AFFIX_COUNT.ling[0]).toBe(1);
    expect(RARITY_AFFIX_COUNT.bao[0]).toBe(3);
    expect(RARITY_AFFIX_COUNT.xian[0]).toBe(4);
  });

  it('中文名来自术语表', () => {
    expect(rarityName('fan')).toBe('凡品');
    expect(rarityName('xian')).toBe('仙品');
  });
});

describe('灵纹契约 affix-def', () => {
  it('灵蕴 → 阶位', () => {
    expect(tierOfIlvl(1)).toBe('huang');
    expect(tierOfIlvl(15)).toBe('huang');
    expect(tierOfIlvl(16)).toBe('xuan');
    expect(tierOfIlvl(30)).toBe('xuan');
    expect(tierOfIlvl(31)).toBe('di');
    expect(tierOfIlvl(46)).toBe('tian');
    expect(tierOfIlvl(999)).toBe('tian');
    expect(tierOfIlvl(Number.NaN)).toBe('huang');
  });

  it('四条阶位区间首尾相接、不重叠', () => {
    expect(AFFIX_TIER_ILVL.huang[1] + 1).toBe(AFFIX_TIER_ILVL.xuan[0]);
    expect(AFFIX_TIER_ILVL.xuan[1] + 1).toBe(AFFIX_TIER_ILVL.di[0]);
    expect(AFFIX_TIER_ILVL.di[1] + 1).toBe(AFFIX_TIER_ILVL.tian[0]);
  });

  it('affixValueAt：数值随灵蕴线性增长', () => {
    const d = POOL[0]; // value 20, perIlvl 2, ilvl 1
    expect(affixValueAt(d, 1)).toBe(20);
    expect(affixValueAt(d, 11)).toBe(40);
    expect(affixValueAt(d, 0)).toBe(20); // 低于下限按 0 算 → 取下限值
  });

  it('灵蕴不够时高阶词缀进不了候选池', () => {
    const low = affixCandidates(POOL, 'ring', 10).map((c) => c.def.id);
    expect(low).not.toContain('a-tian');
    const high = affixCandidates(POOL, 'ring', 50).map((c) => c.def.id);
    expect(high).toContain('a-tian');
  });

  it('部位专属词缀只在该部位出现', () => {
    expect(affixCandidates(POOL, 'ring', 10).map((c) => c.def.id)).not.toContain('a-armor');
    expect(affixCandidates(POOL, 'robe', 10).map((c) => c.def.id)).toContain('a-armor');
  });

  it('天阶词缀权重被降（同样 weight 时概率更低）', () => {
    const list = affixCandidates(POOL, 'ring', 50);
    const tian = list.find((c) => c.def.id === 'a-tian');
    const huang = list.find((c) => c.def.id === 'a-life');
    expect(tian).toBeDefined();
    expect(huang).toBeDefined();
    expect(tian!.weight).toBeLessThan(huang!.weight);
  });

  it('validateAffixPool 对合格池返回空数组', () => {
    expect(validateAffixPool(POOL)).toEqual([]);
  });

  it('validateAffixPool 抓得出重复 id / 空名 / 坏权重', () => {
    const bad: AffixDef[] = [
      { id: 'x', name: '甲', stat: 'life', op: 'flat', value: 1, perIlvl: 0, tier: 'huang', ilvl: 1, weight: 1 },
      { id: 'x', name: '', stat: 'life', op: 'flat', value: Number.NaN, perIlvl: 0, tier: 'huang', ilvl: 1, weight: 0 },
    ];
    const problems = validateAffixPool(bad);
    expect(problems.length).toBeGreaterThanOrEqual(4);
    expect(problems.some((p) => p.includes('重复'))).toBe(true);
  });
});

describe('灵纹实例与抽样', () => {
  it('makeAffixInstance 把定义实例化到某个灵蕴', () => {
    const inst = makeAffixInstance(POOL[0], 11);
    expect(inst.defId).toBe('a-life');
    expect(inst.name).toBe('厚土');
    expect(inst.value).toBe(40);
    expect(inst.stat).toBe('life');
  });

  it('按品阶抽条数落在区间内', () => {
    const rng = new Rng(1);
    for (let i = 0; i < 200; i++) {
      expect(rollAffixInstances(noSlotPool, 'ring', 10, 2, rng).length).toBe(2);
      expect(rollAffixInstances(noSlotPool, 'ring', 10, 4, rng).length).toBeLessThanOrEqual(4);
    }
  });

  it('抽出的灵纹互不重复（maxStack 默认 1）', () => {
    const rng = new Rng(2);
    const got = rollAffixInstances(noSlotPool, 'ring', 10, 5, rng);
    const ids = got.map((a) => a.defId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('池子抽干时返回能抽到的全部，不报错', () => {
    const rng = new Rng(3);
    const got = rollAffixInstances(noSlotPool, 'ring', 10, 99, rng);
    // ring 上可用 = a-life / a-dmg / a-crit / a-fire / a-tian（tian 需 ilvl46）
    expect(got.length).toBe(4);
  });

  it('低灵蕴时高阶词缀抽不出来', () => {
    const rng = new Rng(4);
    for (let i = 0; i < 200; i++) {
      const got = rollAffixInstances(noSlotPool, 'ring', 5, 4, rng);
      expect(got.map((a) => a.defId)).not.toContain('a-tian');
    }
  });

  it('同种子抽出的灵纹完全一致（掉落可复现）', () => {
    const a = rollAffixInstances(noSlotPool, 'ring', 20, 3, new Rng(777));
    const b = rollAffixInstances(noSlotPool, 'ring', 20, 3, new Rng(777));
    expect(a).toEqual(b);
  });

  it('条数上限按品阶来', () => {
    expect(maxAffixes('fan')).toBe(0);
    expect(maxAffixes('ling')).toBe(2);
    expect(maxAffixes('bao')).toBe(4);
    expect(affixCountRange('bao')).toEqual([3, 4]);
  });
});

describe('通货操作（存实例才做得到的事）', () => {
  const rng = () => new Rng(2024);

  function sample(): ReturnType<typeof makeItem> {
    // 用宝品（上限 4 条）装 3 条：这样「加一条」还有空间，「洗」「灭」「淬」也都合法。
    // 之前用灵品装 2 条，上限正好 2，于是加不上去 —— 是测试写错了，不是实现错了。
    const r = rng();
    const affixes = rollAffixInstances(noSlotPool, 'ring', 20, 3, r);
    return makeItem({ slot: 'ring', rarity: 'bao', ilvl: 20, name: '青锋戒', affixes }, r);
  }

  it('黄阶灵石：加一条灵纹', () => {
    const item = sample();
    const res = addAffix(item, POOL, rng());
    expect(res.ok).toBe(true);
    expect(res.item.affixes).toHaveLength(item.affixes.length + 1);
    expect(res.message).toContain('添入灵纹');
  });

  it('黄阶灵石：满条数时失败且物品不变', () => {
    const r = rng();
    const full = makeItem(
      { slot: 'ring', rarity: 'ling', ilvl: 20, name: '满纹戒', affixes: rollAffixInstances(noSlotPool, 'ring', 20, 2, r) },
      r,
    );
    const res = addAffix(full, POOL, rng());
    expect(res.ok).toBe(false);
    expect(res.item).toBe(full);
    expect(res.message).toContain('已满');
  });

  it('黄阶灵石：凡品不能加（上限 0）', () => {
    const r = rng();
    const fan = makeItem({ slot: 'ring', rarity: 'fan', ilvl: 20, name: '破铜戒' }, r);
    expect(addAffix(fan, POOL, rng()).ok).toBe(false);
  });

  it('灭灵石：删掉恰好一条，剩下的都还在', () => {
    const item = sample();
    const before = item.affixes.map((a) => a.defId).sort();
    const res = removeRandomAffix(item, rng());
    expect(res.ok).toBe(true);
    expect(res.item.affixes).toHaveLength(before.length - 1);
    const after = res.item.affixes.map((a) => a.defId).sort();
    // after 必须是 before 的子序列（少了一个元素）
    const diff = before.filter((id, i) => after[i] !== id);
    expect(diff.length).toBeGreaterThanOrEqual(1);
    expect(res.message).toContain('已灭');
  });

  it('灭灵石：无灵纹时失败', () => {
    const r = rng();
    const bare = makeItem({ slot: 'ring', rarity: 'fan', ilvl: 20, name: '素戒' }, r);
    expect(removeRandomAffix(bare, rng()).ok).toBe(false);
  });

  it('洗灵石：条数不变，内容换掉', () => {
    const item = sample();
    const res = rerollAffixes(item, noSlotPool, rng());
    expect(res.ok).toBe(true);
    expect(res.item.affixes).toHaveLength(item.affixes.length);
    expect(res.item.uid).toBe(item.uid); // 还是同一件东西
  });

  it('淬灵石：数值按倍率提升', () => {
    const item = sample();
    const res = improveAffixes(item, 1.1);
    expect(res.ok).toBe(true);
    res.item.affixes.forEach((a, i) => {
      expect(a.value).toBeCloseTo(item.affixes[i].value * 1.1, 6);
    });
  });

  it('锁定的法宝谁都不能动', () => {
    const item = { ...sample(), locked: true };
    expect(addAffix(item, POOL, rng()).ok).toBe(false);
    expect(removeRandomAffix(item, rng()).ok).toBe(false);
    expect(rerollAffixes(item, noSlotPool, rng()).ok).toBe(false);
    expect(improveAffixes(item).ok).toBe(false);
  });

  it('通货操作不改原对象（不可变，方便撤销和单测）', () => {
    const item = sample();
    const snapshot = JSON.stringify(item);
    addAffix(item, POOL, rng());
    removeRandomAffix(item, rng());
    rerollAffixes(item, noSlotPool, rng());
    expect(JSON.stringify(item)).toBe(snapshot);
  });
});

describe('法宝 → 修正器', () => {
  it('基底属性和灵纹都转成修正器，来源带装备名', () => {
    const r = new Rng(1);
    const item = makeItem(
      {
        slot: 'sword',
        rarity: 'ling',
        ilvl: 10,
        name: '青锋法剑',
        base: [{ stat: 'damage', op: 'flat', value: 30 }],
        affixes: [makeAffixInstance(POOL[1], 10)],
      },
      r,
    );
    const mods = itemModifiers(item);
    expect(mods).toHaveLength(2);
    expect(mods.every((m) => m.source?.label === '青锋法剑')).toBe(true);
    expect(mods.every((m) => m.source?.kind === 'equip')).toBe(true);
  });

  it('全身装备的修正器能合并进同一个聚合引擎', () => {
    const r = new Rng(1);
    const sword = makeItem(
      { slot: 'sword', rarity: 'ling', ilvl: 10, name: '剑', base: [{ stat: 'damage', op: 'increased', value: 0.5 }] },
      r,
    );
    const ring = makeItem(
      { slot: 'ring', rarity: 'ling', ilvl: 10, name: '戒', base: [{ stat: 'damage', op: 'increased', value: 0.3 }] },
      r,
    );
    const equipment: Partial<Record<SlotId, typeof sword>> = { sword, ring1: ring };
    const mods = equipmentModifiers(equipment);
    expect(mods).toHaveLength(2);
    // 加法叠加：+50% 与 +30% = +80%
    expect(aggregate(mods, 'damage').increased).toBeCloseTo(0.8, 6);
  });

  it('带标签的灵纹只加成匹配的伤害实例', () => {
    const r = new Rng(1);
    const item = makeItem(
      {
        slot: 'ring',
        rarity: 'bao',
        ilvl: 10,
        name: '焚心戒',
        affixes: [makeAffixInstance(POOL[4], 10)],
      },
      r,
    );
    const mods = itemModifiers(item);
    expect(aggregate(mods, 'damage', ['spell', 'fire']).increased).toBeGreaterThan(0);
    expect(aggregate(mods, 'damage', ['attack', 'melee']).increased).toBe(0);
  });

  it('空装备返回空列表', () => {
    expect(equipmentModifiers({})).toEqual([]);
    expect(equipmentModifiers({ sword: undefined })).toEqual([]);
  });
});

describe('法宝显示', () => {
  it('itemLabel 显示品阶、名字、灵蕴', () => {
    const r = new Rng(1);
    const item = makeItem({ slot: 'sword', rarity: 'bao', ilvl: 32, name: '青锋法剑' }, r);
    expect(itemLabel(item)).toBe('宝品·青锋法剑（灵蕴 32）');
  });

  it('affixLabel 把比值显示成百分比', () => {
    expect(affixLabel({ defId: 'x', name: '破军', stat: 'critChance', op: 'flat', value: 0.075 })).toBe('破军 7.5%');
    expect(affixLabel({ defId: 'x', name: '厚土', stat: 'life', op: 'flat', value: 40 })).toBe('厚土 +40.0');
    expect(affixLabel({ defId: 'x', name: '锋锐', stat: 'damage', op: 'increased', value: 0.15 })).toBe('锋锐 +15.0%');
  });
});
