import { describe, expect, it } from 'vitest';

import { Rng, hashString, type Weighted } from '../src/core/rng';

/** 抽 n 个数，返回数组 */
function seq(rng: Rng, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(rng.float(0, 1));
  return out;
}

describe('可复现随机 Rng', () => {
  it('同种子必然同序列（这是掉落系统能被测试的前提）', () => {
    const a = seq(new Rng(12345), 20);
    const b = seq(new Rng(12345), 20);
    expect(a).toEqual(b);
  });

  it('不同种子出不同序列', () => {
    const a = seq(new Rng(1), 20);
    const b = seq(new Rng(2), 20);
    expect(a).not.toEqual(b);
  });

  it('种子为 0 / NaN 时被归一化，不产生全零序列', () => {
    const z = seq(new Rng(0), 5);
    const n = seq(new Rng(Number.NaN), 5);
    expect(z).toEqual(n);
    expect(new Set(z.slice(0, 5)).size).toBeGreaterThan(1);
  });

  it('存档往返：导出状态 → 新实例恢复 → 后续序列一致', () => {
    const r1 = new Rng(999);
    r1.float();
    r1.float();
    const saved = r1.state;
    const after1 = seq(r1, 10);

    const r2 = new Rng(1);
    r2.state = saved;
    const after2 = seq(r2, 10);
    expect(after2).toEqual(after1);
  });

  it('导出的是纯数据（可直接 JSON 存盘）', () => {
    const r = new Rng(7);
    r.int(0, 100);
    const round = JSON.parse(JSON.stringify(r.state)) as typeof r.state;
    const r2 = new Rng(1);
    r2.state = round;
    expect(seq(r2, 5)).toEqual(seq(r, 5));
  });

  it('drawn 计数反映抽了多少次', () => {
    const r = new Rng(5);
    expect(r.drawn).toBe(0);
    r.float();
    r.int(0, 10);
    expect(r.drawn).toBe(2);
  });

  it('float 落在 [min, max) 内', () => {
    const r = new Rng(42);
    for (let i = 0; i < 2000; i++) {
      const v = r.float(-5, 12);
      expect(v).toBeGreaterThanOrEqual(-5);
      expect(v).toBeLessThan(12);
    }
  });

  it('float(min>=max) 直接返回 min，不产生 NaN', () => {
    const r = new Rng(1);
    expect(r.float(5, 5)).toBe(5);
    expect(r.float(9, 2)).toBe(9);
    expect(r.float(Number.NaN, 3)).toBe(Number.NaN);
  });

  it('int 两端都含（最易写错的地方）', () => {
    const r = new Rng(314);
    const seen = new Set<number>();
    for (let i = 0; i < 3000; i++) seen.add(r.int(1, 4));
    expect([...seen].sort()).toEqual([1, 2, 3, 4]);
  });

  it('int(5,5) 恒为 5', () => {
    const r = new Rng(1);
    for (let i = 0; i < 20; i++) expect(r.int(5, 5)).toBe(5);
  });

  it('int 不会越界', () => {
    const r = new Rng(77);
    for (let i = 0; i < 5000; i++) {
      const v = r.int(0, 9);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(9);
    }
  });

  it('chance(0) 永不命中，chance(1) 必然命中', () => {
    const r = new Rng(8);
    for (let i = 0; i < 500; i++) {
      expect(r.chance(0)).toBe(false);
      expect(r.chance(1)).toBe(true);
      expect(r.chance(-1)).toBe(false);
      expect(r.chance(2)).toBe(true);
    }
  });

  it('chance(0.3) 的实际命中率接近 30%（±4%）', () => {
    const r = new Rng(2024);
    let hit = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) if (r.chance(0.3)) hit++;
    const rate = hit / N;
    expect(rate).toBeGreaterThan(0.26);
    expect(rate).toBeLessThan(0.34);
  });

  it('weighted 单条时必出', () => {
    const r = new Rng(1);
    const entries: Weighted<string>[] = [{ item: '只此一条', weight: 0.001 }];
    for (let i = 0; i < 50; i++) expect(r.weighted(entries)).toBe('只此一条');
  });

  it('weighted 跳过权重为 0 / 负 / 非有限数的条目', () => {
    const r = new Rng(2);
    const entries: Weighted<string>[] = [
      { item: '坏1', weight: 0 },
      { item: '坏2', weight: -5 },
      { item: '坏3', weight: Number.NaN },
      { item: '好', weight: 1 },
    ];
    for (let i = 0; i < 100; i++) expect(r.weighted(entries)).toBe('好');
  });

  it('weighted 空池返回 null（掉落池抽空是正常情况，不该崩）', () => {
    const r = new Rng(3);
    expect(r.weighted([])).toBeNull();
    expect(r.weighted([{ item: 'x', weight: 0 }])).toBeNull();
  });

  it('weighted 的实际分布符合权重（2:1，误差 ±2%）', () => {
    const r = new Rng(555);
    const entries: Weighted<string>[] = [
      { item: 'A', weight: 2 },
      { item: 'B', weight: 1 },
    ];
    const N = 30000;
    let a = 0;
    for (let i = 0; i < N; i++) if (r.weighted(entries) === 'A') a++;
    const rate = a / N;
    expect(rate).toBeGreaterThan(0.647);
    expect(rate).toBeLessThan(0.687);
  });

  it('pick 空数组抛错（空池不是正常情况，是编程错误）', () => {
    const r = new Rng(1);
    expect(() => r.pick([])).toThrow();
  });

  it('shuffle 保持元素不变、不改原数组', () => {
    const r = new Rng(11);
    const src = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = r.shuffle(src);
    expect(src).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(out.slice().sort()).toEqual(src.slice().sort());
  });

  it('sample 取 n 个不重复；n 超长时返回全部', () => {
    const r = new Rng(12);
    const src = ['a', 'b', 'c', 'd'];
    const got = r.sample(src, 3);
    expect(got).toHaveLength(3);
    expect(new Set(got).size).toBe(3);
    expect(r.sample(src, 99)).toHaveLength(4);
    expect(r.sample(src, 0)).toHaveLength(0);
  });

  it('fork 出来的子流可复现、且与父流不同', () => {
    const parent = new Rng(2020);
    const c1 = parent.fork('loot');
    const c2 = parent.fork('loot');
    expect(seq(c1, 10)).toEqual(seq(c2, 10));

    const parent2 = new Rng(2020);
    const other = parent2.fork('monster');
    const loot = parent2.fork('loot');
    expect(seq(other, 10)).not.toEqual(seq(loot, 10));
  });

  it('fork 不影响父流（分叉后父流序列不变）', () => {
    const p1 = new Rng(33);
    const before = seq(p1.clone(), 5);
    const p2 = new Rng(33);
    p2.fork('a');
    p2.fork('b');
    expect(seq(p2, 5)).toEqual(before);
  });

  it('clone 完全独立，改克隆不影响本体', () => {
    const a = new Rng(44);
    const b = a.clone();
    seq(b, 10);
    expect(seq(a, 3)).toEqual(seq(new Rng(44), 3));
  });

  it('hashString 稳定且区分大小写', () => {
    expect(hashString('loot')).toBe(hashString('loot'));
    expect(hashString('loot')).not.toBe(hashString('Loot'));
    expect(hashString('')).toBe(hashString(''));
  });

  it('10000 次 float 不出现 0 和 1 之外的越界值', () => {
    const r = new Rng(2025);
    for (let i = 0; i < 10000; i++) {
      const v = r.float();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
