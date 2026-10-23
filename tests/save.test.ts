import { describe, expect, it } from 'vitest';
import { createCharacter } from '../src/core/character';
import { serialize, deserialize, SAVE_VERSION } from '../src/core/save';
import { startingSword } from '../src/core/character';
import { Rng } from '../src/core/rng';
import { rollLoot } from '../src/core/loot';
import { ITEM_BASES } from '../src/data/bases';
import { AFFIXES } from '../src/data/affixes';
import type { Item } from '../src/core/item';

const ch = () => createCharacter('yujian');

const makeItem = (seed: number, ilvl = 15): Item => {
  const rng = new Rng(seed);
  return rollLoot(rng, ITEM_BASES, AFFIXES, { ilvl }).item;
};

const input = (items: Item[] = []) => ({
  character: ch(),
  bag: items,
  floor: 5,
  wave: 3,
  firstClearedFloors: [1, 2, 3, 4],
  pocket: { huang: 7, mie: 2, xi: 1 },
  gemPouch: { mengong: 3, kaopi: 1 },
  rngState: { seed: 123456, count: 999 },
});

describe('存档契约（serialize / deserialize）', () => {
  it('round-trip：玩家/背包/进度/经济/rng 全部还原', () => {
    const item = makeItem(7);
    const s = serialize(input([item]));
    const back = deserialize(JSON.parse(JSON.stringify(s)));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.state.version).toBe(SAVE_VERSION);
    expect(back.state.player.classId).toBe('yujian');
    expect(back.state.player.step).toBe(0);
    expect(back.state.player.bag.length).toBe(1);
    expect(back.state.player.bag[0].uid).toBe(item.uid);
    expect(back.state.player.bag[0].affixes.length).toBe(item.affixes.length);
    expect(back.state.progress.floor).toBe(5);
    expect(back.state.progress.wave).toBe(3);
    expect(back.state.progress.firstClearedFloors).toEqual([1, 2, 3, 4]);
    expect(back.state.economy.pocket).toEqual({ huang: 7, mie: 2, xi: 1 });
    expect(back.state.economy.gemPouch).toEqual({ mengong: 3, kaopi: 1 });
    expect(back.state.rngState).toEqual({ seed: 123456, count: 999 });
  });

  it('派生值不入档（铁律 1）：存档里没有修为门槛/面板/战力', () => {
    const s = serialize(input());
    const text = JSON.stringify(s);
    expect(text).not.toContain('xpNext');
    expect(text).not.toContain('derived');
    expect(text).not.toContain('power');
  });

  it('装备坑还原（含起始铁剑）', () => {
    const s = serialize(input());
    const back = deserialize(s);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    const sword = back.state.player.equipment['sword'];
    expect(sword?.name).toBe(startingSword().name);
    expect(sword?.rarity).toBe('fan');
  });

  it('版本不符 → wrong-version（拒绝，不猜）', () => {
    const s = serialize(input());
    const back = deserialize({ ...s, version: SAVE_VERSION + 1 });
    expect(back.ok).toBe(false);
    if (back.ok) return;
    expect(back.error).toBe('wrong-version');
  });

  it('形状坏 → bad-shape（缺 player/rngState/负数 step）', () => {
    expect(deserialize(null).ok).toBe(false);
    expect(deserialize({}).ok).toBe(false);
    const s = serialize(input()) as unknown as Record<string, unknown>;
    const noRng = { ...s };
    delete noRng.rngState;
    const r = deserialize(noRng);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('bad-shape');
    const neg = deserialize({ ...s, player: { ...(s.player as object), step: -5 } });
    // 负 step 不是形状错，是值错 → clamp 到 0（老档脏数据宽容策略）
    expect(neg.ok).toBe(true);
  });

  it('rngState 回填 → 同种子同结果可继续（离线重放的前提）', () => {
    const rng1 = new Rng(42);
    for (let i = 0; i < 100; i++) rng1.float(0, 1);
    const saved = rng1.state;
    // 存进档再读回来
    const s = serialize({ ...input(), rngState: saved });
    const back = deserialize(s);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    const rng2 = new Rng(42);
    rng2.state = back.state.rngState;
    // 续上之后两条序列完全一致
    expect(rng2.float(0, 1)).toBe(rng1.float(0, 1));
    expect(rng2.float(0, 1)).toBe(rng1.float(0, 1));
  });

  it('序列化是深拷贝：改原对象不影响已生成的存档', () => {
    const inp = input([makeItem(9)]);
    const s = serialize(inp);
    (inp.bag[0] as { uid: string }).uid = 'tampered';
    expect(s.player.bag[0].uid).not.toBe('tampered');
  });
});
