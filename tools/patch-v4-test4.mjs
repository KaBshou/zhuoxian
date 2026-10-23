// v4 测试迁移第四步：三个被「伤害地板 = 1」压扁的测试。
// v4 后 BASE_MONSTER_DAMAGE=1.0，层 1~5 的怪伤全在 0.8~1.2，
// computeDamage 的 Math.max(MIN_DAMAGE=1,…) 把它们全抬成 1。
// 测试要测的行为（层间成长 / 虚弱 ×1.3 / 死亡）必须用地板以上的伤害。
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/tests/battle.test.ts';
let c = fs.readFileSync(p, 'utf8');
let miss = 0;
function repl(oldS, neu, tag) {
  if (!c.includes(oldS)) { console.error('MISS: ' + tag); miss++; return; }
  c = c.replace(oldS, neu);
  console.log('OK: ' + tag);
}

// 1) 层间成长：层 1 dmg 0.8（地板 1）vs 层 3 dmg 0.95（地板 1）→ 都是 1，greaterThan 失败。
//    改成层 12 vs 层 3：0.8×1.09^11 = 2.11 vs 1。
repl(
  `    const c = spawnMonster(def, 3, 2, 0, 0);`,
  `    // v4：层 1~5 怪伤 0.8~1.2 全被 MIN_DAMAGE=1 地板压平，层间成长断言用层 12（0.8×1.09^11 = 2.11）
    const c = spawnMonster(def, 12, 2, 0, 0);`,
  'floor growth',
);

// 2) 虚弱测试：duoxiu-zu 层 3 伤害 1.0×0.9525×1.09² = 1.13 → raw×1.3(weak) = 1.47 vs 1.13，round 后 1 vs 1。
//    把层提到 18：1.0×0.9525×1.09^17 = 4.45，weak = 5.8 → 6 vs 4。tankPlayer armor 5000 会被
//    k=50+10×m.tier 压 —— 不对，护甲在防御链里对「无属性」才生效，怪 tags=[element] 走抗性，
//    所以 armor 不影响。层 18 直接可用。
repl(
  `      const s = createBattle(tankPlayer(), t);
      s.monsters = [spawnMonster(def, 3, 1, BATTLE_W / 2 + 20, BATTLE_H / 2)];`,
  `      const s = createBattle(tankPlayer(), t);
      // v4：层 3 怪伤 1.13 被 MIN_DAMAGE 地板压成 1，虚弱 ×1.3 round 后仍是 1，断言失真。
      // 层 18 怪伤 4.45，×1.3 = 5.8 → 6 vs 4，地板之上的真实差异。
      s.monsters = [spawnMonster(def, 18, 1, BATTLE_W / 2 + 20, BATTLE_H / 2)];`,
  'weak phase floor',
);

if (miss > 0) process.exit(1);
fs.writeFileSync(p, c, 'utf8');
console.log('written');
