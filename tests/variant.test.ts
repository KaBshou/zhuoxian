/**
 * D160：深层异变体（②）。
 *
 * 判据重点不是「函数返回值对不对」，而是「生成路径真的在用它」——
 * 本项目六个死通道（xpGain / lootQuantity / lootRarity / 怪物 armor / castSpeed / 贯头）
 * 全都是「有定义、有测试、没人读」。所以这里必须从 `spawnRing` 这一侧验证。
 */
import { describe, expect, it } from 'vitest';
import {
  RARITY_BRACKETS,
  addVariantAffix,
  rollMonsterIdentity,
  shouldSpawnVariant,
  VARIANT_EXTRA_DROP,
  VARIANT_MIN_FLOOR,
  VARIANT_WAVE_EVERY,
} from '../src/core/monster-roll';
import { spawnRing } from '../src/core/battle';
import { Rng } from '../src/core/rng';
import { MONSTER_QTY_CAP, getMonsterAffix, sumMonsterAffixes } from '../src/data/monster-affixes';
import { monstersOfTier, tierOfFloor } from '../src/data/monsters';
import { codexProgress, codexUnlockText, createCodex, hasVariant, recordMonsterKill, recordVariant } from '../src/core/codex';

const rng = (seed = 0x5eed) => new Rng(seed);

describe('异变体：判据（纯函数，不耗 rng）', () => {
  it('层 28 起、每 4 波一次、波 0 不算', () => {
    expect(VARIANT_MIN_FLOOR).toBe(28);
    expect(VARIANT_WAVE_EVERY).toBe(4);
    expect(shouldSpawnVariant(27, 4)).toBe(false);
    expect(shouldSpawnVariant(28, 4)).toBe(true);
    expect(shouldSpawnVariant(76, 40)).toBe(true);
    expect(shouldSpawnVariant(76, 3)).toBe(false);
    expect(shouldSpawnVariant(76, 0)).toBe(false);
  });

  it('脏输入安静判否（生成侧不能因为脏层号崩掉战斗）', () => {
    expect(shouldSpawnVariant(Number.NaN, 4)).toBe(false);
    expect(shouldSpawnVariant(28, Number.NaN)).toBe(false);
    expect(shouldSpawnVariant(Number.POSITIVE_INFINITY, 4)).toBe(false);
  });

  it('掉落加成独立于 MONSTER_QTY_CAP（否则会被 0.24 钳位吞掉 = 第八个死通道）', () => {
    // 单条「贪婪」0.12 还没到上限；四条叠满时妖纹合计会被钳在 0.24。
    expect(sumMonsterAffixes(['tan']).dropBonus).toBeCloseTo(0.12, 6);
    const capped = Math.min(MONSTER_QTY_CAP, sumMonsterAffixes(['tan', 'tan', 'tan', 'tan']).dropBonus);
    expect(capped).toBe(MONSTER_QTY_CAP);
    expect(VARIANT_EXTRA_DROP).toBeGreaterThan(0);
    // 妖纹的合计已被钳死在上限，异变体的加成在 session 里是**另一项相加**，
    // 所以最终 q 可以超过 MONSTER_QTY_CAP —— 这条是那个设计的可执行证据。
    expect(capped + VARIANT_EXTRA_DROP).toBeGreaterThan(MONSTER_QTY_CAP);
  });
});

describe('异变体：第 2 条同类妖纹', () => {
  it('原本 0 条（normal 异变）⇒ 变成 2 条同类', () => {
    const ids = addVariantAffix(rng(), 30, []);
    expect(ids.length).toBe(2);
    const cats = ids.map((id) => getMonsterAffix(id)?.category);
    expect(cats[0]).toBe(cats[1]);
  });

  it('原本 1~2 条 ⇒ 只多 1 条，且类别来自已有集合', () => {
    const before = ['sha', 'hou'];
    const after = addVariantAffix(rng(7), 30, before);
    expect(after.length).toBe(3);
    const added = after[after.length - 1]!;
    const addedCat = getMonsterAffix(added)?.category;
    const beforeCats = before.map((id) => getMonsterAffix(id)?.category);
    expect(beforeCats).toContain(addedCat);
    expect(after.slice(0, 2)).toEqual(before); // 已有两条不许被改
  });

  it('原本 4 条（rare）⇒ 5 条，不违反类别互斥（异变是显式例外）', () => {
    const before = ['sha', 'hou', 'xun', 'tan'];
    expect(new Set(before).size).toBe(4);
    const after = addVariantAffix(rng(11), 30, before);
    expect(after.length).toBe(before.length + 1);
  });

  it('同种子可复现（异变不能破坏确定性）', () => {
    expect(addVariantAffix(rng(99), 35, ['sha'])).toEqual(addVariantAffix(rng(99), 35, ['sha']));
  });
});

describe('异变体：生成路径真的在用（spawnRing 侧）', () => {
  it('层 28 / 第 4 波：4 只里恰好 1 只异变体', () => {
    const defs = monstersOfTier(tierOfFloor(28));
    const list = spawnRing(defs, 28, 4, new Rng(21), 100, 0, 4);
    expect(list.length).toBe(4);
    expect(list.filter((m) => m.variant === true).length).toBe(1);
  });

  it('层 28 / 第 3 波：一只都没有', () => {
    const defs = monstersOfTier(tierOfFloor(28));
    const list = spawnRing(defs, 28, 4, new Rng(21), 100, 0, 3);
    expect(list.filter((m) => m.variant === true).length).toBe(0);
  });

  it('层 27 / 第 4 波：一只都没有（中段不加尖峰）', () => {
    const defs = monstersOfTier(tierOfFloor(27));
    const list = spawnRing(defs, 27, 4, new Rng(21), 100, 0, 4);
    expect(list.filter((m) => m.variant === true).length).toBe(0);
  });

  it('异变体的妖纹里必定有一对同类别；普通怪绝不重复类别', () => {
    const defs = monstersOfTier(tierOfFloor(40));
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const list = spawnRing(defs, 40, 4, new Rng(seed), 100, 0, 4);
      for (const m of list) {
        const cats = (m.affixIds ?? []).map((id) => getMonsterAffix(id)?.category);
        if (m.variant === true) {
          expect(new Set(cats).size).toBeLessThan(cats.length);
        } else {
          expect(new Set(cats).size).toBe(cats.length);
        }
      }
    }
  });
});

describe('异变体：图鉴独立一行（第 31 行）', () => {
  it('新号未收录，收录后进进度且只播报一次', () => {
    const c0 = createCodex();
    expect(hasVariant(c0)).toBe(false);
    const c1 = recordVariant(c0);
    expect(hasVariant(c1)).toBe(true);
    expect(recordVariant(c1)).toBe(c1); // 没变化返回原对象
    expect(codexProgress(c1).variants.got).toBe(1);
    expect(codexUnlockText('variant', '异变体')).toContain('异变体');
  });

  it('不含「见过 N 次」计数（计数是成就的活，图鉴只记「有这东西」）', () => {
    let c = createCodex();
    for (let i = 0; i < 5; i += 1) c = recordVariant(c);
    expect(c.variants.length).toBe(1);
  });
});

describe('异变体：与改造前逐位兼容', () => {
  it('不传 variant 与显式 false 逐位相同', () => {
    const defs = monstersOfTier(tierOfFloor(30));
    const a = spawnRing(defs, 30, 4, new Rng(5), 1, 0);
    const b = spawnRing(defs, 30, 4, new Rng(5), 1, 0, 0);
    expect(a.map((m) => [m.hp, m.damage, m.variant])).toEqual(b.map((m) => [m.hp, m.damage, m.variant]));
    expect(a.every((m) => m.variant === false)).toBe(true);
  });

  it('rollMonsterIdentity 不传 variant 时与旧行为一致（稀有度分档表没被改动）', () => {
    expect(RARITY_BRACKETS.length).toBe(4);
    const one = rollMonsterIdentity(new Rng(3), 30, false);
    const two = rollMonsterIdentity(new Rng(3), 30, false, false);
    expect(one).toEqual(two);
  });
});

describe('D170：异变体那一行必须走产品路径（不是只有测试能填）', () => {
  const ANY_MONSTER = 'fangshi-yuanke';
  it('杀一只异变体 ⇒ 走 recordMonsterKill 就解锁（玩家路径唯一入口）', () => {
    const c = recordMonsterKill(createCodex(), ANY_MONSTER, true);
    expect(c.monsters).toContain(ANY_MONSTER);
    expect(hasVariant(c)).toBe(true);
    expect(codexProgress(c).variants.got).toBe(1);
  });

  it('杀一只普通怪 ⇒ 异变体那行**不解锁**（防「反正都解锁」的通融写法）', () => {
    const c = recordMonsterKill(createCodex(), ANY_MONSTER, false);
    expect(c.monsters).toContain(ANY_MONSTER);
    expect(hasVariant(c)).toBe(false);
  });

  it('已解锁后再杀异变体 ⇒ 返回原对象引用（热路径不复制）', () => {
    const c = recordMonsterKill(createCodex(), ANY_MONSTER, true);
    expect(recordMonsterKill(c, ANY_MONSTER, true)).toBe(c);
  });

  it('未知 id + variant 仍然只解锁异变体行（浊物 id 无效不代表整次收录无效）', () => {
    const c = recordMonsterKill(createCodex(), 'not-a-monster', true);
    expect(c.monsters).toEqual([]);
    expect(hasVariant(c)).toBe(true);
  });
});