// 一次性补丁（v2 第三轮）：测试迁移到 BALANCE v2。跑完即弃。
// battle.test.ts：镇守 ×8/×4 → ×25/×1.5
// drop.test.ts：灵蕴断言 5×层 → 99×f/27
// session.test.ts：WAVE_SIZE 断言若有写死 8 的；下潜封顶 9→27
import fs from 'node:fs';

let misses = [];
function load(p) { return fs.readFileSync('F:/dsh-work/zhuoxian/' + p, 'utf8'); }
function save(p, c) { fs.writeFileSync('F:/dsh-work/zhuoxian/' + p, c, 'utf8'); }
function replIn(p, c, old, neu, tag) {
  if (!c.includes(old)) { misses.push(p + ':' + tag); return c; }
  return c.split(old).join(neu);
}

{
  const p = 'tests/battle.test.ts';
  let c = load(p);
  c = replIn(p, c,
    "  it('镇守 = 同层普通浊物 ×8 血 ×4 攻（BOSS_HP_MUL，BALANCE §11.1 修订版）', () => {\n    // ×25 与「60~90 秒一场」自相矛盾（层 1 玩家 dps 9.8 打 2250 血要 230s），\n    // 已修订为 ×8：层 1 镇守 720 血 ≈ 73s 正好落窗。\n    for (const t of [1, 2, 3] as const) {\n      const boss = bossOfTier(t)!;\n      expect(boss.hpMul, `tier ${t} hp`).toBe(BOSS_HP_MUL);\n      expect(boss.hpMul, `tier ${t} hp val`).toBe(8);\n      expect(boss.dmgMul, `tier ${t} dmg`).toBe(BOSS_DMG_MUL);\n    }\n  });",
    "  it('镇守 = 同层普通浊物 ×25 血 ×1.5 攻（BALANCE v2 §11.2）', () => {\n    // v2 定稿：×25 血不变（单场 239s，血和 DPS 同步缩放），攻伐降回 ×1.5，\n    // 难度从「抗伤」转「限时 DPS 检查」。旧的 ×4 在 15 层会一击打掉 60%+ 气血。\n    for (const t of [1, 2, 3] as const) {\n      const boss = bossOfTier(t)!;\n      expect(boss.hpMul, `tier ${t} hp`).toBe(BOSS_HP_MUL);\n      expect(boss.hpMul, `tier ${t} hp val`).toBe(25);\n      expect(boss.dmgMul, `tier ${t} dmg`).toBe(BOSS_DMG_MUL);\n      expect(boss.dmgMul, `tier ${t} dmg val`).toBe(1.5);\n    }\n  });",
    'boss');
  // 单只 TTK 不变量也变了？血 1.1534 > 攻 1.14 仍成立
  c = replIn(p, c, 'BALANCE §3：血 1.34/层 > 攻 1.16/层', 'BALANCE v2 §2：血 1.1534/层 > 攻 1.14/层（供给 40.85× 摊 26 区间）', 'invariant');
  c = replIn(p, c, '层数成长：1 层不放大，之后按 1.34 / 1.16 复合（BALANCE §3）', '层数成长：1 层不放大，之后按 1.1534 / 1.14 复合（BALANCE v2）', 'grow');
  save(p, c);
}
{
  const p = 'tests/drop.test.ts';
  let c = load(p);
  c = replIn(p, c,
    "  it('一阶掉落灵蕴 15，对应黄阶灵纹', () => {",
    "  it('一阶掉落灵蕴 4（99×1/27），对应黄阶灵纹', () => {",
    'ilvl1-name');
  // 数值断言统一改为函数换算，不写死
  c = c.split('15)').join('ilvlForFloor(1))');
  c = c.split('30)').join('ilvlForFloor(2))');
  c = c.split('45)').join('ilvlForFloor(3))');
  save(p, c);
}
{
  const p = 'tests/session.test.ts';
  let c = load(p);
  c = replIn(p, c, '9 层封顶（第一版魔渊共 9 层）', '27 层封顶（BALANCE v2：27 层 = 5.8h）', 'mfloor');
  save(p, c);
}

if (misses.length > 0) { console.error('MISS:', misses.join(' | ')); process.exit(1); }
console.log('OK round3');
