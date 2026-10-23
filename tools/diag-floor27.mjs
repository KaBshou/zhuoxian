// 层 27 诊断：玩家为什么一只怪都杀不死？
// 检查：玩家面板伤害、怪的减伤率（护甲公式 k=50+10×攻方level，攻方=玩家）、怪血。
import { createServer } from 'vite';

const server = await createServer({
  root: 'F:/dsh-work/zhuoxian', configFile: false, appType: 'custom', logLevel: 'error',
  server: { middlewareMode: true, watch: null, hmr: false, open: false },
});

const chars = await server.ssrLoadModule('/src/core/character.ts');
const prog = await server.ssrLoadModule('/src/core/progression.ts');
const monsM = await server.ssrLoadModule('/src/data/monsters.ts');
const dmgM = await server.ssrLoadModule('/src/core/damage.ts');
const statsM = await server.ssrLoadModule('/src/data/stats.ts');

const floor = 27;
const realm = Math.ceil(floor / 3);
const target = Math.min(80, (realm - 1) * 9 + 4);
let ch = chars.createCharacter('yujian');
while (ch.step < target) ch = chars.gainXp(ch, prog.xpForStep(ch.step));

const st = chars.characterStats(ch);
console.log(`玩家 step=${ch.step} life=${st.life.toFixed(0)} damage加成=${st.damage.toFixed(3)} atkSpeed=${st.attackSpeed.toFixed(2)} crit=${(st.critChance * 100).toFixed(1)}%`);

// 武器伤害（base）：拳脚 5
console.log(`baseDamage=${chars.baseDamage?.() ?? 5}`);

const tier = monsM.tierOfFloor(floor);
const hpMul = monsM.FLOOR_HP_MUL;
const atkMul = monsM.FLOOR_DAMAGE_MUL;
console.log(`层 ${floor} 怪血系数=${hpMul.toFixed(4)} → 层27怪血基线=${(90 * Math.pow(hpMul, floor - 1)).toFixed(0)}`);

for (const m of monsM.monstersOfTier(tier)) {
  const hp = Math.round(90 * Math.pow(hpMul, floor - 1) * m.hpMul);
  const dmg = 3 * Math.pow(atkMul, floor - 1) * m.dmgMul;
  // 玩家单发伤害（无属性普攻走护甲）：base = 拳脚5 × (1+damage加成)
  const base = 5 * (1 + st.damage);
  // 怪的护甲：打怪的 defense = { armor: m.armor × 层系数?, level: 玩家 level=step+1 }
  const red = dmgM.armorReduction(m.armor, ch.step + 1);
  const hit = Math.max(1, Math.round(base * (1 - red)));
  const dps = hit * st.attackSpeed;
  console.log(`  ${m.id}: 怪血=${hp} 怪攻=${dmg.toFixed(0)} 怪护甲=${m.armor} 玩家减伤率=${(red * 100).toFixed(1)}% 单发=${hit} DPS=${dps.toFixed(0)} TTK=${(hp / dps).toFixed(0)}s`);
}

// 检查怪血表 B 期望 vs 实际
console.log(`\nBALANCE 表 B 期望层 27 玩家 DPS≈394（供给 40.85×），怪血 3677`);
await server.close();
