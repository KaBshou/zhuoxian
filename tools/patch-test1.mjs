// 一次性补丁：battle.test.ts 从「阶缩放」迁移到「层缩放」（BALANCE §3）。跑完即弃。
import fs from 'node:fs';

const p = 'tests/battle.test.ts';
let c = fs.readFileSync(p, 'utf8');
let misses = [];

function repl(old, neu, tag) {
  if (!c.includes(old)) {
    misses.push(tag);
    return;
  }
  c = c.replace(old, neu);
}

// ── imports ──
repl('  MONSTER_DAMAGE_MUL,\n', '  FLOOR_DAMAGE_MUL,\n', 'imp1');
repl('  MONSTER_HP_MUL,\n', '  FLOOR_HP_MUL,\n', 'imp2');
repl('  scaleOfTier,\n', '  scaleOfFloor,\n', 'imp3');

// ── boss vs normal ──
repl(
  'const maxNormalHp = Math.max(...monstersOfTier(t).map((m) => m.hp));',
  'const maxNormalHp = Math.max(...monstersOfTier(t).map((m) => m.hpMul));',
  'boss1',
);
repl(
  'expect(boss.hp, `tier ${t}`).toBeGreaterThan(maxNormalHp);',
  'expect(boss.hpMul, `tier ${t}`).toBeGreaterThan(maxNormalHp);',
  'boss2',
);

// ── validate bad case ──
repl('{ ...MONSTERS[0], hp: 0 },', '{ ...MONSTERS[0], hpMul: 0 },', 'bad1');

// ── 层数成长 ──
repl(
`  it('阶数成长：1 阶不放大，之后按 1.18 / 1.12 复合', () => {
    expect(scaleOfTier(1)).toEqual({ hp: 1, damage: 1 });
    expect(scaleOfTier(2).hp).toBeCloseTo(MONSTER_HP_MUL, 6);
    expect(scaleOfTier(3).hp).toBeCloseTo(MONSTER_HP_MUL * MONSTER_HP_MUL, 6);
    expect(scaleOfTier(3).damage).toBeCloseTo(
      MONSTER_DAMAGE_MUL * MONSTER_DAMAGE_MUL,
      6,
    );
  });`,
`  it('层数成长：1 层不放大，之后按 1.34 / 1.16 复合（BALANCE §3）', () => {
    expect(scaleOfFloor(1)).toEqual({ hp: 1, damage: 1 });
    expect(scaleOfFloor(2).hp).toBeCloseTo(FLOOR_HP_MUL, 6);
    expect(scaleOfFloor(3).hp).toBeCloseTo(FLOOR_HP_MUL * FLOOR_HP_MUL, 6);
    expect(scaleOfFloor(3).damage).toBeCloseTo(
      FLOOR_DAMAGE_MUL * FLOOR_DAMAGE_MUL,
      6,
    );
  });`,
  'grow',
);

repl(
`  it('怪越硬越快于越快狠（血量倍率必须大于攻击倍率）', () => {
    // 这条不变量的意义：如果攻击也按血量同速涨，玩家会在装备跟上之前先被秒，
    // 关卡变成"卡住"而不是"变强"。只要 hp 倍率 > damage 倍率就成立。
    for (const tier of [2, 5, 10, 30]) {
      const s = scaleOfTier(tier);
      expect(s.hp, \`tier \${tier}\`).toBeGreaterThan(s.damage);
    }
    const s1 = scaleOfTier(1);
    expect(s1.hp).toBe(s1.damage); // 一阶两者都是 1，不放大
  });`,
`  it('血量倍率必须大于攻伐倍率（越刷越安全，挂机不死的根基）', () => {
    // 这条不变量的意义：如果攻击也按血量同速涨，玩家会在装备跟上之前先被秒，
    // 关卡变成"卡住"而不是"变强"。BALANCE §3：血 1.34/层 > 攻 1.16/层。
    for (const floor of [2, 5, 10, 30]) {
      const s = scaleOfFloor(floor);
      expect(s.hp, \`floor \${floor}\`).toBeGreaterThan(s.damage);
    }
    const s1 = scaleOfFloor(1);
    expect(s1.hp).toBe(s1.damage); // 1 层两者都是 1，不放大
  });`,
  'grow2',
);

repl(
`  it('scaleOfTier 容错：NaN / 0 / 负数都当 1 阶', () => {
    expect(scaleOfTier(Number.NaN)).toEqual({ hp: 1, damage: 1 });
    expect(scaleOfTier(0)).toEqual({ hp: 1, damage: 1 });
    expect(scaleOfTier(-5)).toEqual({ hp: 1, damage: 1 });
  });`,
`  it('scaleOfFloor 容错：NaN / 0 / 负数都当 1 层', () => {
    expect(scaleOfFloor(Number.NaN)).toEqual({ hp: 1, damage: 1 });
    expect(scaleOfFloor(0)).toEqual({ hp: 1, damage: 1 });
    expect(scaleOfFloor(-5)).toEqual({ hp: 1, damage: 1 });
  });`,
  'grow3',
);

// ── spawnMonster ──
repl(
`  it('spawnMonster 按阶放大血和攻击', () => {
    const def = getMonster('fangshi-yuanke')!;
    const a = spawnMonster(def, 1, 1, 0, 0);
    const c = spawnMonster(def, 3, 2, 0, 0);
    expect(a.maxHp).toBe(def.hp);
    expect(c.maxHp).toBeGreaterThan(a.maxHp);
    expect(c.damage).toBeGreaterThan(a.damage);
    expect(c.hp).toBe(c.maxHp);
  });`,
`  it('spawnMonster 按层放大血和攻击（层 1 = 基准 90/3）', () => {
    const def = getMonster('fangshi-yuanke')!;
    const a = spawnMonster(def, 1, 1, 0, 0);
    const c = spawnMonster(def, 3, 2, 0, 0);
    expect(a.maxHp).toBe(Math.round(90 * def.hpMul));
    expect(a.damage).toBeCloseTo(3 * def.dmgMul, 6);
    expect(a.xp).toBe(2); // 每杀修为 = 2 × 层
    expect(c.maxHp).toBeGreaterThan(a.maxHp);
    expect(c.damage).toBeGreaterThan(a.damage);
    expect(c.hp).toBe(c.maxHp);
  });`,
  'spawn1',
);

// ── 镇守血量 ×25 校验（新不变量） ──
c = c.replace(
`  it('id 全局唯一，能按 id 查回来', () => {`,
`  it('镇守 = 同层普通浊物 ×25 血 ×4 攻（BALANCE §11.1）', () => {
    for (const t of [1, 2, 3] as const) {
      const boss = bossOfTier(t)!;
      expect(boss.hpMul, \`tier \${t} hp\`).toBe(25);
      expect(boss.dmgMul, \`tier \${t} dmg\`).toBe(4);
    }
  });

  it('id 全局唯一，能按 id 查回来', () => {`,
);

if (misses.length > 0) {
  console.error('MISS:', misses.join(', '));
  process.exit(1);
}
fs.writeFileSync(p, c, 'utf8');
console.log('OK all');
