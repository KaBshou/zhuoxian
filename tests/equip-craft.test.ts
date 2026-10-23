// 自动换装 / 打造选目标的回归测试（2026-10-22 两个真 bug 的钉子）
//
// 起因：`run-timeline` 的段② 门禁（10 部位同时宝品以上且 ≥1 条灵纹）3 种子 0/3，
// 扒 gear 快照发现满级挂机 8 小时后身上有 `boots ling/0`、`ring1 ling/0`、`sword ling/2`。
// 两个各自独立的真 bug：
//   ① `decideEquip` 拿「全角色战力比」判换装 —— 被 `dps × 10` 支配，
//      身法/回气/抗性部位一辈子不换装（表现为「掉了更好的它不穿」）。
//   ② `craftRemoveAffix` 挑「有灵纹且战力最低」的候选 —— 正是身上最弱那件，
//      把灵品从 1~2 条灭成 0 条（`RARITY_AFFIX_COUNT.ling = [1,2]`，0 条违反了品阶契约）。
//
// 这两条的共性是「判据选错了对象」：不是数值错，是拿全局指标判局部决策。

import { describe, expect, it } from 'vitest';
import { createCharacter } from '../src/core/character';
import { decideEquip, itemPower, AUTO_EQUIP_MARGIN } from '../src/core/inventory';
import { craftAddAffix, craftReforgeWorstAffix, craftRemoveAffix, craftReroll, runCraftPlan } from '../src/core/crafting';
import { maxAffixes } from '../src/core/item';
import { Rng } from '../src/core/rng';
import { AFFIXES } from '../src/data/affixes';
import type { AffixInstance, BaseStat, Item } from '../src/core/item';
import type { CharacterState } from '../src/core/character';
import type { SlotId, SlotKind } from '../src/data/slots';
import type { Rarity } from '../src/data/rarity';

let uidSeq = 0;
function item(slot: SlotKind, rarity: Rarity, base: BaseStat[], affixCount = 0): Item {
  uidSeq += 1;
  const affixes: AffixInstance[] = [];
  for (let i = 0; i < affixCount; i++) {
    affixes.push({
      defId: `t-${i}`,
      name: `测试灵纹${i}`,
      stat: 'life',
      op: 'flat',
      value: 10 + i,
      baseValue: 10 + i,
    });
  }
  return {
    uid: `uid-${uidSeq}`,
    slot,
    rarity,
    ilvl: 99,
    name: `测试·${slot}`,
    base,
    affixes,
  };
}

function withEquip(ch: CharacterState, slot: SlotId, it: Item): CharacterState {
  // ring1/ring2 都是 kind 'ring'，测试里只塞一个戒指位
  return { ...ch, equipment: { ...ch.equipment, [slot]: it } };
}

describe('decideEquip：同部位比，不是全角色比', () => {
  it('空坑必穿（gain 记为 Infinity）', () => {
    const ch = createCharacter('yujian');
    const robe = item('robe', 'ling', [{ stat: 'life', op: 'flat', value: 40 }], 1);
    const d = decideEquip(ch, robe);
    expect(d.targetSlot).toBe('robe');
    expect(d.shouldEquip).toBe(true);
    expect(d.gain).toBe(Number.POSITIVE_INFINITY);
  });

  it('同部位更强就换（+25% 远超 1.02 门槛）', () => {
    const ch = withEquip(createCharacter('yujian'), 'robe', item('robe', 'ling', [{ stat: 'life', op: 'flat', value: 100 }], 0));
    const better = item('robe', 'bao', [{ stat: 'life', op: 'flat', value: 125 }], 0);
    const d = decideEquip(ch, better);
    expect(d.shouldEquip).toBe(true);
    expect(d.gain).toBeCloseTo(1.25, 3);
  });

  it('同部位更强但涨幅不足门槛 → 不换（2% 防抖是刻意留的）', () => {
    const ch = withEquip(createCharacter('yujian'), 'robe', item('robe', 'ling', [{ stat: 'life', op: 'flat', value: 1000 }], 0));
    const barely = item('robe', 'bao', [{ stat: 'life', op: 'flat', value: 1010 }], 0);
    const d = decideEquip(ch, barely);
    expect(d.gain).toBeGreaterThan(1);
    expect(d.gain).toBeLessThan(AUTO_EQUIP_MARGIN);
    expect(d.shouldEquip).toBe(false);
  });

  it('回归：主武器极强时，低权重部位照样能换装（旧实现被 dps×10 吃掉）', () => {
    // 造一个「战力被武器支配」的角色：主武器伤害 5000
    let ch = createCharacter('yujian');
    ch = withEquip(ch, 'sword', item('sword', 'xian', [{ stat: 'damage', op: 'flat', value: 5000 }], 0));
    // D82 之后靴子池里没有 moveSpeed 了，这条回归用护体（真实词缀）造同样的场景
    ch = withEquip(ch, 'boots', item('boots', 'ling', [{ stat: 'armor', op: 'flat', value: 10 }], 0));
    const betterBoots = item('boots', 'bao', [{ stat: 'armor', op: 'flat', value: 30 }], 0);
    const d = decideEquip(ch, betterBoots);
    // 同部位比：30 / 10 = 3 倍，必换。旧实现会算成全角色战力 +0.02% → 不换。
    expect(itemPower(betterBoots)).toBeGreaterThan(itemPower(ch.equipment.boots as Item) * AUTO_EQUIP_MARGIN);
    expect(d.shouldEquip).toBe(true);
    expect(d.gain).toBeGreaterThan(2);
  });

  it('同部位更弱不换（gain < 1，且不会因为它是仙品就换）', () => {
    const ch = withEquip(createCharacter('yujian'), 'robe', item('robe', 'xian', [{ stat: 'life', op: 'flat', value: 500 }], 0));
    const worse = item('robe', 'fan', [{ stat: 'life', op: 'flat', value: 100 }], 0);
    const d = decideEquip(ch, worse);
    expect(d.shouldEquip).toBe(false);
    expect(d.gain).toBeLessThan(1);
  });
});

describe('craftRemoveAffix：只对满条动手，绝不把灵品灭成 0 条', () => {
  it('未满条的灵品不动手（result 为 null 且状态不变）', () => {
    // 灵品上限 2 条，1 条时灭它纯亏：掉 1 条最多换回 1 条随机，期望战力下降
    const ch = withEquip(
      createCharacter('yujian'),
      'ring1',
      item('ring', 'ling', [{ stat: 'life', op: 'flat', value: 50 }], 1),
    );
    const rng = new Rng(1);
    const step = craftRemoveAffix(ch, [], rng);
    expect(step.result).toBeNull();
    expect(step.character).toBe(ch);
    expect(step.bag.length).toBe(0);
  });

  it('已穿件即使满条也绝不被动（打造不许削弱玩家）', () => {
    // 2026-10-22 P0：洗灵石/灭灵石只作用于背包件。已穿件被洗/被灭 = 玩家肉眼可见变弱，
    // 也是段② 判据震荡的唯一根因（同掉落、压掉打造 → 退出 0/0/0；开打造 → 11/6/9 次）。
    const full = item('ring', 'ling', [{ stat: 'life', op: 'flat', value: 50 }], maxAffixes('ling'));
    const ch = withEquip(createCharacter('yujian'), 'ring1', full);
    const step = craftRemoveAffix(ch, [], new Rng(2));
    expect(step.result).toBeNull();
    expect(step.character).toBe(ch);
    expect((step.character.equipment.ring1 as Item).affixes.length).toBe(maxAffixes('ling'));
  });

  it('背包里的满条件才会被灭，且灭完剩 1 条不是 0 条', () => {
    const full = item('ring', 'ling', [{ stat: 'life', op: 'flat', value: 50 }], maxAffixes('ling'));
    const ch = createCharacter('yujian');
    const step = craftRemoveAffix(ch, [full], new Rng(2));
    expect(step.result?.ok).toBe(true);
    expect(step.bag.length).toBe(1);
    const after = step.bag[0] as Item;
    expect(after.affixes.length).toBe(1);
    expect(after.affixes.length).toBeGreaterThanOrEqual(1);
  });

  it('反复调用不会把任何装备降到 0 条（30 次不变量）', () => {
    let ch = createCharacter('yujian');
    ch = withEquip(ch, 'ring1', item('ring', 'ling', [{ stat: 'life', op: 'flat', value: 50 }], 2));
    let bag = [item('ring', 'bao', [{ stat: 'life', op: 'flat', value: 50 }], 4)];
    const rng = new Rng(3);
    for (let i = 0; i < 30; i++) {
      const step = craftRemoveAffix(ch, bag, rng);
      ch = step.character;
      bag = step.bag;
      for (const slot of ['ring1'] as const) {
        const it = ch.equipment[slot];
        if (it) expect(it.affixes.length).toBeGreaterThanOrEqual(1);
      }
      for (const it of bag) expect(it.affixes.length).toBeGreaterThanOrEqual(1);
    }
    // 已穿件应保持原样（2 条），只有背包件被反复腾位
    expect((ch.equipment.ring1 as Item).affixes.length).toBe(2);
  });

  it('凡品（0 条上限）既不算满条也不会被选中', () => {
    const ch = withEquip(createCharacter('yujian'), 'crown', item('crown', 'fan', [], 0));
    const step = craftRemoveAffix(ch, [], new Rng(4));
    expect(step.result).toBeNull();
  });
});

describe('craftReroll：只洗背包件', () => {
  const pool = AFFIXES;

  it('已穿满条件不会被洗（返回 null，装备原样）', () => {
    const worn = item('ring', 'ling', [{ stat: 'life', op: 'flat', value: 50 }], maxAffixes('ling'));
    const ch = withEquip(createCharacter('yujian'), 'ring1', worn);
    const step = craftReroll(ch, [], pool, new Rng(7));
    expect(step.result).toBeNull();
    expect(step.character).toBe(ch);
  });

  it('背包满条件会被洗', () => {
    const bagItem = item('ring', 'ling', [{ stat: 'life', op: 'flat', value: 50 }], maxAffixes('ling'));
    const step = craftReroll(createCharacter('yujian'), [bagItem], pool, new Rng(8));
    expect(step.result?.ok).toBe(true);
    expect(step.bag.length).toBe(1);
  });
});

describe('runCraftPlan：一轮打造后已穿装备不许变弱', () => {
  it('混入洗/灭/添三种通货，已穿 10 件的战力必须不下降', () => {
    const ch = createCharacter('yujian');
    const wornBefore = ch.equipment.sword as Item;
    const bag = [item('ring', 'bao', [{ stat: 'life', op: 'flat', value: 50 }], 4)];
    const plan = { counts: { xi: 5, mie: 5, huang: 5 } };
    const pool = AFFIXES;
    const out = runCraftPlan(ch, bag, plan, pool, new Rng(11));
    const wornAfter = out.character.equipment.sword as Item;
    // 已穿件 uid 不变；战力只许持平或上升
    // （添灵纹是单调的，允许作用在已穿件；洗 / 灭 / 满条重掷是赌，绝不许碰已穿件）
    expect(wornAfter.uid).toBe(wornBefore.uid);
    expect(itemPower(wornAfter)).toBeGreaterThanOrEqual(itemPower(wornBefore));
  });
});

// ────────────────────────────────────────────────────────────
// 2026-10-22 第二轮 P0（ceshi 真 session 反证）：D55 只修了一半
//
// 单测绿但真 session 红，原因是单测构造的是「背包有货」的静态场景，
// 而真 session 里自动换装把背包瞬间掏空（实测 bag = 0~4 件），
// 于是每次都走到两条漏网路径：
//   ① `craftAddAffix` 显式 `find(isWorn)` —— 优先挑身上的（这条其实是安全的，见下）；
//   ② `craftReforgeWorstAffix` 漏了 `!isWorn` —— 把已穿玉佩从 55.9 洗到 51.09。
//
// 定稿规则：**单调操作（添灵纹）可以作用于已穿件；赌（洗 / 灭 / 满条重掷）只能作用于背包件。**
// 判据不是「改没改身上件」，而是「身上件的战力有没有可能下降」。
// ────────────────────────────────────────────────────────────
describe('craftAddAffix：添灵纹是单调操作，允许作用于已穿件', () => {
  it('已穿件有空位时优先给它添，且战力严格上升', () => {
    const ch = createCharacter('yujian');
    // 宝品最多 4 条，这里给 2 条 → 有空位
    const worn = item('sword', 'bao', [{ stat: 'damage', op: 'flat', value: 30 }], 2);
    const c = withEquip(ch, 'sword', worn);
    const before = itemPower(c.equipment.sword as Item);
    const out = craftAddAffix(c, [], AFFIXES, new Rng(7));
    const after = out.character.equipment.sword as Item;
    expect(out.result?.ok).toBe(true);
    expect(after.affixes.length).toBe(3);
    expect(itemPower(after)).toBeGreaterThan(before);
  });
});

describe('craftReforgeWorstAffix：满条兜底重掷带「保底不亏」', () => {
  it('已穿件也可以作为目标，但战力绝不下降（掷坏了原样保留、通货照扣）', () => {
    const ch = createCharacter('yujian');
    const worn = item('sword', 'bao', [{ stat: 'damage', op: 'flat', value: 30 }], 4);
    const c = withEquip(ch, 'sword', worn);
    const before = itemPower(c.equipment.sword as Item);
    const out = craftReforgeWorstAffix(c, [], AFFIXES, new Rng(3));
    // 有目标 → 会动手；无论掷好掷坏，战力都不许降
    expect(out.result?.ok).toBe(true);
    expect(itemPower(out.character.equipment.sword as Item)).toBeGreaterThanOrEqual(before);
  });

  it('连续 40 次重铸（真 rng）已穿件战力单调不降', () => {
    let ch = createCharacter('yujian');
    ch = withEquip(ch, 'sword', item('sword', 'bao', [{ stat: 'damage', op: 'flat', value: 30 }], 4));
    const rng = new Rng(99);
    let last = itemPower(ch.equipment.sword as Item);
    for (let i = 0; i < 40; i++) {
      ch = craftReforgeWorstAffix(ch, [], AFFIXES, rng).character;
      const now = itemPower(ch.equipment.sword as Item);
      expect(now).toBeGreaterThanOrEqual(last);
      last = now;
    }
  });
});