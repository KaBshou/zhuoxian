/**
 * D161/D162：深层专属传奇 —— **追加槽，不是分池**。
 *
 * 两条今天必须钉住的结构：
 * 1. **基础 9 条的率一点都不能少**（层 <40 传奇率 1.8~2.2%；层 ≥40 主抽取仍只来自基础池）；
 *    分池（40% 给深层）会让基础收集 5.3h → 8.8h，那是「加新货稀释老货」（D162）。
 * 2. **追加槽必须真的产出第二件**（`extraItem`），并且只从深层池抽、只在层 ≥40。
 */
import { describe, expect, it } from 'vitest';
import { rollLoot, rollRarity } from '../src/core/loot';
import { rollMonsterDropAll } from '../src/core/drop';
import { Rng } from '../src/core/rng';
import { ITEM_BASES } from '../src/data/bases';
import { AFFIXES } from '../src/data/affixes';
import {
  ALL_LEGENDARY_DEFS,
  DEEP_EXTRA_CHANCE,
  DEEP_LEGENDARY_DEFS,
  DEEP_LEGENDARY_MIN_FLOOR,
  LEGENDARY_DEFS,
} from '../src/data/legendary';
import { CODEX_LEGENDARY_TOTAL, CODEX_MONSTER_TOTAL, CODEX_TOTAL, CODEX_VARIANT_TOTAL } from '../src/core/codex';

const DEEP_IDS = new Set(DEEP_LEGENDARY_DEFS.map((d) => d.id));
const BASE_IDS = new Set(LEGENDARY_DEFS.map((d) => d.id));
const TABLES = { bases: ITEM_BASES, affixes: AFFIXES };

interface Row {
  rarity: string;
  legendary?: string;
  extraLegendary?: string;
}

function sample(floor: number, n: number, seed = 0x5eed, rarityBonus = 1): Row[] {
  const rng = new Rng(seed);
  const out: Row[] = [];
  for (let i = 0; i < n; i += 1) {
    const r = rollLoot(rng, ITEM_BASES, AFFIXES, {
      slot: 'sword',
      ilvl: Math.max(1, Math.round((99 * Math.min(76, floor)) / 27)),
      rarityBonus,
      floor,
    });
    out.push({
      rarity: r.rarity,
      legendary: r.item.legendary,
      extraLegendary: r.extraItem?.legendary,
    });
  }
  return out;
}

describe('传奇池：数据契约', () => {
  it('基础 9 + 深层 3 = 12，图鉴总数按数据表算', () => {
    expect(LEGENDARY_DEFS.length).toBe(9);
    expect(DEEP_LEGENDARY_DEFS.length).toBe(3);
    expect(ALL_LEGENDARY_DEFS.length).toBe(12);
    expect(CODEX_LEGENDARY_TOTAL).toBe(12);
    expect(CODEX_TOTAL).toBe(CODEX_MONSTER_TOTAL + 12 + CODEX_VARIANT_TOTAL);
  });

  it('id 不重复、名字/描述非空、门槛 40、追加率 0.30', () => {
    const ids = ALL_LEGENDARY_DEFS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of ALL_LEGENDARY_DEFS) {
      expect(d.name.length).toBeGreaterThan(0);
      expect(d.desc.length).toBeGreaterThan(0);
    }
    expect(DEEP_LEGENDARY_MIN_FLOOR).toBe(40);
    // D164：0.30 把段④ 压到 3.2h（目标 5.5~6.5h）⇒ 定稿 0.10。\n    expect(DEEP_EXTRA_CHANCE).toBeCloseTo(0.1, 6);
  });
});

describe('传奇池：低层一点都不能少（D64 棘轮）', () => {
  it('层 <40 抽不到深层传奇，也永远没有追加件', () => {
    for (const floor of [1, 10, 27, 39]) {
      const rows = sample(floor, 4000);
      expect(rows.filter((r) => r.extraLegendary !== undefined).length).toBe(0);
      expect(rows.filter((r) => r.legendary && DEEP_IDS.has(r.legendary)).length).toBe(0);
    }
  });

  it('层 <40 传奇率仍在 1.8~2.2%（与改动前同量级）', () => {
    for (const floor of [1, 27]) {
      const rows = sample(floor, 20000);
      const rate = rows.filter((r) => r.legendary).length / rows.length;
      expect(rate).toBeGreaterThan(0.018);
      expect(rate).toBeLessThan(0.022);
    }
  });
});

describe('传奇池：层 ≥40 追加槽', () => {
  it('追加槽是「每掉传奇加 30%」，不是「每件掉落加 30%」', () => {
    const rows = sample(46, 20000, 0x5eed, 1.45);
    const legendaries = rows.filter((r) => r.legendary).length;
    const extras = rows.filter((r) => r.extraLegendary !== undefined).length;
    expect(legendaries).toBeGreaterThan(400); // 哨兵：样本够才判比例
    const ratio = extras / legendaries;
    // 这条钉住 2026-10-23 踩过的坑：条件写成「每件都掷」时 extras/items 会是 30%，
    // 而 extras/legendaries 会飙到 ~6（段④ 仙品/3h 从 14.3 变 207，满级 259.6→216.9）。
    expect(ratio).toBeGreaterThan(DEEP_EXTRA_CHANCE - 0.06);
    expect(ratio).toBeLessThan(DEEP_EXTRA_CHANCE + 0.06);
  });

  it('主抽取永远只来自基础 9 条（分池式会让这条红）', () => {
    const rows = sample(46, 20000, 0x5eed, 1.45);
    const mainDeep = rows.filter((r) => r.legendary && DEEP_IDS.has(r.legendary)).length;
    expect(mainDeep).toBe(0);
    const baseHit = rows.filter((r) => r.legendary && BASE_IDS.has(r.legendary)).length;
    expect(baseHit).toBeGreaterThan(150);
  });

  it('追加件永远带深层专属传奇', () => {
    const rows = sample(46, 20000, 0x5eed, 1.45).filter((r) => r.extraLegendary !== undefined);
    expect(rows.length).toBeGreaterThan(30);
    expect(rows.every((r) => DEEP_IDS.has(r.extraLegendary!))).toBe(true);
  });

  it('层号完全不参与品阶（结构性证明：同 bonus 同种子，层 1 与层 76 逐位相同）', () => {
    // 品阶只由调用方传的 rarityBonus 决定（depthRarityBonus 由 drop.ts 折进去）。
    // 若哪天又出现「层 ≥40 品阶 ×N」这种常量（D161 的 DEEP_RARITY_MUL = 2 就是），这条立刻红。
    for (const seed of [0x11, 0x22, 0x33]) {
      const low = rollLoot(new Rng(seed), ITEM_BASES, AFFIXES, { slot: 'sword', ilvl: 99, rarityBonus: 1.45, floor: 1 });
      const high = rollLoot(new Rng(seed), ITEM_BASES, AFFIXES, { slot: 'sword', ilvl: 99, rarityBonus: 1.45, floor: 76 });
      expect(high.rarity).toBe(low.rarity);
      expect(high.item.name).toBe(low.item.name);
      expect(rollRarity(new Rng(seed), 1.45)).toBe(low.rarity);
    }
  });

  it('不传 floor 与传 1 逐位相同（老调用点行为不变）', () => {
    const a = new Rng(0xabc);
    const b = new Rng(0xabc);
    const one = rollLoot(a, ITEM_BASES, AFFIXES, { slot: 'sword', ilvl: 20, rarityBonus: 1 });
    const two = rollLoot(b, ITEM_BASES, AFFIXES, { slot: 'sword', ilvl: 20, rarityBonus: 1, floor: 1 });
    expect(one.item.name).toBe(two.item.name);
    expect(one.item.legendary).toEqual(two.item.legendary);
    expect(one.extraItem).toBeUndefined();
  });
});

describe('传奇池：追加件必须被真正收货（死通道检查）', () => {
  it('rollMonsterDropAll 在层 46 会返回两件，其中第二件带深层传奇', () => {
    const rng = new Rng(0x1234);
    let doubleSeen = 0;
    for (let i = 0; i < 4000; i += 1) {
      const items = rollMonsterDropAll('m-fangshi', 46, 'boss', rng, TABLES, 0, true);
      if (items.length >= 2) {
        doubleSeen += 1;
        expect(DEEP_IDS.has(items[1]!.legendary ?? '')).toBe(true);
      }
    }
    // 4000 件 × 仙品率 ~4.7% × 30% ≈ 56\n    expect(doubleSeen).toBeGreaterThan(20);
  });

  it('浅层永远只返回一件（追加槽不进低层）', () => {
    const rng = new Rng(0x4321);
    for (let i = 0; i < 500; i += 1) {
      expect(rollMonsterDropAll('m-fangshi', 20, 'boss', rng, TABLES, 0, true).length).toBe(1);
    }
  });
});
