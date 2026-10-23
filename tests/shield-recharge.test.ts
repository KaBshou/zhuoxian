import { describe, expect, it } from 'vitest';

import {
  SHIELD_RECHARGE_DELAY,
  SHIELD_RECHARGE_DIVISOR,
  SHIELD_RECHARGE_LIFE_RATIO,
  createBattle,
  createPlayerBattle,
  shieldRechargeRate,
  spawnMonster,
  tickBattle,
} from '../src/core/battle';
import { getMonster } from '../src/data/monsters';
import { Rng } from '../src/core/rng';
import { createTurbid } from '../src/core/turbid';

/**
 * 罡气回充（D103 / BALANCE §5.10）。
 *
 * 这一族断言的教训来自项目的第 6 次「死属性」：`castSpeed`（面板有、冷却写死）、
 * `xpGain`（有定义无消费方）、`厚皮`（通道死链）、判据读快照、跨帧测量 ——
 * 所以这里每条都不只测「函数返回什么」，而是测**战斗循环里真的会回**。
 */

function makePlayer(overrides: Partial<Parameters<typeof createPlayerBattle>[0]> = {}) {
  return createPlayerBattle({
    maxHp: 1000,
    shield: 200,
    level: 1,
    armor: 0,
    damage: 1,
    attackSpeed: 1,
    critChance: 0,
    ...overrides,
  });
}

function battleWith(p = makePlayer()) {
  return createBattle(p, createTurbid(), undefined);
}

/** 以 0.1 秒为步长推进 total 秒 */
function advance(state: ReturnType<typeof battleWith>, total: number, rng = new Rng(1)) {
  const steps = Math.round(total / 0.1);
  for (let i = 0; i < steps; i++) tickBattle(state, 0.1, rng);
}

describe('护盾回充：参数', () => {
  it('速率 = min(上限/4, 5% 气血) —— 双钳制', () => {
    // 护盾小、气血大：被第一把钳子（上限/4）卡住
    expect(shieldRechargeRate(200, 1000)).toBeCloseTo(50, 6);
    // 护盾大、气血小：被第二把钳子（5% 气血）卡住
    expect(shieldRechargeRate(4000, 300)).toBeCloseTo(15, 6);
    expect(shieldRechargeRate(200, 1000)).toBeCloseTo(200 / SHIELD_RECHARGE_DIVISOR, 6);
    expect(shieldRechargeRate(400, 300)).toBeCloseTo(SHIELD_RECHARGE_LIFE_RATIO * 300, 6);
  });

  it('脏输入安静归零，不产生 NaN', () => {
    expect(shieldRechargeRate(Number.NaN, 1000)).toBe(0);
    expect(shieldRechargeRate(-50, 1000)).toBe(0);
    expect(shieldRechargeRate(200, Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('延迟是 3 秒（不是 4 秒）—— 4 秒落在波末无伤窗口（≈3.4s）之外，功能等于不存在', () => {
    expect(SHIELD_RECHARGE_DELAY).toBe(3);
  });
});

describe('护盾回充：战斗循环里真的会回', () => {
  it('脱战不满 3 秒一点都不回', () => {
    const p = makePlayer();
    p.shield = 0;
    const st = battleWith(p);
    advance(st, 2.8);
    expect(p.shield).toBe(0);
    expect(p.shieldIdle).toBeGreaterThan(2.7);
    expect(p.shieldIdle).toBeLessThan(SHIELD_RECHARGE_DELAY);
  });

  it('过了 3 秒开始按速率回，且随时间线性涨', () => {
    const p = makePlayer();
    p.shield = 0;
    const st = battleWith(p);
    advance(st, 3.0); // 刚好到门槛
    const atGate = p.shield;
    advance(st, 1.0); // 再 1 秒 → 应回一个速率（50）
    expect(p.shield - atGate).toBeCloseTo(50, 1);
  });

  it('只补到上限，不过顶', () => {
    const p = makePlayer();
    p.shield = 0;
    const st = battleWith(p);
    advance(st, 30);
    expect(p.shield).toBe(p.shieldMax);
    expect(p.shield).toBe(200);
  });

  it('上限为 0 时完全不回（没有护盾属性的人不该凭空长护盾）', () => {
    const p = makePlayer({ shield: 0 });
    p.shield = 0;
    const st = battleWith(p);
    advance(st, 30);
    expect(p.shieldMax).toBe(0);
    expect(p.shield).toBe(0);
  });

  it('不吃 lifeRegen：气血回复不作用于护盾', () => {
    const p = makePlayer({ lifeRegen: 100 });
    p.shield = 0;
    p.hp = 500;
    const st = battleWith(p);
    advance(st, 2.0); // 未到回充延迟
    expect(p.shield).toBe(0);
    expect(p.hp).toBeGreaterThan(500); // 气血自己在回
  });
});

describe('护盾回充：受击只打断计时，不扣已有护盾', () => {
  it('挨打后 shieldIdle 清零，护盾只因吸收减少、不会额外被扣', () => {
    const p = makePlayer();
    p.shield = 200;
    const st = battleWith(p);
    // 把怪放在玩家身前（攻击距离内），让它必然打到
    const def = getMonster('fangshi-yuanke');
    if (!def) throw new Error('数据表里找不到 fangshi-yuanke');
    st.monsters.push(spawnMonster(def, 1, 1, p.x + 8, p.y));
    const before = p.shield;
    const rng = new Rng(7);
    let hitSeen = false;
    for (let i = 0; i < 400 && !hitSeen; i++) {
      tickBattle(st, 0.1, rng);
      if (p.shieldIdle === 0 && p.shield < before) hitSeen = true;
    }
    expect(hitSeen).toBe(true);
    // 受击那一刻计时清零（回充被打断）
    expect(p.shieldIdle).toBe(0);
    // 护盾没有被「重置」到 0，也没有被扣超过吸收量（这里只断言「没被清零」这个核心语义）
    expect(p.shield).toBeGreaterThan(0);
  });

  it('回充到一半挨一下，之后必须重新等满 3 秒才继续回', () => {
    const p = makePlayer();
    p.shield = 0;
    const st = battleWith(p);
    advance(st, 4.0); // 回了一部分
    const partial = p.shield;
    expect(partial).toBeGreaterThan(0);
    // 直接把计时清零，模拟「刚刚挨了一下」（damagePlayer 里的那一行）
    p.shieldIdle = 0;
    advance(st, 2.9);
    expect(p.shield).toBe(partial); // 2.9 秒内不再增长
    advance(st, 0.5);
    expect(p.shield).toBeGreaterThan(partial);
  });
});

// ── D105 生存性度量：四个运行时计数 ──
// 它们不进存档，但**必须有测试**：这四个数是「护盾到底活没活」与「离死亡多远」的唯一证据，
// 如果它们恒为 0，度量工具会输出「零受伤」，而我们没有任何东西能区分
// 「玩家真的没挨打」和「计数器根本没接上」——那正是死属性那一族的形态。
describe('D105 度量计数器', () => {
  it('护盾吸收会累计到 shieldAbsorbed，且与实际扣掉的护盾相等', () => {
    const p = makePlayer();
    const st = battleWith(p);
    expect(st.shieldAbsorbed).toBe(0);
    const def = getMonster('fangshi-yuanke');
    if (!def) throw new Error('数据表里找不到 fangshi-yuanke');
    st.monsters.push(spawnMonster(def, 1, 1, p.x + 8, p.y));
    const rng = new Rng(11);
    let absorbed = 0;
    for (let i = 0; i < 400 && st.shieldAbsorbed === 0; i++) {
      const before = p.shield;
      tickBattle(st, 0.1, rng);
      absorbed += Math.max(0, before - p.shield);
    }
    expect(st.shieldAbsorbed).toBeGreaterThan(0);
    // 回充可能在同一帧补回来，所以只断言「不小于净减少量」（吸收是事件量，净值会被回充抵消）
    expect(st.shieldAbsorbed).toBeGreaterThanOrEqual(Math.max(0, absorbed - 1));
  });

  it('shieldRecharges 数的是「段」不是帧：打满一次只 +1，被打断后再回充才 +1', () => {
    const p = makePlayer();
    p.shield = 0;
    const st = battleWith(p);
    expect(st.shieldRecharges).toBe(0);
    advance(st, 8);
    expect(st.shieldRecharges).toBe(1);
    // 挨一下打断（damagePlayer 里会置 shieldRecharging = false）
    const def = getMonster('fangshi-yuanke');
    if (!def) throw new Error('数据表里找不到 fangshi-yuanke');
    p.shield = 0;
    p.shieldIdle = 0;
    st.shieldRecharging = false;
    advance(st, 8);
    expect(st.shieldRecharges).toBe(2);
  });

  it('maxHit 记录单次最大入伤；incomingMul 默认不出现在线上状态里', () => {
    const p = makePlayer();
    const st = battleWith(p);
    expect(st.maxHit).toBe(0);
    expect(st.incomingMul).toBeUndefined(); // 玩法路径永远不设它
    const def = getMonster('fangshi-yuanke');
    if (!def) throw new Error('数据表里找不到 fangshi-yuanke');
    st.monsters.push(spawnMonster(def, 1, 1, p.x + 8, p.y));
    const rng = new Rng(13);
    for (let i = 0; i < 400 && st.maxHit === 0; i++) tickBattle(st, 0.1, rng);
    expect(st.maxHit).toBeGreaterThan(0);
  });

  it('incomingMul = 2 会让单次入伤翻倍（K 值扫描就是靠它）', () => {
    const hitOnce = (mul?: number) => {
      const p = makePlayer();
      const st = battleWith(p);
      if (mul !== undefined) st.incomingMul = mul;
      const def = getMonster('fangshi-yuanke');
      if (!def) throw new Error('数据表里找不到 fangshi-yuanke');
      st.monsters.push(spawnMonster(def, 1, 1, p.x + 8, p.y));
      const rng = new Rng(13);
      for (let i = 0; i < 400 && st.maxHit === 0; i++) tickBattle(st, 0.1, rng);
      return st.maxHit;
    };
    const a = hitOnce();
    const b = hitOnce(2);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a * 1.6);
  });
});