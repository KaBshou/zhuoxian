import { describe, expect, it } from 'vitest';

import {
  ALL_MONSTERS,
  BASE_MONSTER_DAMAGE,
  BASE_MONSTER_HP,
  BOSSES,
  BOSS_DMG_MUL,
  BOSS_HP_MUL,
  FLOOR_DAMAGE_MUL,
  FLOOR_HP_MUL,
  MONSTERS,
  bossOfTier,
  getMonster,
  monstersOfTier,
  scaleOfFloor,
  validateMonsters,
} from '../src/data/monsters';
import {
  BATTLE_H,
  BATTLE_W,
  TURBID_PER_HIT,
  TURBID_PER_KILL,
  aliveCount,
  createBattle,
  createPlayerBattle,
  hpRatio,
  isBattleSane,
  isCleared,
  nearestInRange,
  spawnMonster,
  spawnRing,
  tickBattle,
} from '../src/core/battle';
import { Rng } from '../src/core/rng';
import { createTurbid } from '../src/core/turbid';

/** 一个强到能秒怪、又不太会死的测试玩家 */
function strongPlayer(overrides: Partial<Parameters<typeof createPlayerBattle>[0]> = {}) {
  return createPlayerBattle({
    maxHp: 5000,
    level: 20,
    armor: 200,
    damage: 500,
    attackSpeed: 2,
    critChance: 0,
    range: 200,
    ...overrides,
  });
}

/** 一个只会挨打的测试玩家 */
function tankPlayer() {
  return createPlayerBattle({
    maxHp: 99999,
    level: 50,
    armor: 5000,
    damage: 1,
    attackSpeed: 0.1,
    critChance: 0,
    range: 1,
  });
}

describe('浊物数据表 monsters', () => {
  it('全表通过校验', () => {
    expect(validateMonsters(ALL_MONSTERS)).toEqual([]);
  });

  it('18 只普通怪 + 3 只镇守（D145：每阶 +2 只）', () => {
    expect(MONSTERS).toHaveLength(18);
    expect(BOSSES).toHaveLength(3);
  });

  it('每一阶都有普通怪和镇守', () => {
    for (const t of [1, 2, 3] as const) {
      expect(monstersOfTier(t).length, `tier ${t}`).toBeGreaterThan(0);
      expect(bossOfTier(t), `tier ${t}`).toBeDefined();
    }
  });

  it('镇守比同阶普通怪硬得多（不然没有"关口"的感觉）', () => {
    for (const t of [1, 2, 3] as const) {
      const boss = bossOfTier(t)!;
      const maxNormalHp = Math.max(...monstersOfTier(t).map((m) => m.hpMul));
      expect(boss.hpMul, `tier ${t}`).toBeGreaterThan(maxNormalHp);
      expect(boss.boss).toBe(true);
    }
  });

  it('镇守 = 同层普通浊物 ×25 血 ×1.5 攻（BALANCE v2 §11.2）', () => {
    // v4.1 定稿：×25 血不变，攻伐 ×1.2（v2 是 ×1.5，v4.1 因层 27 镇守战 99.1% 入伤再降），
    // 难度从「抗伤」转「限时 DPS 检查」。旧的 ×4 在 15 层会一击打掉 60%+ 气血。
    for (const t of [1, 2, 3] as const) {
      const boss = bossOfTier(t)!;
      expect(boss.hpMul, `tier ${t} hp`).toBe(BOSS_HP_MUL);
      expect(boss.hpMul, `tier ${t} hp val`).toBe(25);
      expect(boss.dmgMul, `tier ${t} dmg`).toBe(BOSS_DMG_MUL);
      expect(boss.dmgMul, `tier ${t} dmg val`).toBe(1.2);
    }
  });

  it('id 全局唯一，能按 id 查回来', () => {
    const ids = ALL_MONSTERS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(getMonster('fangshi-yuanke')?.name).toBe('坊市怨客');
    expect(getMonster('nope')).toBeUndefined();
  });

  it('每个五行属性至少有一只怪用到（否则那个抗性词缀永远没用）', () => {
    const elements = new Set(ALL_MONSTERS.map((m) => m.element));
    for (const e of ['metal', 'wood', 'water', 'fire', 'earth']) {
      expect(elements.has(e as never), e).toBe(true);
    }
  });

  it('validateMonsters 抓得出重复 id、非法数值、缺属性', () => {
    const bad = [
      ...MONSTERS.slice(0, 3),
      { ...MONSTERS[0], hpMul: 0 },
      { ...MONSTERS[1], attackInterval: -1 },
      { ...MONSTERS[2], resist: { resMetal: 5 } },
    ];
    const problems = validateMonsters(bad);
    expect(problems.some((p) => p.includes('重复'))).toBe(true);
    expect(problems.some((p) => p.includes('hpMul'))).toBe(true); // 血量倍率
    expect(problems.some((p) => p.includes('攻击间隔'))).toBe(true);
    expect(problems.some((p) => p.includes('超过 100%'))).toBe(true);
  });

  it('层数成长：1 层不放大，之后按 1.1534 / 1.14 复合（BALANCE v2）', () => {
    expect(scaleOfFloor(1)).toEqual({ hp: 1, damage: 1 });
    expect(scaleOfFloor(2).hp).toBeCloseTo(FLOOR_HP_MUL, 6);
    expect(scaleOfFloor(3).hp).toBeCloseTo(FLOOR_HP_MUL * FLOOR_HP_MUL, 6);
    expect(scaleOfFloor(3).damage).toBeCloseTo(
      FLOOR_DAMAGE_MUL * FLOOR_DAMAGE_MUL,
      6,
    );
  });

  it('血量倍率必须大于攻伐倍率（越刷越安全，挂机不死的根基）', () => {
    // 这条不变量的意义：如果攻击也按血量同速涨，玩家会在装备跟上之前先被秒，
    // 关卡变成"卡住"而不是"变强"。BALANCE v2 §2：血 1.1534/层 > 攻 1.14/层（供给 40.85× 摊 26 区间）。
    for (const floor of [2, 5, 10, 30]) {
      const s = scaleOfFloor(floor);
      expect(s.hp, `floor ${floor}`).toBeGreaterThan(s.damage);
    }
    const s1 = scaleOfFloor(1);
    expect(s1.hp).toBe(s1.damage); // 1 层两者都是 1，不放大
  });

  it('scaleOfFloor 容错：NaN / 0 / 负数都当 1 层', () => {
    expect(scaleOfFloor(Number.NaN)).toEqual({ hp: 1, damage: 1 });
    expect(scaleOfFloor(0)).toEqual({ hp: 1, damage: 1 });
    expect(scaleOfFloor(-5)).toEqual({ hp: 1, damage: 1 });
  });
});

describe('战斗组装 battle setup', () => {
  it('玩家初始满血', () => {
    const p = strongPlayer();
    expect(p.hp).toBe(p.maxHp);
    expect(p.x).toBe(BATTLE_W / 2);
    expect(p.y).toBe(BATTLE_H / 2);
  });

  it('非法输入被兜住，不产生 NaN', () => {
    const p = createPlayerBattle({
      maxHp: Number.NaN,
      level: -3,
      armor: -10,
      damage: Number.NaN,
      attackSpeed: 0,
      critChance: 5,
    });
    expect(Number.isFinite(p.hp)).toBe(true);
    expect(p.maxHp).toBeGreaterThan(0);
    expect(p.level).toBe(1);
    expect(p.armor).toBe(0);
    expect(p.attackSpeed).toBeGreaterThan(0);
    expect(p.critChance).toBeLessThanOrEqual(1);
  });

  it('spawnMonster 按层放大血和攻击（层 1 = 基准，v4 归一）', () => {
    const def = getMonster('fangshi-yuanke')!;
    const a = spawnMonster(def, 1, 1, 0, 0);
    // v4：层 1~5 怪伤 0.8~1.2 全被 MIN_DAMAGE=1 地板压平，层间成长断言用层 12（0.8×1.09^11 = 2.11）
    const c = spawnMonster(def, 12, 2, 0, 0);
    expect(a.maxHp).toBe(Math.round(BASE_MONSTER_HP * def.hpMul));
    // v4: BASE_MONSTER_DAMAGE=1.0 × dmgMul 0.8 = 0.8，但 spawnMonster 有 Math.max(1,…) 地板，实际是 1
    expect(a.damage).toBeCloseTo(Math.max(1, BASE_MONSTER_DAMAGE * def.dmgMul), 6);
    expect(a.xp).toBe(2 * 1); // 每杀修为 = XP_PER_KILL_PER_FLOOR × 层
    expect(c.maxHp).toBeGreaterThan(a.maxHp);
    expect(c.damage).toBeGreaterThan(a.damage);
    expect(c.hp).toBe(c.maxHp);
  });

  it('镇守自动获得 boss 稀有度', () => {
    const boss = getMonster('boss-xuanming')!;
    expect(spawnMonster(boss, 3, 1, 0, 0).rarity).toBe('boss');
  });

  it('spawnRing 撒在边缘，不会贴脸生成', () => {
    const rng = new Rng(7);
    const list = spawnRing(monstersOfTier(1), 1, 6, rng, 100);
    expect(list).toHaveLength(6);
    for (const m of list) {
      const d = Math.hypot(m.x - BATTLE_W / 2, m.y - BATTLE_H / 2);
      expect(d, m.name).toBeGreaterThan(100);
      expect(m.x).toBeGreaterThanOrEqual(20);
      expect(m.x).toBeLessThanOrEqual(BATTLE_W - 20);
      expect(m.x).toBeGreaterThanOrEqual(20);
    }
  });

  it('spawnRing 数量为 0 时返回空', () => {
    expect(spawnRing(monstersOfTier(1), 1, 0, new Rng(1), 0)).toHaveLength(0);
  });
});

describe('战斗推进 tickBattle', () => {
  it('没有怪的时候只是时间流逝，不出事', () => {
    const s = createBattle(strongPlayer(), createTurbid());
    const rng = new Rng(1);
    for (let i = 0; i < 600; i++) tickBattle(s, 1 / 60, rng);
    expect(s.time).toBeCloseTo(10, 2);
    expect(s.kills).toBe(0);
    expect(isBattleSane(s)).toBe(true);
    expect(isCleared(s)).toBe(true);
  });

  it('dt 为 0 / 负数 / NaN 什么都不做', () => {
    const s = createBattle(strongPlayer(), createTurbid());
    const before = s.time;
    const rng = new Rng(1);
    tickBattle(s, 0, rng);
    tickBattle(s, -1, rng);
    tickBattle(s, Number.NaN, rng);
    expect(s.time).toBe(before);
  });

  it('单帧最多推进 0.25 秒（防止切标签页回来一帧跳过整场战斗）', () => {
    const s = createBattle(strongPlayer(), createTurbid());
    tickBattle(s, 5, new Rng(1));
    expect(s.time).toBeLessThanOrEqual(0.25);
  });

  it('怪会朝玩家走，并停在攻击距离之外', () => {
    const def = getMonster('fangshi-yuanke')!;
    const s = createBattle(strongPlayer({ damage: 0.0001, range: 1 }), createTurbid());
    s.monsters = [spawnMonster(def, 1, 1, 100, 100)];
    const rng = new Rng(1);
    const startDist = Math.hypot(100 - BATTLE_W / 2, 100 - BATTLE_H / 2);
    for (let i = 0; i < 1200; i++) tickBattle(s, 1 / 60, rng);
    const m = s.monsters[0]!;
    const endDist = Math.hypot(m.x - BATTLE_W / 2, m.y - BATTLE_H / 2);
    expect(endDist).toBeLessThan(startDist);
    expect(endDist).toBeGreaterThanOrEqual(m.attackRange - 2);
  });

  it('玩家能打死怪，并且记击杀数、加修为、加浊气', () => {
    const def = getMonster('fangshi-yuanke')!;
    const s = createBattle(strongPlayer(), createTurbid());
    s.monsters = [spawnMonster(def, 1, 1, BATTLE_W / 2 + 50, BATTLE_H / 2)];
    const rng = new Rng(3);
    let guard = 0;
    while (s.monsters.length > 0 && guard++ < 600) tickBattle(s, 1 / 60, rng);
    expect(s.kills).toBe(1);
    expect(s.xpGained).toBe(2); // 每杀修为 = 2 × 层 1
    expect(s.turbid.value).toBeGreaterThan(0);
    expect(isBattleSane(s)).toBe(true);
  });

  it('击杀给的浊气比普通命中多', () => {
    expect(TURBID_PER_KILL).toBeGreaterThan(TURBID_PER_HIT);
  });

  it('怪能打掉玩家的血，不会掉成负数', () => {
    const def = getMonster('duoxiu-zu')!;
    const s = createBattle(tankPlayer(), createTurbid());
    s.monsters = [spawnMonster(def, 3, 1, BATTLE_W / 2 + 30, BATTLE_H / 2)];
    const rng = new Rng(5);
    const before = s.player.hp;
    for (let i = 0; i < 300; i++) tickBattle(s, 1 / 60, rng);
    expect(s.player.hp).toBeLessThan(before);
    expect(s.player.hp).toBeGreaterThanOrEqual(0);
  });

  it('玩家死了会进复活冷却、标记 deathCleanup、不刷屏', () => {
    const def = getMonster('boss-xuanming')!;
    const s = createBattle(
      createPlayerBattle({
        maxHp: 30,
        level: 1,
        armor: 0,
        damage: 0.001,
        attackSpeed: 0.1,
        critChance: 0,
        range: 1,
      }),
      createTurbid(),
    );
    s.monsters = [spawnMonster(def, 3, 1, BATTLE_W / 2 + 20, BATTLE_H / 2)];
    const rng = new Rng(11);
    let guard = 0;
    // v4：镇守出手间隔 5s（BOSS_ATTACK_INTERVAL），2000 帧=33s 只够挨 7 发打不死 30 血，放大到 20000 帧
    while (s.deaths === 0 && guard++ < 20000) tickBattle(s, 1 / 60, rng);
    expect(s.deaths).toBe(1);
    expect(s.reviveCooldown).toBeGreaterThan(0);
    // 死亡不再直接清怪（那是"死得越多推进越快"的旧 bug）：
    // 只打 deathCleanup 标记，清不清场由上层（session）决定
    expect(s.deathCleanup).toBe(true);
    expect(s.floorDeaths).toBe(1);
  });

  it('复活之后回满血，可以继续打', () => {
    const s = createBattle(
      createPlayerBattle({ maxHp: 10, level: 1, armor: 0, damage: 1, attackSpeed: 1, critChance: 0, range: 1 }),
      createTurbid(),
    );
    const rng = new Rng(2);
    s.player.hp = 1;
    s.deaths = 0;
    s.reviveCooldown = 0.5;
    s.monsters = [];
    for (let i = 0; i < 120; i++) tickBattle(s, 1 / 60, rng);
    expect(s.player.hp).toBe(s.player.maxHp);
    expect(s.reviveCooldown).toBe(0);
  });

  it('浊气沸腾时伤害更高（浊气真的接进管线了）', () => {
    const def = getMonster('beiyou-zhe')!;
    const make = (turbidValue: number) => {
      const t = createTurbid();
      t.value = turbidValue;
      const s = createBattle(strongPlayer({ damage: 100, critChance: 0 }), t);
      // ⚠️ 层数不能太低：判据是「同一击的伤害差」，一击秒杀会把差值钳到怪血上限，
      // 两个口径都变成「满血」，比值退化成 1.0。v4.6 D30 把三阶 hpMul ×0.7 之后，
      // 层 3 的碑守影只剩 79 血（一击 73.5 / 沸腾 110 都会打穿），所以挪到层 12（≈285 血）。
      s.monsters = [spawnMonster(def, 12, 1, BATTLE_W / 2 + 40, BATTLE_H / 2)];
      const rng = new Rng(42);
      const before = s.monsters[0]!.hp;
      tickBattle(s, 1 / 60, rng);
      return before - s.monsters[0]!.hp;
    };
    // 同一个种子 → 同一 roll，唯一差别就是浊气
    const calm = make(0);
    const hot = make(100);
    expect(hot).toBeGreaterThan(calm);
    expect(hot / calm).toBeGreaterThan(1.3);
  });

  it('虚弱期受到的伤害更高（浊化有代价）', () => {
    const def = getMonster('duoxiu-zu')!;
    const make = (weak: boolean) => {
      const t = createTurbid();
      if (weak) {
        t.value = 100;
        t.phase = 'weak';
        t.phaseLeft = 4;
      }
      const s = createBattle(tankPlayer(), t);
      // v4：层 3 怪伤 1.13 被 MIN_DAMAGE 地板压成 1，虚弱 ×1.3 round 后仍是 1，断言失真。
      // 层 18 怪伤 4.45，×1.3 = 5.8 → 6 vs 4，地板之上的真实差异。
      s.monsters = [spawnMonster(def, 18, 1, BATTLE_W / 2 + 20, BATTLE_H / 2)];
      const rng = new Rng(9);
      const before = s.player.hp;
      tickBattle(s, 1 / 60, rng);
      return before - s.player.hp;
    };
    expect(make(true)).toBeGreaterThan(make(false));
  });

  it('同种子同结果（存档与离线收益的前提）', () => {
    const run = () => {
      const s = createBattle(strongPlayer(), createTurbid());
      s.monsters = spawnRing(monstersOfTier(1), 1, 5, new Rng(4), 1);
      const rng = new Rng(1234);
      for (let i = 0; i < 900; i++) tickBattle(s, 1 / 60, rng);
      return { kills: s.kills, xp: s.xpGained, hp: Math.round(s.player.hp), turbid: Math.round(s.turbid.value) };
    };
    expect(run()).toEqual(run());
  });

  it('长跑 3 分钟数值不坏（NaN 会一路污染，必须早发现）', () => {
    const s = createBattle(strongPlayer({ maxHp: 2000, armor: 500, attackSpeed: 1.5 }), createTurbid());
    s.monsters = spawnRing(monstersOfTier(1), 1, 5, new Rng(4), 1);
    const rng = new Rng(77);
    for (let i = 0; i < 60 * 180; i++) {
      tickBattle(s, 1 / 60, rng);
      if (s.monsters.length < 3) {
        s.monsters.push(...spawnRing(monstersOfTier(1), 1, 1, rng, 1000 + i));
      }
    }
    expect(isBattleSane(s)).toBe(true);
    expect(s.kills).toBeGreaterThan(10);
    expect(s.player.hp).toBeGreaterThanOrEqual(0);
    expect(s.player.hp).toBeLessThanOrEqual(s.player.maxHp);
    expect(hpRatio(s)).toBeGreaterThanOrEqual(0);
    expect(hpRatio(s)).toBeLessThanOrEqual(1);
  });
});

describe('战斗查询', () => {
  it('nearestInRange 挑最近的那只，忽略已死的', () => {
    const def = getMonster('fangshi-yuanke')!;
    const s = createBattle(strongPlayer(), createTurbid());
    const near = spawnMonster(def, 1, 1, BATTLE_W / 2 + 30, BATTLE_H / 2);
    const far = spawnMonster(def, 1, 2, BATTLE_W / 2 + 300, BATTLE_H / 2);
    const dead = spawnMonster(def, 1, 3, BATTLE_W / 2 + 10, BATTLE_H / 2);
    dead.hp = 0;
    s.monsters = [far, near, dead];
    expect(nearestInRange(s.monsters, s.player, 200)?.uid).toBe(1);
  });

  it('射程外返回 null', () => {
    const def = getMonster('fangshi-yuanke')!;
    const s = createBattle(strongPlayer(), createTurbid());
    s.monsters = [spawnMonster(def, 1, 1, BATTLE_W / 2 + 400, BATTLE_H / 2)];
    expect(nearestInRange(s.monsters, s.player, 100)).toBeNull();
  });

  it('aliveCount / isCleared', () => {
    const def = getMonster('fangshi-yuanke')!;
    const s = createBattle(strongPlayer(), createTurbid());
    expect(isCleared(s)).toBe(true);
    s.monsters = [spawnMonster(def, 1, 1, 0, 0), spawnMonster(def, 1, 2, 0, 0)];
    expect(aliveCount(s)).toBe(2);
    expect(isCleared(s)).toBe(false);
    s.monsters[0]!.hp = 0;
    expect(aliveCount(s)).toBe(1);
  });

  it('hpRatio 封顶 0~1', () => {
    const s = createBattle(strongPlayer(), createTurbid());
    s.player.hp = s.player.maxHp * 2;
    expect(hpRatio(s)).toBe(1);
    s.player.hp = -100;
    expect(hpRatio(s)).toBe(0);
  });
});
