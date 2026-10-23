import { describe, expect, it } from 'vitest';

import { TAG_NAME, elementOf, isTag, matchesTags, type Tag } from '../src/data/tags';
import { STAT_META, clampStat, formatModifier, formatStat } from '../src/data/stats';
import {
  EMPTY_AGGREGATE,
  aggregate,
  aggregateDetailed,
  applyAggregate,
  describeAggregate,
  mod,
  resolveAllStats,
  resolveStat,
  type Modifier,
} from '../src/core/modifier';
import { armorReduction, computeDamage, critMultiplier, mitigationOf } from '../src/core/damage';
import {
  CORRUPTION_DAMAGE_MUL,
  TURBID_MAX,
  createTurbid,
  tickTurbid,
  turbidDamageMul,
  turbidHealMultiplier,
  turbidMultiplier,
  turbidRegenMul,
  turbidTakenMultiplier,
} from '../src/core/turbid';

const SRC = { kind: 'equip' as const, label: '测试' };

/** 浮点比较：断言到小数点后 6 位，避免 0.1+0.2 这类噪音制造假失败 */
function near(actual: number, expected: number, digits = 6): void {
  expect(actual).toBeCloseTo(expected, digits);
}

// ────────────────────────────────────────────────────────────
// 标签表
// ────────────────────────────────────────────────────────────
describe('标签表 tags', () => {
  it('空条件（不传 tags）对任何伤害实例都生效', () => {
    expect(matchesTags(['attack'], undefined)).toBe(true);
    expect(matchesTags([], [])).toBe(true);
    expect(matchesTags(undefined, undefined)).toBe(true);
  });

  it('条件非空但目标没有标签 → 不生效', () => {
    expect(matchesTags(undefined, ['spell'])).toBe(false);
    expect(matchesTags([], ['spell'])).toBe(false);
  });

  it('目标标签必须包含条件的全部，缺一个就失效', () => {
    expect(matchesTags(['spell', 'fire', 'area'], ['spell'])).toBe(true);
    expect(matchesTags(['spell', 'fire', 'area'], ['spell', 'fire'])).toBe(true);
    expect(matchesTags(['spell', 'fire'], ['spell', 'fire', 'area'])).toBe(false);
    expect(matchesTags(['attack', 'fire'], ['spell'])).toBe(false);
  });

  it('elementOf 找出五行属性，无属性返回 null', () => {
    expect(elementOf(['attack', 'fire'])).toBe('fire');
    expect(elementOf(['attack', 'melee'])).toBeNull();
    expect(elementOf([])).toBeNull();
  });

  it('elementOf 多个五行标签时取第一个（一个实例只应有一种属性）', () => {
    expect(elementOf(['fire', 'water'])).toBe('fire');
    expect(elementOf(['water', 'fire'])).toBe('water');
  });

  it('isTag 阻挡非法字符串（存档读回来要过这一道）', () => {
    expect(isTag('spell')).toBe(true);
    expect(isTag('spll')).toBe(false);
    expect(isTag('')).toBe(false);
    expect(isTag(123)).toBe(false);
  });

  it('每个合法标签都有中文名', () => {
    for (const t of Object.keys(TAG_NAME) as Tag[]) {
      expect(TAG_NAME[t].length).toBeGreaterThan(0);
      expect(isTag(t)).toBe(true);
    }
  });
});

// ────────────────────────────────────────────────────────────
// 修正器聚合引擎
// ────────────────────────────────────────────────────────────
describe('修正器聚合 modifier', () => {
  it('flat 多条累加', () => {
    const mods: Modifier[] = [mod('life', 'flat', 30, SRC), mod('life', 'flat', 20, SRC)];
    expect(aggregate(mods, 'life').flat).toBe(50);
  });

  it('increased 多条累加（+20% 与 +30% = +50%）', () => {
    const mods: Modifier[] = [
      mod('damage', 'increased', 0.2, SRC),
      mod('damage', 'increased', 0.3, SRC),
    ];
    near(aggregate(mods, 'damage').increased, 0.5);
  });

  it('more 多条连乘（+20% 与 +30% = ×1.56，不是 ×1.5）', () => {
    const mods: Modifier[] = [mod('damage', 'more', 0.2, SRC), mod('damage', 'more', 0.3, SRC)];
    near(aggregate(mods, 'damage').more, 1.56);
  });

  it('三种运算叠加：基础 100 +40 flat，+50% increased，×1.56 more = 327.6', () => {
    const mods: Modifier[] = [
      mod('damage', 'flat', 40, SRC),
      mod('damage', 'increased', 0.5, SRC),
      mod('damage', 'more', 0.2, SRC),
      mod('damage', 'more', 0.3, SRC),
    ];
    near(applyAggregate(100, aggregate(mods, 'damage')), 327.6);
  });

  it('标签过滤：只加法术的修正器不影响攻击实例', () => {
    const mods: Modifier[] = [mod('damage', 'increased', 0.5, SRC, ['spell'])];
    near(aggregate(mods, 'damage', ['attack']).increased, 0);
    near(aggregate(mods, 'damage', ['spell']).increased, 0.5);
    near(aggregate(mods, 'damage', ['spell', 'fire']).increased, 0.5);
  });

  it('多个条件标签必须同时满足（法术 + 火）', () => {
    const mods: Modifier[] = [mod('damage', 'increased', 0.5, SRC, ['spell', 'fire'])];
    near(aggregate(mods, 'damage', ['spell']).increased, 0);
    near(aggregate(mods, 'damage', ['spell', 'fire']).increased, 0.5);
  });

  it('不同属性互不串扰', () => {
    const mods: Modifier[] = [mod('life', 'flat', 30, SRC), mod('armor', 'flat', 100, SRC)];
    expect(aggregate(mods, 'life').flat).toBe(30);
    expect(aggregate(mods, 'armor').flat).toBe(100);
    expect(aggregate(mods, 'mana').flat).toBe(0);
  });

  it('坏数据（NaN / Infinity）被静默跳过，不污染整场战斗', () => {
    const mods: Modifier[] = [
      mod('life', 'flat', Number.NaN, SRC),
      mod('life', 'flat', Number.POSITIVE_INFINITY, SRC),
      mod('life', 'flat', 10, SRC),
    ];
    expect(aggregate(mods, 'life').flat).toBe(10);
  });

  it('空列表返回恒等聚合', () => {
    const a = aggregate([], 'life');
    expect(a).toEqual(EMPTY_AGGREGATE);
  });

  it('aggregateDetailed 保留每条来源，供伤害拆解面板显示', () => {
    const mods: Modifier[] = [
      mod('damage', 'increased', 0.2, { kind: 'equip', label: '锋锐' }),
      mod('damage', 'increased', 0.3, { kind: 'talent', label: '星点·破军' }),
      mod('damage', 'more', 0.5, { kind: 'support', label: '辅助：扩散' }),
    ];
    const d = aggregateDetailed(mods, 'damage');
    near(d.agg.increased, 0.5);
    near(d.agg.more, 1.5);
    expect(d.parts.map((p) => p.source)).toEqual(['锋锐', '星点·破军', '辅助：扩散']);
  });

  it('describeAggregate 输出可读的过程描述', () => {
    const text = describeAggregate(100, aggregate([mod('damage', 'increased', 0.5, SRC)], 'damage'));
    expect(text).toContain('100');
    expect(text).toContain('+50%');
    expect(text).toContain('150.0');
  });
});

// ────────────────────────────────────────────────────────────
// 属性结算与夹取
// ────────────────────────────────────────────────────────────
describe('属性结算 stats', () => {
  it('无修正器时等于元数据基础值', () => {
    expect(resolveStat('critChance', [])).toBe(STAT_META.critChance.base);
    expect(resolveStat('life', [])).toBe(STAT_META.life.base);
    expect(resolveStat('resFire', [])).toBe(0);
  });

  it('flat 加成生效', () => {
    near(resolveStat('critChance', [mod('critChance', 'flat', 0.5, SRC)]), 0.55);
  });

  it('破绽率夹在上限 100%', () => {
    near(resolveStat('critChance', [mod('critChance', 'flat', 2, SRC)]), 1.0);
  });

  it('五行抗性夹在上限 75%', () => {
    near(resolveStat('resFire', [mod('resFire', 'flat', 2, SRC)]), 0.75);
  });

  it('气血不会被夹成负数', () => {
    expect(resolveStat('life', [mod('life', 'flat', -99999, SRC)])).toBe(1);
  });

  it('resolveAllStats 一次算出全部属性且键齐全', () => {
    const all = resolveAllStats([]);
    for (const key of Object.keys(STAT_META)) {
      expect(typeof all[key as keyof typeof all]).toBe('number');
    }
    expect(Object.keys(all).length).toBe(Object.keys(STAT_META).length);
  });

  it('formatStat：比值乘 100 显示，整数不带小数点', () => {
    expect(formatStat('critChance', 0.075)).toBe('7.5%');
    expect(formatStat('resFire', 0.75)).toBe('75.0%');
    expect(formatStat('life', 120)).toBe('120');
  });

  /**
   * D178 补：`formatStat` 只看属性不看 op，而 `damage` 的 flat 是点数、increased 是百分比。
   * 线上实拍到「基底 伤害 +800%」（8 点固定伤害被乘了 100），就是缺这条按 op 分流的格式化。
   */
  it('formatModifier：op 决定量纲（damage 的 flat 是点数、increased 是百分比）', () => {
    // 真 bug 的钉子：法器基底 flat 8 = 8 点伤害，不许显示成 800%
    expect(formatModifier('damage', 'flat', 8)).toBe('+8');
    expect(formatModifier('damage', 'increased', 0.1)).toBe('+10.0%');
    expect(formatModifier('damage', 'flat', 8)).not.toContain('%');
    // 「更多」是连乘，显示倍率而不是百分比
    expect(formatModifier('damage', 'more', 0.3)).toBe('×1.30');
    // 普通百分比属性的 flat 仍然是百分比（五行抗性 flat 0.12 = 12%）
    expect(formatModifier('resFire', 'flat', 0.12)).toBe('+12.0%');
    expect(formatModifier('critChance', 'flat', 0.06)).toBe('+6.0%');
    // 非比值属性的 flat 是点数
    expect(formatModifier('life', 'flat', 120)).toBe('+120');
    expect(formatModifier('armor', 'increased', 0.45)).toBe('+45.0%');
    // 负值带符号，脏值不崩
    expect(formatModifier('life', 'flat', -30)).toBe('-30');
    expect(formatModifier('life', 'flat', Number.NaN)).toBe('—');
  });

  it('formatModifier 每个属性每种 op 都产出非空文字（防某属性漏配）', () => {
    for (const key of Object.keys(STAT_META) as (keyof typeof STAT_META)[]) {
      for (const op of ['flat', 'increased', 'more'] as const) {
        const text = formatModifier(key, op, 0.1);
        expect(text.length).toBeGreaterThan(0);
        expect(text).not.toContain('undefined');
        expect(text).not.toContain('NaN');
      }
    }
  });

  it('clampStat 挡住 NaN 并回落到基础值', () => {
    expect(clampStat('life', Number.NaN)).toBe(STAT_META.life.base);
  });
});

// ────────────────────────────────────────────────────────────
// 护甲边际效应
// ────────────────────────────────────────────────────────────
describe('护甲减伤 armorReduction', () => {
  it('境界 1 时护甲 100 → 62.5%', () => {
    // 公式：100 / (100 + 50 + 10×1) = 100/160
    near(armorReduction(100, 1), 0.625);
  });

  it('境界 1 时护甲 200 → 76.92%', () => {
    near(armorReduction(200, 1), 200 / 260);
  });

  it('边际效应：每点护甲的收益递减', () => {
    const d1 = armorReduction(100, 1) - armorReduction(0, 1);
    const d2 = armorReduction(200, 1) - armorReduction(100, 1);
    const d3 = armorReduction(400, 1) - armorReduction(200, 1);
    expect(d1).toBeGreaterThan(d2);
    expect(d2).toBeGreaterThan(d3);
  });

  it('减伤率封顶 90%，堆护甲不会变成无敌', () => {
    expect(armorReduction(1e9, 1)).toBe(0.9);
  });

  it('护甲为 0 或负数时不减伤', () => {
    expect(armorReduction(0)).toBe(0);
    expect(armorReduction(-50)).toBe(0);
    expect(armorReduction(Number.NaN)).toBe(0);
  });

  it('敌人境界越高，同样护甲的减伤越低', () => {
    expect(armorReduction(500, 10)).toBeLessThan(armorReduction(500, 1));
  });
});

// ────────────────────────────────────────────────────────────
// 伤害管线
// ────────────────────────────────────────────────────────────
describe('伤害管线 computeDamage', () => {
  const noDef = undefined;

  it('裸伤害：无修正器、不浮动、不暴击 → 等于基础值', () => {
    const r = computeDamage({
      base: 100,
      tags: ['attack'],
      modifiers: [],
      isCrit: false,
      roll: null,
    });
    expect(r.amount).toBe(100);
    expect(r.isCrit).toBe(false);
  });

  it('附加伤害（flat）先加', () => {
    const r = computeDamage({
      base: 100,
      tags: ['attack'],
      modifiers: [mod('damage', 'flat', 50, SRC)],
      isCrit: false,
      roll: null,
    });
    expect(r.amount).toBe(150);
  });

  it('increased 加法叠加', () => {
    const mods = [
      mod('damage', 'increased', 0.2, SRC),
      mod('damage', 'increased', 0.3, SRC),
    ];
    const r = computeDamage({ base: 100, tags: ['attack'], modifiers: mods, isCrit: false, roll: null });
    expect(r.amount).toBe(150);
  });

  it('more 乘法叠加（两个更多 20/30% → ×1.56 → 156）', () => {
    const mods = [mod('damage', 'more', 0.2, SRC), mod('damage', 'more', 0.3, SRC)];
    const r = computeDamage({ base: 100, tags: ['attack'], modifiers: mods, isCrit: false, roll: null });
    expect(r.amount).toBe(156);
  });

  it('increased 与 more 结果不同，证明两个乘区是分开的', () => {
    const asInc = [mod('damage', 'increased', 0.2, SRC), mod('damage', 'increased', 0.3, SRC)];
    const asMore = [mod('damage', 'more', 0.2, SRC), mod('damage', 'more', 0.3, SRC)];
    const a = computeDamage({ base: 100, tags: ['attack'], modifiers: asInc, isCrit: false, roll: null });
    const b = computeDamage({ base: 100, tags: ['attack'], modifiers: asMore, isCrit: false, roll: null });
    expect(a.amount).toBe(150);
    expect(b.amount).toBe(156);
    expect(b.amount).toBeGreaterThan(a.amount);
  });

  it('全套叠加：100 基础 +40 flat，+50% increased，×1.56 more = 327.6 → 328', () => {
    const mods = [
      mod('damage', 'flat', 40, SRC),
      mod('damage', 'increased', 0.5, SRC),
      mod('damage', 'more', 0.2, SRC),
      mod('damage', 'more', 0.3, SRC),
    ];
    const r = computeDamage({ base: 100, tags: ['attack'], modifiers: mods, isCrit: false, roll: null });
    near(r.raw, 327.6);
    expect(r.amount).toBe(328);
  });

  it('外部倍率（技能自带 / 浊气沸腾）单独一个乘区', () => {
    const r = computeDamage({
      base: 100,
      tags: ['spell'],
      modifiers: [],
      isCrit: false,
      roll: null,
      externalMore: 2,
    });
    expect(r.amount).toBe(200);
  });

  it('随机浮动 0.9 生效', () => {
    const r = computeDamage({ base: 100, tags: ['attack'], modifiers: [], isCrit: false, roll: 0.9 });
    expect(r.amount).toBe(90);
  });

  it('暴击默认 1.5 倍', () => {
    const r = computeDamage({ base: 100, tags: ['attack'], modifiers: [], isCrit: true, roll: null });
    expect(r.amount).toBe(150);
    expect(r.isCrit).toBe(true);
  });

  it('暴击倍率可以被词缀提高', () => {
    const mods = [mod('critMulti', 'flat', 0.5, SRC)];
    near(critMultiplier(mods), 2.0);
    const r = computeDamage({ base: 100, tags: ['attack'], modifiers: mods, isCrit: true, roll: null });
    expect(r.amount).toBe(200);
  });

  it('元素伤害 70% 走抗性 + 30% 走护体（D19）：100 打 30% 火抗 + 满护甲 → 52', () => {
    // 抗性 30% × 0.7 = 21%，护体 9999 打满上限 90% × 0.3 = 27% → 合计减伤 48% → 52
    const r = computeDamage({
      base: 100,
      tags: ['spell', 'fire'],
      modifiers: [],
      isCrit: false,
      roll: null,
      target: { armor: 9999, resist: { resFire: 0.3 }, level: 1 },
    });
    expect(r.amount).toBe(52);
    // 减伤拆解要能算给玩家看，且两条通道都在里面
    expect(mitigationOf(['spell', 'fire'], { armor: 9999, resist: { resFire: 0.3 }, level: 1 })).toBeCloseTo(0.48, 6);
    const step = r.steps.find((s) => s.label === '抗性+护体');
    expect(step).toBeTruthy();
    expect(step?.note).toContain('0.7');
  });

  it('元素伤害但目标没护甲时只吃抗性（不打折也不额外增伤）', () => {
    const r = computeDamage({
      base: 100,
      tags: ['spell', 'fire'],
      modifiers: [],
      isCrit: false,
      roll: null,
      target: { armor: 0, resist: { resFire: 0.3 }, level: 1 },
    });
    expect(r.amount).toBe(70);
  });

  it('无属性伤害走护甲，不吃五行抗性', () => {
    const r = computeDamage({
      base: 100,
      tags: ['attack', 'melee'],
      modifiers: [],
      isCrit: false,
      roll: null,
      target: { armor: 100, resist: { resFire: 0.9 }, level: 1 },
    });
    expect(r.amount).toBe(38); // 100 × (1 - 0.625) = 37.5 → 38
  });

  it('负抗性会放大伤害', () => {
    const r = computeDamage({
      base: 100,
      tags: ['spell', 'fire'],
      modifiers: [],
      isCrit: false,
      roll: null,
      target: { armor: 0, resist: { resFire: -0.5 }, level: 1 },
    });
    expect(r.amount).toBe(150);
  });

  it('保底伤害 1：抗性 100% 也不会打出 0', () => {
    const r = computeDamage({
      base: 10,
      tags: ['spell', 'fire'],
      modifiers: [],
      isCrit: false,
      roll: null,
      target: { armor: 0, resist: { resFire: 1 }, level: 1 },
    });
    expect(r.amount).toBe(1);
  });

  it('标签只加成匹配的伤害实例（法术加成不影响攻击）', () => {
    const mods = [mod('damage', 'increased', 1.0, SRC, ['spell'])];
    const atk = computeDamage({ base: 100, tags: ['attack'], modifiers: mods, isCrit: false, roll: null });
    const spl = computeDamage({ base: 100, tags: ['spell'], modifiers: mods, isCrit: false, roll: null });
    expect(atk.amount).toBe(100);
    expect(spl.amount).toBe(200);
  });

  it('steps 记录了每一步，可直接做成伤害拆解面板', () => {
    const r = computeDamage({
      base: 100,
      tags: ['attack'],
      modifiers: [mod('damage', 'increased', 0.5, SRC)],
      isCrit: true,
      roll: null,
    });
    const labels = r.steps.map((s) => s.label);
    expect(labels).toEqual(['基础伤害', '伤害提高', '命中破绽']);
    expect(r.steps[r.steps.length - 1].after).toBeGreaterThan(150);
  });

  it('contributions 带上来源名，面板能回答「这 40 点是谁给的」', () => {
    const r = computeDamage({
      base: 100,
      tags: ['attack'],
      modifiers: [mod('damage', 'increased', 0.4, { kind: 'talent', label: '星点·破军' })],
      isCrit: false,
      roll: null,
    });
    expect(r.contributions).toHaveLength(1);
    expect(r.contributions[0].source).toBe('星点·破军');
    near(r.contributions[0].value, 0.4);
  });

  it('基础伤害为负数或 NaN 时归零，不产生负伤害', () => {
    const neg = computeDamage({ base: -50, tags: ['attack'], modifiers: [], isCrit: false, roll: null });
    expect(neg.raw).toBe(0);
    const bad = computeDamage({ base: Number.NaN, tags: ['attack'], modifiers: [], isCrit: false, roll: null });
    expect(bad.amount).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────
// 浊气系统
// ────────────────────────────────────────────────────────────
describe('浊气系统 turbid', () => {
  it('浊气 0 → 伤害 ×1.0，浊气 100 → ×1.5', () => {
    near(turbidDamageMul(0), 1.0);
    near(turbidDamageMul(50), 1.25);
    near(turbidDamageMul(TURBID_MAX), 1.5);
  });

  it('浊气越高回复越少：100 时只剩 60%', () => {
    near(turbidRegenMul(0), 1.0);
    near(turbidRegenMul(TURBID_MAX), 0.6);
  });

  it('浊气值超出范围时被夹住', () => {
    near(turbidDamageMul(-10), 1.0);
    near(turbidDamageMul(999), 1.5);
    near(turbidDamageMul(Number.NaN), 1.0);
  });

  it('平静期每秒自然消散 1.5 点；击杀涨浊气', () => {
    const s = createTurbid();
    s.value = 40;
    tickTurbid(s, 1, 0);
    near(s.value, 38.5);
    tickTurbid(s, 1, 10);
    near(s.value, 47.0);
  });

  it('满值进入浊化爆发，期间伤害 ×3（1.5 × 2）', () => {
    const s = createTurbid();
    s.value = 98;
    tickTurbid(s, 1, 10); // 98 - 1.5 + 10 = 106.5 → 夹到 100 并进爆发
    expect(s.phase).toBe('corrupting');
    near(s.value, TURBID_MAX);
    near(turbidMultiplier(s), 1.5 * CORRUPTION_DAMAGE_MUL);
  });

  it('浊化 5 秒后转入虚弱，浊气清零，伤害 ×0.6 且更疼', () => {
    const s = createTurbid();
    s.value = 98;
    tickTurbid(s, 1, 10);
    expect(s.phase).toBe('corrupting');
    tickTurbid(s, 5, 0);
    expect(s.phase).toBe('weak');
    near(s.value, 0);
    near(turbidMultiplier(s), 0.6);
    near(turbidTakenMultiplier(s), 1.3);
    near(turbidHealMultiplier(s), 0.5);
  });

  it('虚弱 4 秒后回到平静，倍率恢复 ×1.0', () => {
    const s = createTurbid();
    s.value = 98;
    tickTurbid(s, 1, 10);
    tickTurbid(s, 5, 0);
    expect(s.phase).toBe('weak');
    tickTurbid(s, 4, 0);
    expect(s.phase).toBe('calm');
    near(turbidMultiplier(s), 1.0);
    near(turbidTakenMultiplier(s), 1.0);
  });

  it('浊气值不会低于 0', () => {
    const s = createTurbid();
    tickTurbid(s, 100, 0);
    near(s.value, 0);
  });

  it('dt 为 0 / 负数 / NaN 时不推进状态', () => {
    const s = createTurbid();
    s.value = 50;
    tickTurbid(s, 0, 10);
    near(s.value, 50);
    tickTurbid(s, -5, 10);
    near(s.value, 50);
    tickTurbid(s, Number.NaN, 10);
    near(s.value, 50);
  });

  it('浊气倍率可以当 externalMore 直接进伤害管线', () => {
    const s = createTurbid();
    s.value = 50;
    const r = computeDamage({
      base: 100,
      tags: ['attack'],
      modifiers: [],
      isCrit: false,
      roll: null,
      externalMore: turbidMultiplier(s),
    });
    expect(r.amount).toBe(125);
  });
});

describe('浊气：攒满必须当场爆发（回归测试）', () => {
  it('一帧加满 100 点时立即进入浊化，不被自然消散吃掉', () => {
    const t = createTurbid();
    t.value = 0;
    tickTurbid(t, 0.1, 100);
    expect(t.phase).toBe('corrupting');
    expect(t.value).toBe(TURBID_MAX);
  });

  it('98 + 一帧加 2.5 点也会爆发（跨过阈值的边界情况）', () => {
    const t = createTurbid();
    t.value = 98;
    tickTurbid(t, 1 / 60, 2.5);
    expect(t.phase).toBe('corrupting');
  });

  it('差一点点不会爆发，而且会正常消散', () => {
    const t = createTurbid();
    t.value = 90;
    tickTurbid(t, 1, 1);
    expect(t.phase).toBe('calm');
    expect(t.value).toBeLessThan(91);
  });

  it('连续多帧小量累加最终会爆发（不是只在整帧大额时才行）', () => {
    const t = createTurbid();
    t.value = 0;
    for (let i = 0; i < 100; i++) tickTurbid(t, 1 / 60, 1.2);
    expect(t.phase).toBe('corrupting');
  });
});
