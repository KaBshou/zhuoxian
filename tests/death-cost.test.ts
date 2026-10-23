import { describe, expect, it } from 'vitest';

import { ESCAPE_VALVE_DEATHS, createSession, setFloor, tickSession } from '../src/core/session';
import { spawnMonster } from '../src/core/battle';
import { getMonster } from '../src/data/monsters';
import { AFFIXES } from '../src/data/affixes';
import { ITEM_BASES } from '../src/data/bases';

/**
 * D110 / D113 死亡代价与逃生阀。
 *
 * 这两条是**唯一会让层号倒退**的规则，也是「死亡是不是惩罚」的唯一证据。
 * 背景：D110 之前 42 次死亡对满级时长的影响是 0.6%（测不出来）；
 * 「层不降」保住了心理成本，但制造了死锁（实测某种子死 160 次）—— 逃生阀是那个死锁的出口。
 *
 * 测试坑：`MonsterInPlay` 的 `damage/attackInterval` 是 `readonly` ⇒ 不能就地改，
 * 必须用**展开出一个新对象**替换数组元素（`{...m, damage: 1e6}`）。
 */
const TABLES = { bases: ITEM_BASES, affixes: AFFIXES };

function freshAt(floor: number) {
  const s = createSession({ classId: 'yujian', seed: 99, tables: TABLES });
  s.maxFloorReached = Math.max(s.maxFloorReached, floor);
  // setFloor 对「已经在的那一层」会拒绝（D36-B 的越界/同层语义），层 1 开局就在，直接返回
  if (s.floor !== floor && !setFloor(s, floor)) throw new Error(`setFloor(${floor}) 被拒绝`);
  return s;
}

/** 让玩家在下一帧必死：把怪摆到玩家身上、伤害拉满、出手间隔压到几乎为 0。 */
function killPlayerOnce(s: ReturnType<typeof freshAt>) {
  const def = getMonster('fangshi-yuanke');
  if (!def) throw new Error('数据表里找不到 fangshi-yuanke');
  const base = spawnMonster(def, s.floor, 90001, s.battle.player.x, s.battle.player.y, 'normal', []);
  s.battle.monsters.push({ ...base, damage: 999999, attackInterval: 0.01, cooldown: 0 });
  s.battle.player.hp = 1;
  for (let i = 0; i < 90; i += 1) tickSession(s, 1 / 60);
  return s;
}

describe('逃生阀（D113）', () => {
  it('阈值是 3（1~2 次仍按「本层回第 1 波」处理）', () => {
    expect(ESCAPE_VALVE_DEATHS).toBe(3);
  });

  it('单次死亡：层不变、波次回到前面、死亡计数 +1', () => {
    const s = freshAt(30);
    s.battle.player.hp = s.battle.player.maxHp;
    killPlayerOnce(s);
    expect(s.deaths).toBeGreaterThanOrEqual(1);
    expect(s.floor).toBe(30);
    expect(s.wave).toBeLessThanOrEqual(3);
  });

  it('同层连死到阈值：自动退回 1 层，且本层死亡计数清零', () => {
    const s = freshAt(30);
    s.floorDeaths = ESCAPE_VALVE_DEATHS - 1; // 前两次死亡已经发生
    killPlayerOnce(s);
    expect(s.floor).toBe(29);
    expect(s.floorDeaths).toBe(0);
  });

  it('层 1 无处可退：仍按「回第 1 波」处理，不会退到 0 层', () => {
    const s = freshAt(1);
    s.floorDeaths = ESCAPE_VALVE_DEATHS - 1;
    killPlayerOnce(s);
    expect(s.floor).toBe(1);
  });

  it('退层不改变「到过最高层」（maxFloorReached 只增不减）', () => {
    const s = freshAt(30);
    const before = s.maxFloorReached;
    s.floorDeaths = ESCAPE_VALVE_DEATHS - 1;
    killPlayerOnce(s);
    expect(s.maxFloorReached).toBe(before);
  });
});
