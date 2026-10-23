import { describe, expect, it } from 'vitest';
import { AFFIXES } from '../src/data/affixes';
import { createCharacter, fillAffixes } from '../src/core/character';
import { itemPower } from '../src/core/inventory';
import { makeItem, maxAffixes, type Item } from '../src/core/item';
import { Rng } from '../src/core/rng';
import {
  CRAFT_BAG_TOP,
  craftAddAffix,
  craftReroll,
  craftTargets,
  craftRemoveAffix,
  runCraftPlan,
} from '../src/core/crafting';

function makeTestItem(rarity: Item['rarity'] = 'bao', seed = 7): Item {
  return makeItem(
    {
      slot: 'sword',
      rarity,
      ilvl: 15,
      name: `试炼法器${seed}`,
      base: [{ stat: 'damage', op: 'flat', value: 10 }],
    },
    new Rng(seed),
  );
}

/** 一件带满灵纹的法宝（灵纹条数 = 该品阶上限） */
function makeFullItem(rarity: Item['rarity'], seed: number): Item {
  return fillAffixes(makeTestItem(rarity, seed), AFFIXES, new Rng(seed + 100));
}

describe('crafting 通货打造', () => {
  it('craftTargets = 身上全部 + 背包战力前 N，按 uid 去重', () => {
    const ch = createCharacter('yujian');
    const bag = [
      makeTestItem('bao', 1),
      makeTestItem('bao', 2),
      makeTestItem('bao', 3),
      makeTestItem('bao', 4),
      makeTestItem('bao', 5),
      makeTestItem('bao', 6),
    ];
    const targets = craftTargets(ch, bag);
    // 身上 1 件（起始铁剑）+ 背包前 4 件
    expect(targets.length).toBe(1 + CRAFT_BAG_TOP);
    const uids = new Set(targets.map((t) => t.uid));
    expect(uids.size).toBe(targets.length);
    // 背包里战力最高的 4 件必须在
    const top4 = [...bag].sort((a, b) => itemPower(b) - itemPower(a)).slice(0, CRAFT_BAG_TOP);
    for (const t of top4) expect(uids.has(t.uid)).toBe(true);
  });

  it('黄阶灵石：给有空位的法宝添一条灵纹，身上优先', () => {
    // 凡品铁剑 0 条上限，不能当添纹目标 —— 换一件有空位的灵品穿身上
    const ch0 = createCharacter('yujian');
    const ling = makeTestItem('ling', 11);
    const ch = { ...ch0, equipment: { ...ch0.equipment, sword: ling } };
    const rng = new Rng(11);
    const out = craftAddAffix(ch, [], AFFIXES, rng);
    expect(out.result).not.toBeNull();
    expect(out.result!.ok).toBe(true);
    expect(out.character.equipment.sword!.affixes.length).toBe(ling.affixes.length + 1);
  });

  it('满条法宝不会被黄阶灵石选中', () => {
    const ch = createCharacter('yujian');
    const full = makeFullItem('xian', 21);
    expect(full.affixes.length).toBe(maxAffixes('xian'));
    // 满条装在身上，背包里放一件有空位的
    const ch2 = { ...ch, equipment: { ...ch.equipment, sword: full } };
    const bag = [makeTestItem('ling', 22)];
    const rng = new Rng(23);
    const out = craftAddAffix(ch2, bag, AFFIXES, rng);
    expect(out.result!.ok).toBe(true);
    // 改的是背包里那件，不是满条的身上装
    expect(out.bag[0].affixes.length).toBe(1);
    expect(out.character.equipment.sword!.uid).toBe(full.uid);
  });

  it('灭灵石：删战力最低候选的一条，不碰身上', () => {
    const ch = createCharacter('yujian');
    const weak = makeFullItem('ling', 31);
    const rng = new Rng(33);
    const out = craftRemoveAffix(ch, [weak], rng);
    expect(out.result).not.toBeNull();
    expect(out.bag[0].affixes.length).toBe(weak.affixes.length - 1);
    expect(out.character.equipment.sword!.affixes.length).toBe(
      ch.equipment.sword!.affixes.length,
    );
  });

  it('洗灵石：只洗满条的，重洗后条数不变', () => {
    const ch = createCharacter('yujian');
    const bag = [makeTestItem('ling', 42)];
    const rng = new Rng(43);
    const out = craftReroll(ch, bag, AFFIXES, rng);
    // 背包那件不满条不会被洗；身上铁剑是凡品 0 条也不满足 → 无目标
    expect(out.result).toBeNull();
    // 把满条装放进背包再试
    const full = makeFullItem('xian', 41);
    const out2 = craftReroll(ch, [full], AFFIXES, rng);
    expect(out2.result).not.toBeNull();
    expect(out2.result!.ok).toBe(true);
    expect(out2.bag[0].affixes.length).toBe(maxAffixes('xian'));
  });

  it('runCraftPlan：黄阶永远有出口（满条后降级成重铸最弱一条 + 保底不亏）', () => {
    const ch0 = createCharacter('yujian');
    const ling = makeTestItem('ling', 51);
    const ch = { ...ch0, equipment: { ...ch0.equipment, sword: ling } };
    const rng = new Rng(53);
    const out = runCraftPlan(ch, [], { counts: { huang: 3 } }, AFFIXES, rng);
    // 灵品上限 2 条：前两次「添」（添灵纹是单调的，可以落在已穿件上）；
    // 第三次无空位 → 降级成「重铸最弱一条」，该算子自带保底不亏（掷坏就保留原样、通货照扣），
    // 所以已穿件既可以被它作用，战力又不可能下降。
    expect(out.spent.huang ?? 0).toBe(3);
    expect(out.messages.length).toBe(3);
    const sword = out.character.equipment['sword']!;
    expect(sword.affixes.length).toBe(2);
    expect(sword.affixes.length).toBeLessThanOrEqual(maxAffixes('ling'));
  });

  it('runCraftPlan 顺序：洗 → 灭 → 添（洗最稀有先花）', () => {
    const ch = createCharacter('yujian');
    const full = makeFullItem('xian', 61);
    const rng = new Rng(63);
    const out = runCraftPlan(ch, [full], { counts: { xi: 1, huang: 1 } }, AFFIXES, rng);
    // 洗：满条仙品在背包 → 成功；添：仙品满条无空位 → 降级成重掷（D28-B 之后不再是「不消费」）
    expect(out.spent.xi).toBe(1);
    expect(out.spent.huang ?? 0).toBe(1);
    expect(out.bag[0].affixes.length).toBe(maxAffixes('xian'));
  });

  it('打造不可变：输入的 character/bag 对象不被原地修改', () => {
    const ch = createCharacter('yujian');
    const bag = [makeTestItem('bao', 71)];
    const bagBefore = [...bag];
    const affixesBefore = ch.equipment.sword!.affixes.length;
    const rng = new Rng(73);
    runCraftPlan(ch, bag, { counts: { huang: 1 } }, AFFIXES, rng);
    expect(bag).toEqual(bagBefore);
    expect(ch.equipment.sword!.affixes.length).toBe(affixesBefore);
  });
});
