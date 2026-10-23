import { describe, expect, it } from 'vitest';

import {
  CLASSES,
  CLASS_IDS,
  attributeModifiers,
  getClass,
  isClassId,
  validateClasses,
} from '../src/data/classes';
import {
  ATTR_PER_STEP,
  PRIMARY_ATTR_PER_STEP,
  characterAttrs,
  characterModifiers,
  characterStats,
  chooseAscendancy,
  createCharacter,
  equip,
  equippedItems,
  fillAffixes,
  gainXp,
  hasAscendancy,
  nextStepXp,
  unequip,
  UNARMED_DAMAGE,
} from '../src/core/character';
import { makeItem } from '../src/core/item';
import { aggregate } from '../src/core/modifier';
import { BREAKTHROUGH_XP,
  XP_RECOVERY_MUL,
  STAGE_RATIO,
  TRIBULATION_RATIO,
  REALM_COUNT,
  STAGES_PER_REALM,
  TOTAL_STEPS,
  addXp,
  isMaxStep,
  realmName,
  stepLabel,
  stepProgress,
  totalXpToStep,
  xpForStep,
  xpToNext,
} from '../src/core/progression';
import { Rng } from '../src/core/rng';
import type { AffixDef } from '../src/data/affix-def';

const POOL: readonly AffixDef[] = [
  { id: 'c-life', name: '厚土', stat: 'life', op: 'flat', value: 20, perIlvl: 2, tier: 'huang', ilvl: 1, weight: 10 },
  { id: 'c-dmg', name: '锋锐', stat: 'damage', op: 'increased', value: 0.1, perIlvl: 0.005, tier: 'huang', ilvl: 1, weight: 10 },
  { id: 'c-crit', name: '破军', stat: 'critChance', op: 'flat', value: 0.02, perIlvl: 0.001, tier: 'huang', ilvl: 1, weight: 4 },
  { id: 'c-armor', name: '坚壁', stat: 'armor', op: 'flat', value: 15, perIlvl: 3, tier: 'huang', ilvl: 1, weight: 8 },
];

describe('境界与修为 progression', () => {
  it('9 大境界 × 9 重 = 81 台阶', () => {
    expect(REALM_COUNT).toBe(9);
    expect(STAGES_PER_REALM).toBe(9);
    expect(TOTAL_STEPS).toBe(81);
  });

  it('第一重门槛 = R(0) × 9%（BALANCE §20.11 / D34 显式数组）', () => {
    expect(xpForStep(0)).toBe(Math.round(BREAKTHROUGH_XP[0] * STAGE_RATIO));
  });

  it('渡劫门槛 = R(k) × 28%（大关口必须明显更贵）', () => {
    // 第 8 境（渡劫境）的第 9 重就是游戏终点，没有下一阶，所以只测 0~7 境
    for (let k = 0; k < REALM_COUNT - 1; k++) {
      const r = BREAKTHROUGH_XP[k];
      expect(xpForStep(k * STAGES_PER_REALM + 8), `realm ${k}`).toBe(
        Math.round(r * TRIBULATION_RATIO),
      );
    }
  });

  it('境界内门槛不递减，且渡劫（第 9 重）明显比第 8 重贵', () => {
    // BALANCE §4：前 8 重每重都是 R(k)×8%（同价是刻意的），第 9 重是渡劫 R(k)×28%
    for (let k = 0; k < REALM_COUNT; k++) {
      let prev = 0;
      for (let i = 0; i < STAGES_PER_REALM; i++) {
        const cur = xpForStep(k * STAGES_PER_REALM + i);
        if (Number.isFinite(cur)) {
          expect(cur, `realm ${k} stage ${i}`).toBeGreaterThanOrEqual(prev);
          prev = cur;
        }
      }
      const trib = xpForStep(k * STAGES_PER_REALM + 8);
      const eighth = xpForStep(k * STAGES_PER_REALM + 7);
      if (Number.isFinite(trib) && Number.isFinite(eighth)) {
        expect(trib, `realm ${k} 渡劫`).toBeGreaterThan(eighth);
      }
    }
  });

  it('境界整体变贵：下一境的每重 ≥ 上一境的每重（大境界不能白跨）', () => {
    for (let k = 0; k < REALM_COUNT - 1; k++) {
      const curFirst = xpForStep(k * STAGES_PER_REALM);
      const nextFirst = xpForStep((k + 1) * STAGES_PER_REALM);
      expect(nextFirst, `realm ${k}`).toBeGreaterThan(curFirst);
    }
  });

  it('圆满后门槛是 Infinity，不是 0', () => {
    expect(xpForStep(TOTAL_STEPS - 1)).toBe(Number.POSITIVE_INFINITY);
    expect(xpToNext(TOTAL_STEPS - 1, 0)).toBeNull();
    expect(isMaxStep(TOTAL_STEPS - 1)).toBe(true);
    expect(isMaxStep(0)).toBe(false);
  });

  it('非法台阶被归一化，不产生 NaN', () => {
    expect(xpForStep(Number.NaN)).toBeCloseTo(xpForStep(0), 6);
    expect(xpForStep(-5)).toBeCloseTo(xpForStep(0), 6);
    expect(xpForStep(999)).toBe(Number.POSITIVE_INFINITY);
  });

  it('台阶名走术语表', () => {
    expect(stepLabel(0)).toBe('练气·一重');
    expect(stepLabel(9)).toBe('筑基·一重');
    expect(realmName(0)).toBe('练气');
    expect(realmName(80)).toBe('渡劫');
  });

  it('addXp 不够突破时只加不破', () => {
    const r = addXp(0, 0, 10);
    expect(r.step).toBe(0);
    expect(r.xp).toBe(10);
    expect(r.breakthroughs).toBe(0);
  });

  it('addXp 刚好够时突破一重', () => {
    const need = xpForStep(0);
    const r = addXp(0, 0, need);
    expect(r.step).toBe(1);
    expect(r.xp).toBe(0);
    expect(r.breakthroughs).toBe(1);
  });

  it('addXp 一次给巨量修为能连破多阶（离线收益靠这个）', () => {
    const r = addXp(0, 0, 100000);
    expect(r.breakthroughs).toBeGreaterThan(5);
    expect(r.step).toBeGreaterThan(5);
  });

  it('addXp 一直加到圆满为止，不越界', () => {
    const r = addXp(0, 0, 1e18);
    expect(r.step).toBe(TOTAL_STEPS - 1);
    expect(r.xp).toBe(0);
    expect(r.breakthroughs).toBe(TOTAL_STEPS - 1);
  });

  it('圆满之后多余修为不再累积（界面不会显示溢出的天文数字）', () => {
    const r = addXp(TOTAL_STEPS - 1, 0, 999999);
    expect(r.step).toBe(TOTAL_STEPS - 1);
    expect(r.xp).toBe(0);
  });

  it('addXp 拒绝负数 / NaN 增量，不会倒扣修为', () => {
    const r = addXp(3, 10, -100);
    expect(r.step).toBe(3);
    expect(r.xp).toBe(10);
    const r2 = addXp(0, 0, Number.NaN);
    expect(r2.step).toBe(0);
    expect(r2.xp).toBe(0);
  });

  it('81 台阶合计 ≈ 数组总和 − 末境渡劫（v4.22 定稿 Σ2 805 538，满级 ≈406 分钟）', () => {
    // R(k) 的语义是「本境 8 重 × 9% + 渡劫 28% = 100%」。
    // 但第 9 境（渡劫境）的第 9 重是**游戏终点**，没有下一阶可突破，
    // 所以它那 28% 永远不会被消耗 —— 累计修为 = 总和 − R(8)×28%。
    const total = totalXpToStep(TOTAL_STEPS - 1);
    const sum = BREAKTHROUGH_XP.reduce((a, b) => a + b, 0);
    const lastTrib = BREAKTHROUGH_XP[BREAKTHROUGH_XP.length - 1] * TRIBULATION_RATIO;
    // D125：Σ 不再是定值 —— 门槛带 XP_RECOVERY_MUL（shuzhi 的棘轮纪律：让时间提前 >5% 的正当改动
  // 只能用 XP 门槛回收）。这里断言「Σ = 基准总和 × 回收系数」，而不是写死 2 805 538，
  // 否则每次调回收系数都要改测试（测试跟着常数走，就不再有防护意义）。
  const BASE_SUM = 2805538;
  expect(Math.abs(sum - BASE_SUM * XP_RECOVERY_MUL)).toBeLessThan(10);
  expect(XP_RECOVERY_MUL).toBeGreaterThanOrEqual(1);
    // 逐台阶 Math.round 累积，允许几十点取整误差
    expect(Math.abs(total - (sum - lastTrib))).toBeLessThan(100);
  });

  it('累计修为单调递增', () => {
    let prev = -1;
    for (let s = 0; s < TOTAL_STEPS; s++) {
      const t = totalXpToStep(s);
      expect(t, `step ${s}`).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
  });

  it('进度 0~1（换算新门槛）', () => {
    expect(stepProgress(0, 0)).toBe(0);
    expect(stepProgress(0, xpForStep(0) * 0.5)).toBeCloseTo(0.5, 6);
    expect(stepProgress(0, 999)).toBe(1);
    expect(stepProgress(TOTAL_STEPS - 1, 0)).toBe(1);
  });

  it('进度 0~1，圆满为 1', () => {
    expect(stepProgress(0, 0)).toBe(0);
    expect(stepProgress(0, xpForStep(0) * 0.5)).toBeCloseTo(0.5, 6);
    expect(stepProgress(0, 999)).toBe(1);
    expect(stepProgress(TOTAL_STEPS - 1, 0)).toBe(1);
  });
});

describe('六大道统 classes', () => {
  it('正好 6 个，id 不重复', () => {
    expect(CLASSES).toHaveLength(6);
    expect(new Set(CLASS_IDS).size).toBe(6);
  });

  it('validateClasses 对现表返回空数组', () => {
    expect(validateClasses(CLASSES)).toEqual([]);
  });

  it('每个道统都有浊气觉醒，且来源标记正确', () => {
    for (const c of CLASSES) {
      expect(c.ascendancy.name.length, c.id).toBeGreaterThan(0);
      expect(c.ascendancy.effects.length).toBeGreaterThan(0);
      for (const e of c.ascendancy.effects) {
        expect(e.source?.kind).toBe('ascend');
      }
    }
  });

  it('每个道统的周天图起点都不同（否则会长得一样）', () => {
    const starts = CLASSES.map((c) => c.talentStart);
    expect(new Set(starts).size).toBe(starts.length);
  });

  it('每个道统至少有一个道性标签（否则拿不到神通玉简）', () => {
    for (const c of CLASSES) expect(c.skillTags.length, c.id).toBeGreaterThan(0);
  });

  it('名字和术语表一致', () => {
    expect(CLASSES.map((c) => c.name)).toEqual([
      '御剑堂',
      '御兽堂',
      '焚炎堂',
      '玄水阁',
      '厚土宗',
      '锐金门',
    ]);
  });

  it('getClass / isClassId', () => {
    expect(getClass('yujian')?.name).toBe('御剑堂');
    expect(getClass('nope' as never)).toBeUndefined();
    expect(isClassId('yushou')).toBe(true);
    expect(isClassId('yushou2')).toBe(false);
  });

  it('validateClasses 抓得出重复起点和空觉醒', () => {
    const bad = [CLASSES[0], { ...CLASSES[1], talentStart: CLASSES[0].talentStart, ascendancy: { ...CLASSES[1].ascendancy, effects: [] } }];
    const problems = validateClasses(bad);
    expect(problems.some((p) => p.includes('起点重复'))).toBe(true);
    expect(problems.some((p) => p.includes('觉醒'))).toBe(true);
    expect(problems.some((p) => p.includes('应为 6'))).toBe(true);
  });

  it('三主属性都转换成正向加成', () => {
    const mods = attributeModifiers({ body: 10, agility: 10, spirit: 10 });
    expect(aggregate(mods, 'life').flat).toBeGreaterThan(0);
    expect(aggregate(mods, 'armor').flat).toBeGreaterThan(0);
    expect(aggregate(mods, 'mana').flat).toBeGreaterThan(0);
    expect(aggregate(mods, 'critChance').flat).toBeGreaterThan(0);
  });

  it('属性里有 NaN 不会污染面板', () => {
    const mods = attributeModifiers({ body: Number.NaN, agility: -5, spirit: 10 });
    expect(aggregate(mods, 'life').flat).toBe(0);
    expect(aggregate(mods, 'attackSpeed').flat).toBe(0);
    expect(Number.isFinite(aggregate(mods, 'mana').flat)).toBe(true);
  });
});

describe('角色状态 character', () => {
  it('创建角色：初始台阶 0、修为 0、只有一把起始法器', () => {
    const ch = createCharacter('yujian');
    expect(ch.step).toBe(0);
    expect(ch.xp).toBe(0);
    expect(ch.ascendancyId).toBeNull();
    // 起始法器是刻意的：不给的话开局拳脚 5 点伤害，一只怪要砍 12 下
    expect(Object.keys(ch.equipment)).toEqual(['sword']);
    const sword = ch.equipment.sword;
    expect(sword?.rarity).toBe('fan');
    expect(sword?.affixes).toHaveLength(0);
  });

  it('未知道统直接抛错（不许默默创建一个坏角色）', () => {
    expect(() => createCharacter('nope' as never)).toThrow();
  });

  it('角色对象可 JSON 往返（存档的前提）', () => {
    const ch = createCharacter('houtu');
    const round = JSON.parse(JSON.stringify(ch)) as typeof ch;
    expect(round).toEqual(ch);
    // 还能继续当状态用，不炸
    expect(characterStats(round).life).toBeGreaterThan(0);
  });

  it('面板属性都是有限正数', () => {
    const stats = characterStats(createCharacter('fenyin'));
    for (const [k, v] of Object.entries(stats)) {
      expect(Number.isFinite(v), k).toBe(true);
    }
    expect(stats.life).toBeGreaterThan(0);
    expect(stats.mana).toBeGreaterThan(0);
  });

  it('不同道统的面板不同（否则选道统没意义）', () => {
    const a = characterStats(createCharacter('houtu'));
    const b = characterStats(createCharacter('fenyin'));
    expect(a.life).not.toBe(b.life);
  });

  it('三主属性是派生值：只由道统和台阶决定', () => {
    const ch = createCharacter('yujian');
    const a0 = characterAttrs(ch);
    const a1 = characterAttrs({ ...ch, step: 1 });
    expect(a1.body).toBe(a0.body + ATTR_PER_STEP);
    expect(a1.agility).toBe(a0.agility + ATTR_PER_STEP + PRIMARY_ATTR_PER_STEP);
    expect(a1.spirit).toBe(a0.spirit + ATTR_PER_STEP);
  });

  it('主属性随台阶长得最快（道统身份不能越来越淡）', () => {
    const ch = createCharacter('yujian'); // 主属性灵巧
    const a = characterAttrs({ ...ch, step: 50 });
    const others = Math.max(a.body, a.spirit);
    expect(a.agility).toBeGreaterThan(others);
  });

  it('三主属性都不入档（少一处对不上的可能）', () => {
    const ch = createCharacter('houtu');
    const json = JSON.parse(JSON.stringify(ch)) as Record<string, unknown>;
    expect(json.attrs).toBeUndefined();
    expect(json.attrPoints).toBeUndefined();
  });

  it('突破会真的变强（不需要玩家点任何东西）', () => {
    const base = createCharacter('yujian');
    const grown = gainXp(base, 100000);
    expect(grown.step).toBeGreaterThan(1);
    expect(characterStats(grown).life).toBeGreaterThan(characterStats(base).life);
  });

  it('选浊气觉醒：只能选本道统的，且只能选一次', () => {
    const ch = createCharacter('yujian');
    expect(chooseAscendancy(ch, 'asc-zhuoyan')).toBe(ch); // 不是本道统的
    const ok = chooseAscendancy(ch, 'asc-zhuojian');
    expect(hasAscendancy(ok)).toBe(true);
    expect(chooseAscendancy(ok, 'asc-zhuojian')).toBe(ok); // 已选过，不再变
  });

  it('选了觉醒之后面板会变（浊剑加破绽伤害）', () => {
    const base = createCharacter('yujian');
    const withAsc = chooseAscendancy(base, 'asc-zhuojian');
    expect(characterStats(withAsc).critMulti).toBeGreaterThan(characterStats(base).critMulti);
  });

  it('nextStepXp 圆满时为 null', () => {
    expect(nextStepXp(createCharacter('yujian'))).toBe(xpForStep(0));
    const maxed = { ...createCharacter('yujian'), step: TOTAL_STEPS - 1 };
    expect(nextStepXp(maxed)).toBeNull();
  });
});

describe('装备穿戴', () => {
  const rng = () => new Rng(1);

  it('戒指能进 ring1 和 ring2', () => {
    const ring = makeItem({ slot: 'ring', rarity: 'ling', ilvl: 5, name: '铜戒' }, rng());
    const ch = createCharacter('yujian');
    expect(equip(ch, 'ring1', ring).ok).toBe(true);
    expect(equip(ch, 'ring2', ring).ok).toBe(true);
  });

  it('法器不能戴在戒指坑（类型不匹配要拦住）', () => {
    const sword = makeItem({ slot: 'sword', rarity: 'ling', ilvl: 5, name: '铁剑' }, rng());
    const ch = createCharacter('yujian');
    const res = equip(ch, 'ring1', sword);
    expect(res.ok).toBe(false);
    expect(res.character).toBe(ch);
  });

  it('换装时把旧的还回来（进背包）', () => {
    const a = makeItem({ slot: 'ring', rarity: 'ling', ilvl: 5, name: '铜戒' }, rng());
    const b = makeItem({ slot: 'ring', rarity: 'bao', ilvl: 20, name: '血纹戒' }, rng());
    const ch = createCharacter('yujian');
    const step1 = equip(ch, 'ring1', a);
    const step2 = equip(step1.character, 'ring1', b);
    expect(step2.replaced?.uid).toBe(a.uid);
    expect(step2.character.equipment.ring1?.uid).toBe(b.uid);
  });

  it('空坑换装没有 replaced', () => {
    const ring = makeItem({ slot: 'ring', rarity: 'ling', ilvl: 5, name: '铜戒' }, rng());
    const res = equip(createCharacter('yujian'), 'ring1', ring);
    expect(res.replaced).toBeUndefined();
  });

  it('卸下：坑清空、返回被卸的', () => {
    const ring = makeItem({ slot: 'ring', rarity: 'ling', ilvl: 5, name: '铜戒' }, rng());
    const equipped = equip(createCharacter('yujian'), 'ring1', ring).character;
    const { character, removed } = unequip(equipped, 'ring1');
    expect(removed?.uid).toBe(ring.uid);
    expect(character.equipment.ring1).toBeUndefined();
  });

  it('卸空坑不炸', () => {
    const { character, removed } = unequip(createCharacter('yujian'), 'ring1');
    expect(removed).toBeUndefined();
    expect(character.equipment.ring1).toBeUndefined();
  });

  it('装备的灵纹真的进面板', () => {
    const r = rng();
    const withLife = makeItem(
      {
        slot: 'ring',
        rarity: 'bao',
        ilvl: 10,
        name: '厚土戒',
        base: [],
        affixes: [{ defId: 'c-life', name: '厚土', stat: 'life', op: 'flat', value: 500 }],
      },
      r,
    );
    const bare = createCharacter('yujian');
    const dressed = equip(bare, 'ring1', withLife).character;
    expect(characterStats(dressed).life - characterStats(bare).life).toBeGreaterThanOrEqual(500);
  });

  it('equippedItems 只返回非空坑', () => {
    const ring = makeItem({ slot: 'ring', rarity: 'ling', ilvl: 5, name: '铜戒' }, rng());
    const ch = equip(createCharacter('yujian'), 'ring1', ring).character;
    // 起始法器 + 新戴的戒指 = 2 件
    expect(equippedItems(ch)).toHaveLength(2);
    expect(equippedItems(ch).map((e) => e.item.slot).sort()).toEqual(['ring', 'sword']);
  });

  it('fillAffixes 把灵纹补到品阶上限', () => {
    const r = rng();
    const item = makeItem({ slot: 'ring', rarity: 'bao', ilvl: 30, name: '血纹戒' }, r);
    const filled = fillAffixes(item, POOL, r);
    expect(filled.affixes.length).toBe(4);
    expect(filled.uid).toBe(item.uid);
  });

  it('fillAffixes 对凡品什么都不做（上限 0）', () => {
    const r = rng();
    const item = makeItem({ slot: 'ring', rarity: 'fan', ilvl: 30, name: '破铜戒' }, r);
    expect(fillAffixes(item, POOL, r).affixes).toHaveLength(0);
  });

  it('characterModifiers 汇总了属性 + 装备 + 觉醒', () => {
    const ring = makeItem(
      { slot: 'ring', rarity: 'ling', ilvl: 5, name: '铜戒', base: [{ stat: 'damage', op: 'increased', value: 0.1 }] },
      rng(),
    );
    const ch = chooseAscendancy(equip(createCharacter('yujian'), 'ring1', ring).character, 'asc-zhuojian');
    const mods = characterModifiers(ch);
    const kinds = new Set(mods.map((m) => m.source?.kind));
    expect(kinds.has('base')).toBe(true);
    expect(kinds.has('equip')).toBe(true);
    expect(kinds.has('ascend')).toBe(true);
  });
});
