import { describe, expect, it } from 'vitest';

import {
  ASCENDANCY_TERM,
  CLASS_TERM,
  FLOOR_BOSS_TERM,
  FLOOR_TERM,
  RARITY_TERM,
  REALM_STAGE_TERM,
  REALM_TERM,
  TERM,
  formatRealm,
} from '../src/data/glossary';

describe('术语表 glossary', () => {
  it('九层魔渊的层名与镇守一一对应', () => {
    expect(FLOOR_TERM).toHaveLength(9);
    expect(FLOOR_BOSS_TERM).toHaveLength(9);
    expect(FLOOR_TERM[0]).toBe('废弃坊市');
    expect(FLOOR_TERM[8]).toBe('渡劫台');
    expect(FLOOR_BOSS_TERM[8]).toBe('玄冥');
  });

  it('九境界 × 九重 = 81 个台阶', () => {
    expect(REALM_TERM).toHaveLength(9);
    expect(REALM_STAGE_TERM).toHaveLength(9);
    expect(REALM_TERM[0]).toBe('练气');
    expect(REALM_TERM[8]).toBe('渡劫');
  });

  it('formatRealm 把台阶序号转成「境界·重」', () => {
    expect(formatRealm(0)).toBe('练气·一重');
    expect(formatRealm(1)).toBe('练气·二重');
    expect(formatRealm(8)).toBe('练气·九重');
    expect(formatRealm(9)).toBe('筑基·一重');
    expect(formatRealm(20)).toBe('金丹·三重');
    expect(formatRealm(80)).toBe('渡劫·九重');
  });

  it('formatRealm 越界时夹到合法范围，不返回 undefined', () => {
    expect(formatRealm(-5)).toBe('练气·一重');
    expect(formatRealm(999)).toBe('渡劫·九重');
    expect(formatRealm(Number.NaN)).toBe('练气·一重');
  });

  it('六大道统留位，第一版只开前三个', () => {
    expect(CLASS_TERM).toHaveLength(6);
    expect(CLASS_TERM.slice(0, 3)).toEqual(['御剑堂', '御兽堂', '焚炎堂']);
  });

  it('浊气觉醒至少覆盖每个道统', () => {
    expect(ASCENDANCY_TERM.length).toBeGreaterThanOrEqual(6);
    expect(ASCENDANCY_TERM[0]).toBe('浊剑');
  });

  it('四个品阶都有修仙名', () => {
    expect(RARITY_TERM.fan).toBe('凡品');
    expect(RARITY_TERM.ling).toBe('灵品');
    expect(RARITY_TERM.bao).toBe('宝品');
    expect(RARITY_TERM.xian).toBe('仙品');
  });

  it('核心资源都用修仙话术，没有残留「生命值 / 法力值」', () => {
    expect(TERM.life).toBe('气血');
    expect(TERM.mana).toBe('真元');
    expect(TERM.shield).toBe('护体罡气');
    const all = Object.values(TERM).join('');
    expect(all).not.toContain('生命值');
    expect(all).not.toContain('法力值');
    expect(all).not.toContain('经验值');
  });

  it('每个术语都非空', () => {
    for (const [k, v] of Object.entries(TERM)) {
      expect(typeof v, k).toBe('string');
      expect(v.length, k).toBeGreaterThan(0);
    }
  });
});
