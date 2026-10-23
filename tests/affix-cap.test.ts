// 淬炼上限（P0 回归）：cap 必须真的生效
//
// 曾经的 bug：`item.ts` 的 `improveAffixes` 里写着 `void cap;` —— cap 参数被吞掉，
// 于是每次淬炼都在**上一次的结果**上再乘一遍：
//   淬灵石 1.1^n，夺造化 1.3^n（每次都 ×1.3）
// ceshi 实测夺造化 6 次把灵纹抬到原值的 4.8~14 倍 = **无限战力口子**，
// 直接违反 `data/marks.ts` 铁律 1（cap 1.3、不可叠加）。
//
// 现在上限 = `baseValue × cap`（baseValue = 刚掷出来时的数值）。
import { describe, expect, it } from 'vitest';
import { AFFIXES } from '../src/data/affixes';
import { improveAffixes, makeAffixInstance, makeItem, type Item } from '../src/core/item';
import { Rng } from '../src/core/rng';

function sample(): Item {
  const rng = new Rng(20261022);
  const def = AFFIXES[0];
  const inst = makeAffixInstance(def, 40);
  return makeItem(
    {
      slot: 'sword',
      rarity: 'bao',
      ilvl: 40,
      name: '测试法剑',
      base: [{ stat: 'damage', op: 'flat', value: 10 }],
      affixes: [inst],
    },
    rng,
  );
}

describe('淬炼上限（cap 必须生效）', () => {
  it('makeAffixInstance 会记下 baseValue', () => {
    const def = AFFIXES[0];
    const inst = makeAffixInstance(def, 40);
    expect(inst.baseValue).toBe(inst.value);
  });

  it('单次淬炼按 mul 抬升（没到 cap 时应真的涨）', () => {
    const it0 = sample();
    const before = it0.affixes[0].value;
    const r = improveAffixes(it0, 1.1, 1.3);
    expect(r.ok).toBe(true);
    expect(r.item.affixes[0].value).toBeCloseTo(before * 1.1, 6);
  });

  it('连淬 20 次不会超过 baseValue × cap', () => {
    let cur = sample();
    const base = cur.affixes[0].baseValue ?? cur.affixes[0].value;
    for (let i = 0; i < 20; i++) cur = improveAffixes(cur, 1.1, 1.3).item;
    expect(cur.affixes[0].value).toBeCloseTo(base * 1.3, 6);
    expect(cur.affixes[0].value).toBeLessThanOrEqual(base * 1.3 + 1e-9);
  });

  it('夺造化口径（1.3 / cap 1.3）连做 6 次也封顶在 1.3×base —— 不是复利', () => {
    let cur = sample();
    const base = cur.affixes[0].baseValue ?? cur.affixes[0].value;
    const growth: number[] = [];
    for (let i = 0; i < 6; i++) {
      cur = improveAffixes(cur, 1.3, 1.3).item;
      growth.push(cur.affixes[0].value / base);
    }
    // 第一次就到顶，之后一位不变（复利时这里会是 1.69 / 2.20 / 2.86 …）
    expect(growth[0]).toBeCloseTo(1.3, 6);
    for (const g of growth) expect(g).toBeCloseTo(1.3, 6);
  });

  it('老存档没有 baseValue：按当前值当基准，第一次照常生效、之后封顶', () => {
    const it0 = sample();
    const legacy: Item = {
      ...it0,
      affixes: [{ ...it0.affixes[0], baseValue: undefined }],
    };
    const v0 = legacy.affixes[0].value;
    const once = improveAffixes(legacy, 1.1, 1.3).item;
    expect(once.affixes[0].value).toBeCloseTo(v0 * 1.1, 6);
    let cur = once;
    for (let i = 0; i < 10; i++) cur = improveAffixes(cur, 1.1, 1.3).item;
    expect(cur.affixes[0].value).toBeCloseTo(v0 * 1.3, 6);
  });

  it('非法 mul / cap 走安全默认（1.1 / 1.3），不会把数值清零或放大到无穷', () => {
    const it0 = sample();
    const v0 = it0.affixes[0].value;
    const r = improveAffixes(it0, Number.NaN, Number.POSITIVE_INFINITY);
    expect(r.ok).toBe(true);
    expect(Number.isFinite(r.item.affixes[0].value)).toBe(true);
    expect(r.item.affixes[0].value).toBeCloseTo(v0 * 1.1, 6);
  });
});
