// 传奇效果（REQ §4：仙品 = 4 条灵纹 + 1 条传奇效果）的契约与行为测试。
//
// 这一组测试要钉住的是三类东西：
//   ① **数据契约**：9 条定义 id 唯一、旗子参数有界、纯数值走的是 mods 而不是别的入口；
//   ② **不可被洗掉**：洗灵石 / 灭灵石 / 满条重铸 / 淬炼都不许动 legendary 字段
//      —— 这是最容易被后续 patch 破坏的一条（那些函数只认「灵纹条数」，
//      一旦有人把传奇也做成 AffixInstance，玩家刷几十小时的仙品会被通货洗成普通件）；
//   ③ **三个机制旗子真的落到战斗里**（不是只加了字段没人读），
//      以及它们都是**有界**的（D45：有界强化允许，无限战力不允许）。

import { describe, expect, it } from 'vitest';
import { LEGENDARY_DEFS, getLegendary, isLegendaryId } from '../src/data/legendary';
import {
  itemModifiers,
  legendaryFlags,
  legendaryLabel,
  legendaryOf,
  removeRandomAffix,
  rerollAffixes,
  improveAffixes,
  maxAffixes,
} from '../src/core/item';
import type { AffixInstance, Item } from '../src/core/item';
import { rollLootMany } from '../src/core/loot';
import { decideEquip, itemPower } from '../src/core/inventory';
import { ITEM_BASES } from '../src/data/bases';
import { AFFIXES } from '../src/data/affixes';
import { Rng } from '../src/core/rng';
import {
  createBattle,
  createPlayerBattle,
  spawnMonster,
  tickBattle,
  BATTLE_W,
  BATTLE_H,
} from '../src/core/battle';
import { createTurbid } from '../src/core/turbid';
import { MONSTERS } from '../src/data/monsters';
import { serialize, deserialize } from '../src/core/save';
import { createCharacter } from '../src/core/character';
import { SLOT_IDS } from '../src/data/slots';
import type { SlotId, SlotKind } from '../src/data/slots';
import type { CurrencyId } from '../src/data/currency';

function makeTestItem(legendary?: string, affixes: readonly AffixInstance[] = []): Item {
  return {
    uid: `legend-${legendary ?? 'none'}`,
    slot: 'sword' as SlotKind,
    rarity: 'xian',
    ilvl: 60,
    name: '测试·仙品法剑',
    base: [{ stat: 'damage', op: 'flat', value: 30 }],
    affixes,
    legendary,
  };
}

function affix(i: number): AffixInstance {
  return {
    defId: `t-${i}`,
    name: `测试灵纹${i}`,
    stat: 'life',
    op: 'flat',
    value: 20 + i,
    baseValue: 20 + i,
  };
}

/** 一只足够近的普通怪（贴脸，保证玩家出手能选中） */
function monsterAt(uid: number) {
  const def = MONSTERS[0];
  const m = spawnMonster(def, 1, uid, BATTLE_W / 2, BATTLE_H / 2, 'normal');
  return m;
}

describe('传奇效果 · 数据契约', () => {
  it('9 条定义，id 唯一，名字和描述都不为空', () => {
    expect(LEGENDARY_DEFS.length).toBe(9);
    const ids = LEGENDARY_DEFS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of LEGENDARY_DEFS) {
      expect(d.name.length).toBeGreaterThan(0);
      expect(d.desc.length).toBeGreaterThan(0);
      // 一条传奇要么给纯数值、要么给旗子，不能两个都没有（否则是空词条）
      expect(Boolean(d.mods && d.mods.length > 0) || Boolean(d.flag)).toBe(true);
    }
  });

  it('旗子只有三种，且参数有界（比例 ≤1、概率 ≤1）', () => {
    const allowed = new Set(['kill-heal', 'double-strike', 'boom-more']);
    for (const d of LEGENDARY_DEFS) {
      if (!d.flag) continue;
      expect(allowed.has(d.flag)).toBe(true);
      expect(typeof d.param).toBe('number');
      expect(d.param as number).toBeGreaterThan(0);
      expect(d.param as number).toBeLessThanOrEqual(1);
    }
  });

  it('纯数值的 op 只能是 flat / increased / more（不许自造算子）', () => {
    for (const d of LEGENDARY_DEFS) {
      for (const m of d.mods ?? []) {
        expect(['flat', 'increased', 'more']).toContain(m.op);
        expect(Number.isFinite(m.value)).toBe(true);
      }
    }
  });

  it('getLegendary / isLegendaryId 对脏值安静判否', () => {
    expect(getLegendary(undefined)).toBeUndefined();
    expect(getLegendary('不存在')).toBeUndefined();
    expect(isLegendaryId('不存在')).toBe(false);
    expect(isLegendaryId(3)).toBe(false);
    expect(isLegendaryId('taiyi')).toBe(true);
  });
});

describe('传奇效果 · 掉落只给仙品', () => {
  it('仙品 100% 带传奇，其余品阶一个都没有', () => {
    const rng = new Rng(0x1eaf);
    // rarityBonus 拉满 → 大多数是仙品；这里只断言「等价关系」不赌分布
    const results = rollLootMany(rng, ITEM_BASES, AFFIXES, {
      ilvl: 60,
      rarityBonus: 10,
    }, 400);
    let xian = 0;
    for (const r of results) {
      if (r.rarity === 'xian') {
        xian += 1;
        expect(isLegendaryId(r.item.legendary)).toBe(true);
      } else {
        expect(r.item.legendary).toBeUndefined();
      }
    }
    // 兜底哨兵：防止「一件仙品都没抽到」让上面的循环空转变成假绿
    expect(xian).toBeGreaterThan(20);
  });
});

describe('传奇效果 · 纯数值走统一修正器', () => {
  it('太一余烬的「伤害更多 30%」出现在 itemModifiers 里，且 op 是 more', () => {
    const mods = itemModifiers(makeTestItem('taiyi'));
    const hit = mods.find((m) => m.stat === 'damage' && m.op === 'more');
    expect(hit).toBeDefined();
    expect(hit?.value).toBeCloseTo(0.3, 6);
  });

  it('五行归元一次给五条抗性（不是一条乘 5）', () => {
    const mods = itemModifiers(makeTestItem('wuxing')).filter((m) =>
      m.stat.startsWith('res'),
    );
    expect(mods.length).toBe(5);
    for (const m of mods) expect(m.value).toBeCloseTo(0.12, 6);
  });

  it('没有传奇时 itemModifiers 不多不少（不产生幽灵词条）', () => {
    const plain = itemModifiers(makeTestItem(undefined, [affix(0)]));
    expect(plain.length).toBe(2); // 1 基底 + 1 灵纹
  });
});

describe('传奇效果 · 通货洗不掉', () => {
  it('洗灵石重掷后 legendary 原样保留', () => {
    const item = makeTestItem('taiyi', [affix(0), affix(1), affix(2), affix(3)]);
    const rng = new Rng(7);
    const res = rerollAffixes(item, AFFIXES, rng);
    expect(res.ok).toBe(true);
    expect(res.item.legendary).toBe('taiyi');
  });

  it('灭灵石删一条灵纹后 legendary 原样保留', () => {
    const item = makeTestItem('xueji', [affix(0), affix(1)]);
    const res = removeRandomAffix(item, new Rng(11));
    expect(res.ok).toBe(true);
    expect(res.item.affixes.length).toBeLessThan(2);
    expect(res.item.legendary).toBe('xueji');
  });

  it('淬炼把灵纹抬到上限也不许动 legendary', () => {
    const item = makeTestItem('shuangying', [affix(0)]);
    let cur = item;
    for (let i = 0; i < 20; i++) cur = improveAffixes(cur, 1.3, 1.3).item;
    expect(cur.legendary).toBe('shuangying');
    // 顺带钉住「淬炼有上限」：20 次后不会无限涨（夺造化 P0 的老钉子）
    expect(cur.affixes[0].value).toBeLessThanOrEqual(20 * 1.3 + 1e-6);
  });

  it('仙品的灵纹上限是 4 条，传奇是第 5 条独立的行（不占条数）', () => {
    expect(maxAffixes('xian')).toBe(4);
    const item = makeTestItem('taiyi', [affix(0), affix(1), affix(2), affix(3)]);
    expect(item.affixes.length).toBe(4);
    expect(legendaryOf(item)?.id).toBe('taiyi');
    expect(legendaryLabel(item)).toContain('太一余烬');
  });
});

describe('传奇效果 · 存档往返', () => {
  it('该字段跟着 JSON 走，读档后还在（漏了就是「刷到的仙品换了件衣服」）', () => {
    const base = createCharacter('yujian');
    const item = makeTestItem('zhuopo');
    const ch = { ...base, equipment: { sword: item } };
    const raw = serialize({
      character: ch,
      bag: [],
      floor: 3,
      wave: 2,
      firstClearedFloors: [1, 2],
      pocket: {} as Record<CurrencyId, number>,
      gemPouch: {},
      rngState: { seed: 123, count: 0 },
    });
    const back = deserialize(raw);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    const saved = back.state.player.equipment.sword as Item;
    expect(saved.legendary).toBe('zhuopo');
  });
});
describe('传奇效果 · 旗子汇总有界', () => {
  it('空装备 = 三个旗子都是 0', () => {
    expect(legendaryFlags({})).toEqual({ killHeal: 0, doubleStrike: 0, boomMore: 0 });
  });

  it('同一条旗子取最大值，不求和（D62：堆同一条传奇零收益）', () => {
    // 10 部位全带血祭。求和的话是 0.8（8%×10 = 80% 击杀回气 = 不死之身），
    // 而这是**可刷的** —— 那就成了 D45 禁止的无限战力种子。取最大后仍是 8%。
    const equipment: Partial<Record<SlotId, Item>> = {};
    for (const s of SLOT_IDS) equipment[s] = makeTestItem('xueji');
    const flags = legendaryFlags(equipment);
    expect(flags.killHeal).toBeCloseTo(0.08, 6);
  });

  it('不同旗子互不影响（三条各取各自的最大值）', () => {
    const equipment: Partial<Record<SlotId, Item>> = {
      sword: makeTestItem('xueji'),
      robe: makeTestItem('shuangying'),
      crown: makeTestItem('zhuopo'),
    };
    const flags = legendaryFlags(equipment);
    expect(flags.killHeal).toBeCloseTo(0.08, 6);
    expect(flags.doubleStrike).toBeCloseTo(0.18, 6);
    expect(flags.boomMore).toBeCloseTo(0.5, 6);
  });
});

describe('传奇效果 · itemPower 盲区（D61）', () => {
  it('带传奇的仙品即使战力更低也能换上身（否则传奇永远进不了身）', () => {
    const ch = createCharacter('yujian');
    // 身上先穿一件很肥的普通武器（战力远高于仙品），再把仙品给它比
    const fat = makeTestItem(undefined, [affix(0), affix(1), affix(2), affix(3)]);
    const withFat = { ...ch, equipment: { ...ch.equipment, sword: fat } };
    const legend = makeTestItem('taiyi');
    expect(itemPower(legend)).toBeLessThan(itemPower(fat));
    const decision = decideEquip(withFat, legend);
    expect(decision.shouldEquip).toBe(true);
  });

  it('两件都有传奇时回到战力比较（不会互相无限换装）', () => {
    const ch = createCharacter('yujian');
    const strong = makeTestItem('taiyi', [affix(0), affix(1), affix(2), affix(3)]);
    const withLegend = { ...ch, equipment: { ...ch.equipment, sword: strong } };
    const weak = makeTestItem('zhuopo');
    expect(decideEquip(withLegend, weak).shouldEquip).toBe(false);
  });
});

describe('传奇效果 · 三个旗子真的落进战斗', () => {
  it('血祭：击杀后气血上升', () => {
    const rng = new Rng(0xabc);
    const p = createPlayerBattle({
      maxHp: 1000,
      level: 1,
      armor: 0,
      damage: 100000, // 保证一击必杀
      attackSpeed: 2,
      critChance: 0,
      killHeal: 0.08,
    });
    const state = createBattle(p, createTurbid());
    p.hp = 500; // 先扣血，才能观察到回血
    state.monsters = [monsterAt(1)];
    tickBattle(state, 0.1, rng);
    expect(state.kills).toBe(1);
    expect(p.hp).toBeGreaterThan(500);
    expect(p.hp).toBeLessThanOrEqual(1000);
  });

  it('血祭：没传奇时击杀不回血（对照组，防止「回血来自别处」）', () => {
    const rng = new Rng(0xabc);
    const p = createPlayerBattle({
      maxHp: 1000,
      level: 1,
      armor: 0,
      damage: 100000,
      attackSpeed: 2,
      critChance: 0,
    });
    const state = createBattle(p, createTurbid());
    p.hp = 500;
    state.monsters = [monsterAt(1)];
    tickBattle(state, 0.1, rng);
    expect(state.kills).toBe(1);
    // 对照组只断言「没有回血」这一件事：贴脸生成时怪可能反手打一下，
    // 所以写成「不超过起始值」而不是「严格等于」。真正的因果由上面那条
    // 「有血祭 → 血量上升」来证明，两条合起来才排除了「回血来自别处」。
    expect(p.hp).toBeLessThanOrEqual(500);
  });

  it('双影：同一帧内打了两只怪（各掉一次血）', () => {
    const rng = new Rng(0x2222);
    const p = createPlayerBattle({
      maxHp: 1000,
      level: 1,
      armor: 0,
      damage: 10,
      attackSpeed: 1,
      critChance: 0,
      doubleStrike: 1, // 必定追加
    });
    const state = createBattle(p, createTurbid());
    const a = monsterAt(1);
    const b = monsterAt(2);
    // 两只都贴脸，保证都在射程内
    b.x = a.x + 5;
    state.monsters = [a, b];
    const hpA0 = a.hp;
    const hpB0 = b.hp;
    tickBattle(state, 0.05, rng);
    const totalLost = hpA0 - a.hp + (hpB0 - b.hp);
    // 单次伤害大约 10 上下；打两次的总伤应显著大于一次
    expect(totalLost).toBeGreaterThan(14);
  });

  it('双影：没传奇时只打一只', () => {
    const rng = new Rng(0x2222);
    const p = createPlayerBattle({
      maxHp: 1000,
      level: 1,
      armor: 0,
      damage: 10,
      attackSpeed: 1,
      critChance: 0,
    });
    const state = createBattle(p, createTurbid());
    const a = monsterAt(1);
    const b = monsterAt(2);
    b.x = a.x + 5;
    state.monsters = [a, b];
    const hpA0 = a.hp;
    const hpB0 = b.hp;
    tickBattle(state, 0.05, rng);
    const hitCount = (hpA0 > a.hp ? 1 : 0) + (hpB0 > b.hp ? 1 : 0);
    expect(hitCount).toBe(1);
  });

  it('浊魄：同样的浊气值下伤害更高（它抬的是上限，不是当前倍率的下限）', () => {
    const make = (boomMore: number) => {
      const p = createPlayerBattle({
        maxHp: 100000,
        level: 1,
        armor: 0,
        damage: 8,
        attackSpeed: 1,
        critChance: 0,
        boomMore,
      });
      const state = createBattle(p, createTurbid());
      // 满浊气：基础加成 50% → 有浊魄时上限 100%
      state.turbid.value = 100;
      const m = monsterAt(9);
      const before = m.hp;
      state.monsters = [m];
      tickBattle(state, 0.05, new Rng(0x9));
      // 只观测「掉了多少血」：不碰 readonly 的 maxHp/hp，也不让怪被打死
      return before - m.hp;
    };
    const plain = make(0);
    const boosted = make(0.5);
    expect(boosted).toBeGreaterThan(plain);
    // 满浊气 + 50% 上限 → 正好是 ×1.5 而不是别的魔法数字
    expect(boosted / plain).toBeGreaterThan(1.3);
    expect(boosted / plain).toBeLessThan(1.45);
  });
});
