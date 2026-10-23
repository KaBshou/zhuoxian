// 部位归一化战力 + 品阶内分位（D89）—— 钉住「面板显示的数 = 验收用的数」。
//
// 这组测试存在的理由：`src/data/slot-power-table.json` 是**生成物**，
// 它失效的方式是静默的（分母失真不报错，只让比值悄悄偏移）。
// 所以这里钉的是「契约」而不是「某个具体数值」：
//   ① 表覆盖全部部位与全部品阶（少一格 → 比值变 0 → 面板画空白，不报错）；
//   ② 分母与 `tools/session-runner.mjs` 读的是同一张表（同源，不许各算一遍）；
//   ③ 分位是单调不减的（战力越高，分位不许更低）—— 这是它作为「展示量」的全部意义。
import { describe, expect, it } from 'vitest';
import {
  QUANTILE_MIN_SAMPLES,
  SLOT_POWER_GRID,
  SLOT_POWER_ILVL_STEP,
  powerDeltaText,
  powerRatio,
  powerRatioText,
  rarityPercentile,
  rarityRankText,
  slotBasePower,
} from '../src/core/power-rank';
import { itemPower } from '../src/core/inventory';
import { makeItem, type Item } from '../src/core/item';
import { Rng } from '../src/core/rng';
import { rollLoot } from '../src/core/loot';
import { ITEM_BASES } from '../src/data/bases';
import { AFFIXES } from '../src/data/affixes';
import { SLOT_KINDS, type SlotKind } from '../src/data/slots';

const ALL_SLOTS: readonly SlotKind[] = SLOT_KINDS;
const RARITIES = ['fan', 'ling', 'bao', 'xian'] as const;

/** 造一件真实分布的装备（走 loot 管线，不手写数值） */
function rollOf(slot: SlotKind, ilvl: number, wantRarity: string, seed = 1): Item {
  const rng = new Rng(seed);
  for (let i = 0; i < 20000; i++) {
    const res = rollLoot(rng, ITEM_BASES, AFFIXES, { ilvl, rarityBonus: 0.9, slot });
    if (res.rarity === wantRarity) return res.item;
  }
  throw new Error(`抽不到 ${wantRarity}`);
}

describe('基准表：契约与覆盖', () => {
  it('网格按 ilvlStep 均匀递增，且覆盖到 99', () => {
    expect(SLOT_POWER_ILVL_STEP).toBeGreaterThan(0);
    expect(SLOT_POWER_GRID[0]).toBe(SLOT_POWER_ILVL_STEP);
    for (let i = 1; i < SLOT_POWER_GRID.length; i++) {
      expect(SLOT_POWER_GRID[i] - SLOT_POWER_GRID[i - 1]).toBe(SLOT_POWER_ILVL_STEP);
    }
    expect(SLOT_POWER_GRID[SLOT_POWER_GRID.length - 1]).toBeLessThanOrEqual(99);
    expect(SLOT_POWER_GRID[SLOT_POWER_GRID.length - 1]).toBeGreaterThan(90);
  });

  it('九个部位都有分母，且都是正数（缺一个 → 那个部位永远显示不出比值）', () => {
    for (const slot of ALL_SLOTS) {
      for (const ilvl of [1, 20, 50, 99]) {
        const v = slotBasePower(slot, ilvl);
        expect(v, `${slot}@${ilvl}`).toBeGreaterThan(0);
      }
    }
  });

  it('部位量纲差很大 ⇒ 全局阈值必错（这是判据 C 必须按部位归一的证据）', () => {
    const ring = slotBasePower('ring', 99);
    const pendant = slotBasePower('pendant', 99);
    expect(pendant / ring).toBeGreaterThan(3);
  });

  it('未知部位返回 0，不返回 NaN/Infinity', () => {
    expect(slotBasePower('nope' as SlotKind, 50)).toBe(0);
  });

  it('两端夹取：ilvl 0 与 ilvl 999 都给边界值，不外推', () => {
    const low = slotBasePower('sword', 0);
    const high = slotBasePower('sword', 999);
    expect(Number.isFinite(low)).toBe(true);
    expect(Number.isFinite(high)).toBe(true);
    expect(low).toBeLessThanOrEqual(slotBasePower('sword', SLOT_POWER_GRID[0]));
    expect(high).toBe(slotBasePower('sword', 99));
  });

  it('中间档是插值：落在两格之间', () => {
    const a = slotBasePower('sword', 40);
    const b = slotBasePower('sword', 44);
    const mid = slotBasePower('sword', 42);
    expect(mid).toBeGreaterThanOrEqual(Math.min(a, b));
    expect(mid).toBeLessThanOrEqual(Math.max(a, b));
  });
});

describe('归一化比值（判据 C 的显示口径）', () => {
  it('宝品在它自己的灵蕴上，比值落在 1 附近（分位口径自洽的锚点）', () => {
    const item = rollOf('sword', 60, 'bao', 7);
    const r = powerRatio(item);
    expect(r).toBeGreaterThan(0.4);
    expect(r).toBeLessThan(2.5);
  });

  it('比值 = itemPower ÷ slotBasePower（同一个数，不许各算一遍）', () => {
    const item = rollOf('crown', 80, 'bao', 11);
    expect(powerRatio(item)).toBeCloseTo(itemPower(item) / slotBasePower('crown', 80), 10);
  });

  it('powerRatioText 两位小数、带 ×；分母缺失给空串而不是 NaN×', () => {
    const item = rollOf('belt', 30, 'ling', 3);
    expect(powerRatioText(item)).toMatch(/^\d+\.\d{2}×$/);
    const broken = { ...item, slot: 'nope' } as unknown as Item;
    expect(powerRatioText(broken)).toBe('');
  });
});

describe('品阶内分位', () => {
  it('分位随战力单调不减（同部位、同灵蕴、同品阶内）', () => {
    const slot: SlotKind = 'robe';
    const ilvl = 72;
    const items = Array.from({ length: 12 }, (_, i) => rollOf(slot, ilvl, 'bao', 100 + i));
    const sorted = [...items].sort((a, b) => itemPower(a) - itemPower(b));
    let prev = -1;
    for (const it of sorted) {
      const pct = rarityPercentile(it);
      expect(pct).not.toBeNull();
      expect(pct as number).toBeGreaterThanOrEqual(prev);
      prev = pct as number;
    }
  });

  it('分位永远在 0~100 之间（整数）', () => {
    for (const slot of ['sword', 'ring', 'pendant'] as SlotKind[]) {
      for (let i = 0; i < 6; i++) {
        const pct = rarityPercentile(rollOf(slot, 50 + i * 8, 'ling', 200 + i));
        if (pct === null) continue;
        expect(Number.isInteger(pct)).toBe(true);
        expect(pct).toBeGreaterThanOrEqual(0);
        expect(pct).toBeLessThanOrEqual(100);
      }
    }
  });

  it('四个品阶都能出分位（样本足够）', () => {
    for (const rarity of RARITIES) {
      const pct = rarityPercentile(rollOf('bracer', 60, rarity, 31));
      expect(pct, rarity).not.toBeNull();
      expect(QUANTILE_MIN_SAMPLES).toBeGreaterThan(0);
    }
  });

  it('展示文案三档：前 / 中位 / 后，且含品阶名', () => {
    const texts = new Set<string>();
    for (let i = 0; i < 24; i++) texts.add(rarityRankText(rollOf('bracer', 60, 'bao', 400 + i)));
    expect([...texts].some((t) => t.includes('前'))).toBe(true);
    expect([...texts].every((t) => t.startsWith('宝品'))).toBe(true);
    expect([...texts].every((t) => !t.includes('NaN'))).toBe(true);
  });

  it('分位数据缺失时只给品阶名（不假装知道）', () => {
    const item = rollOf('sword', 60, 'bao', 5);
    const broken = { ...item, slot: 'nope' } as unknown as Item;
    expect(rarityPercentile(broken)).toBeNull();
    expect(rarityRankText(broken)).toBe('宝品');
  });
});

describe('换装对比文案', () => {
  const base = makeItem(
    { slot: 'sword', rarity: 'bao', ilvl: 40, name: '测试剑', affixes: [], base: [{ stat: 'damage', op: 'flat', value: 10 }], uid: 'u1' },
    new Rng(1),
  );
  const stronger = makeItem(
    { slot: 'sword', rarity: 'bao', ilvl: 40, name: '测试剑2', affixes: [], base: [{ stat: 'damage', op: 'flat', value: 14 }], uid: 'u2' },
    new Rng(2),
  );

  it('空位 / 更强 / 更弱 / 持平 四种说法', () => {
    expect(powerDeltaText(stronger, null)).toBe('空位');
    expect(powerDeltaText(stronger, base)).toMatch(/^\+/);
    expect(powerDeltaText(base, stronger)).toMatch(/^-/);
    expect(powerDeltaText(base, base)).toBe('持平');
  });

  it('对方战力为 0 时给空串（不除以 0 变 Infinity%）', () => {
    const zero = makeItem(
      { slot: 'sword', rarity: 'fan', ilvl: 1, name: '空剑', affixes: [], base: [], uid: 'u3' },
      new Rng(3),
    );
    expect(powerDeltaText(base, zero)).toBe('');
  });
});
