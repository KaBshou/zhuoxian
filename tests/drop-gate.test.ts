import { describe, expect, it } from 'vitest';
import { DROP_CHANCE, rollDropGate, rollMonsterDrop } from '../src/core/drop';
import { Rng } from '../src/core/rng';
import { AFFIXES } from '../src/data/affixes';
import { ITEM_BASES } from '../src/data/bases';

/**
 * D46.1：掉落「闸在分流之前」。
 *
 * 这两条断言守的是一个曾经真错过的口径：
 * - 闸必须真的按 DROP_CHANCE 掷（0.28），而不是「分流后再补一刀」
 * - 过了闸的法宝分支**不许再掷第二次**（否则 0.4 × 0.28 变 0.4 × 0.28 × 0.28）
 */
const TABLES = { bases: ITEM_BASES, affixes: AFFIXES };

describe('掉落闸（D46.1）', () => {
  it('普通怪约 28% 的击杀出货（10000 次抽样）', () => {
    const rng = new Rng(20261022);
    let hit = 0;
    for (let i = 0; i < 10_000; i++) if (rollDropGate(rng, 'normal')) hit++;
    expect(hit / 10_000).toBeGreaterThan(0.25);
    expect(hit / 10_000).toBeLessThan(0.31);
    expect(DROP_CHANCE.normal).toBe(0.28);
  });

  it('镇守必出货、品阶越高越容易出', () => {
    const rng = new Rng(7);
    let boss = 0;
    let magic = 0;
    for (let i = 0; i < 2000; i++) {
      if (rollDropGate(rng, 'boss')) boss++;
      if (rollDropGate(rng, 'magic')) magic++;
    }
    expect(boss).toBe(2000);
    expect(magic / 2000).toBeGreaterThan(0.35);
    expect(magic / 2000).toBeLessThan(0.5);
  });

  it('同一个种子给出同一串结果（掉落必须可复现，离线要补算）', () => {
    const a = new Rng(99);
    const b = new Rng(99);
    const seqA = Array.from({ length: 50 }, () => rollDropGate(a, 'normal'));
    const seqB = Array.from({ length: 50 }, () => rollDropGate(b, 'normal'));
    expect(seqA).toEqual(seqB);
  });

  it('alreadyGated=true 时不再掷闸：普通怪也必定产出法宝', () => {
    const rng = new Rng(11);
    let ok = 0;
    for (let i = 0; i < 100; i++) {
      const item = rollMonsterDrop('yao-1', 10, 'normal', rng, TABLES, 0, true);
      if (item) ok++;
    }
    expect(ok).toBe(100);
  });

  it('alreadyGated=false（默认）时仍按 28% 出货（旧调用方不受影响）', () => {
    const rng = new Rng(12);
    let ok = 0;
    for (let i = 0; i < 4000; i++) {
      if (rollMonsterDrop('yao-1', 10, 'normal', rng, TABLES, 0)) ok++;
    }
    expect(ok / 4000).toBeGreaterThan(0.24);
    expect(ok / 4000).toBeLessThan(0.32);
  });

  it('未知品阶直接判否、不抛异常', () => {
    const rng = new Rng(3);
    // 存档损坏 / 怪表版本不一致时可能出现表外品阶，这里必须"安静地不掉"而不是崩
    const bogus = 'nonsense' as unknown as Parameters<typeof rollDropGate>[1];
    expect(rollDropGate(rng, bogus)).toBe(false);
    const bogusDrop = 'nonsense' as unknown as Parameters<typeof rollMonsterDrop>[2];
    expect(rollMonsterDrop('yao-1', 10, bogusDrop, rng, TABLES)).toBeNull();
  });
});
