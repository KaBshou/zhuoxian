/**
 * 数值取证器 —— 给 docs/VERIFY-NUMBERS.md 生成**真实跑出来**的数字。
 *
 * 用法：node tools/verify-numbers.mjs
 * 约定：每个数字都必须来自本脚本的输出，禁止手算/估算写进文档。
 * 种子固定，可复现。
 */
import { openSrc } from './vite-loader.mjs';

const src = await openSrc();
const load = src.load;

const monsters = await load('/src/data/monsters.ts');
const battle = await load('/src/core/battle.ts');
const damage = await load('/src/core/damage.ts');
const turbid = await load('/src/core/turbid.ts');
const progression = await load('/src/core/progression.ts');
const loot = await load('/src/core/loot.ts');
const rarity = await load('/src/data/rarity.ts');
const drop = await load('/src/core/drop.ts');
const character = await load('/src/core/character.ts');
const session = await load('/src/core/session.ts');
const rngMod = await load('/src/core/rng.ts');

const pct = (x) => `${(x * 100).toFixed(2)}%`;
const fx = (x, n = 2) => Number(x).toFixed(n);

console.log('## 1. 层曲线（spawnMonster 真跑，每层取第一只普通怪 + 该阶镇守）');
console.log('| 层 | 阶 | 普通怪 | 血 | 攻 | 经验 | 镇守 | 血 | 攻 | GDD血(1.18^) | 比值血 | GDD攻(1.12^) | 比值攻 |');
console.log('|---:|---:|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|');
for (let f = 1; f <= monsters.MAX_FLOOR; f++) {
  const tier = monsters.tierOfFloor(f);
  const def = monsters.monstersOfTier(tier)[0];
  const m = battle.spawnMonster(def, f, 1, 0, 0, 'normal');
  const bdef = monsters.bossOfTier(tier);
  const b = battle.spawnMonster(bdef, f, 2, 0, 0, 'boss');
  const gddHp = 90 * Math.pow(1.18, f - 1);
  const gddDmg = 3 * Math.pow(1.12, f - 1);
  console.log(
    `| ${f} | ${tier} | ${def.id} | ${m.maxHp} | ${fx(m.damage, 3)} | ${m.xp} | ${bdef.id} | ${b.maxHp} | ${fx(b.damage, 3)} | ${fx(gddHp, 1)} | ${fx(m.maxHp / gddHp)}× | ${fx(gddDmg, 2)} | ${fx(m.damage / gddDmg)}× |`,
  );
}
console.log('');
console.log('常量：', JSON.stringify({
  BASE_MONSTER_HP: monsters.BASE_MONSTER_HP,
  BASE_MONSTER_DAMAGE: monsters.BASE_MONSTER_DAMAGE,
  BASE_MONSTER_XP: monsters.BASE_MONSTER_XP,
  FLOOR_HP_MUL: monsters.FLOOR_HP_MUL,
  FLOOR_DAMAGE_MUL: monsters.FLOOR_DAMAGE_MUL,
  MAX_FLOOR: monsters.MAX_FLOOR,
  BOSS_HP_MUL: monsters.BOSS_HP_MUL,
  BOSS_DMG_MUL: monsters.BOSS_DMG_MUL,
  XP_PER_KILL_PER_FLOOR: monsters.XP_PER_KILL_PER_FLOOR,
}));
console.log('scaleOfFloor 1..9 =', Array.from({ length: 9 }, (_, i) => `${i + 1}:${fx(monsters.scaleOfFloor(i + 1).hp, 2)}/${fx(monsters.scaleOfFloor(i + 1).damage, 2)}`).join(' '));
console.log('');

console.log('## 2. 护甲减伤曲线 armorReduction(armor, 敌人等级)');
console.log('| 护体 | lv1 | lv5 | lv10 | lv50 | GDD 公式 lv1（无 cap） |');
console.log('|---:|---:|---:|---:|---:|---:|');
const gddArmor = (a, lv) => a / (a + 50 + 10 * lv);
for (const a of [0, 50, 100, 200, 400, 540, 1000, 2000]) {
  console.log(`| ${a} | ${pct(damage.armorReduction(a, 1))} | ${pct(damage.armorReduction(a, 5))} | ${pct(damage.armorReduction(a, 10))} | ${pct(damage.armorReduction(a, 50))} | ${pct(gddArmor(a, 1))} |`);
}
console.log('常量：', JSON.stringify({
  ARMOR_K: damage.ARMOR_K,
  ARMOR_K_PER_LEVEL: damage.ARMOR_K_PER_LEVEL,
  ARMOR_REDUCTION_CAP: damage.ARMOR_REDUCTION_CAP,
  MIN_DAMAGE: damage.MIN_DAMAGE,
}));
console.log('');

console.log('## 3. 伤害管线（base=100，无修正器，roll=null 取期望）');
const mk = (over) => ({ base: 100, tags: [], modifiers: [], isCrit: false, ...over });
const cases = [
  ['裸伤害 100', mk({})],
  ['vs 护体100 lv1', mk({ target: { armor: 100, level: 1 } })],
  ['暴击（默认 critMulti 1.5）', mk({ isCrit: true })],
  ['暴击 vs 护体100 lv1', mk({ isCrit: true, target: { armor: 100, level: 1 } })],
  ['浊气沸腾 100% externalMore 1.5', mk({ externalMore: turbid.turbidDamageMul(100) })],
];
for (const [label, input] of cases) {
  const r = damage.computeDamage(input);
  console.log(`- ${label}: raw ${fx(r.raw, 4)} → amount ${r.amount}`);
}
console.log(`- critMultiplier([]) = ${fx(damage.critMultiplier([]), 4)}`);
console.log(`- 伤害浮动 DAMAGE_ROLL_MIN/MAX = ${damage.DAMAGE_ROLL_MIN} / ${damage.DAMAGE_ROLL_MAX}`);
console.log('');

console.log('## 4. 浊气（turbid.ts）');
console.log('| 浊气值 | 伤害乘区 | 回复乘区 | GDD 沸腾(1+0.5t) | GDD 道基受损(1-0.4t) |');
console.log('|---:|---:|---:|---:|---:|');
for (const v of [0, 25, 50, 75, 100]) {
  console.log(`| ${v} | ${fx(turbid.turbidDamageMul(v), 4)} | ${fx(turbid.turbidRegenMul(v), 4)} | ${fx(1 + (v / 100) * 0.5, 4)} | ${fx(1 - (v / 100) * 0.4, 4)} |`);
}
console.log('常量：', JSON.stringify({
  TURBID_MAX: turbid.TURBID_MAX,
  TURBID_DAMAGE_BONUS: turbid.TURBID_DAMAGE_BONUS,
  TURBID_REGEN_PENALTY: turbid.TURBID_REGEN_PENALTY,
  CORRUPTION_DURATION: turbid.CORRUPTION_DURATION,
  CORRUPTION_DAMAGE_MUL: turbid.CORRUPTION_DAMAGE_MUL,
  WEAKNESS_DURATION: turbid.WEAKNESS_DURATION,
  WEAKNESS_TAKEN_MUL: turbid.WEAKNESS_TAKEN_MUL,
  WEAKNESS_DAMAGE_MUL: turbid.WEAKNESS_DAMAGE_MUL,
}));

// 状态机：一路 tick 到浊化结束、虚弱结束
{
  let state = turbid.createTurbid();
  const log = [];
  const dt = 0.1;
  state = turbid.tickTurbid(state, dt, 1000); // 一次灌满
  log.push(`灌满后 phase=${state.phase} value=${fx(state.value, 2)}`);
  let t = dt;
  let lastPhase = state.phase;
  for (let i = 0; i < 200; i++) {
    state = turbid.tickTurbid(state, dt);
    t += dt;
    if (state.phase !== lastPhase) {
      log.push(`t=${fx(t, 1)}s ${lastPhase} → ${state.phase}（value ${fx(state.value, 2)}，weakRemaining ${fx(state.weakRemaining ?? 0, 2)}）`);
      lastPhase = state.phase;
    }
  }
  console.log('状态机：', log.join('；'));
  console.log(`浊化/虚弱期乘区：corruption=${turbid.turbidMultiplier({ phase: 'corrupting', value: 100, weakRemaining: 0 })} weakDmg=${turbid.turbidMultiplier({ phase: 'weak', value: 100, weakRemaining: 4 })} weakTaken=${turbid.turbidTakenMultiplier({ phase: 'weak', value: 100, weakRemaining: 4 })} weakHeal=${fx(turbid.turbidHealMultiplier({ phase: 'weak', value: 100, weakRemaining: 4 }), 4)}`);
  // 平静期自然衰减速率（从 50 起测：从 100 起会先触发浊化，测不到平静期）
  let calm = turbid.createTurbid();
  calm = { ...calm, value: 50 };
  calm = turbid.tickTurbid(calm, 1);
  console.log(`平静期衰减：value 50 → ${fx(calm.value, 2)} / 秒（phase=${calm.phase}）`);
  let calm10 = turbid.createTurbid();
  calm10 = { ...calm10, value: 50 };
  calm10 = turbid.tickTurbid(calm10, 10);
  console.log(`平静期衰减：value 50 → ${fx(calm10.value, 2)} / 10 秒`);
}
console.log('');

console.log('## 5. 修为曲线（progression.ts）');
console.log('| 台阶 | 境界/重 | 本台阶所需修为 | 本境合计（9 重） | GDD 100×1.6^境 单台阶 | 代码/GDD 单台阶 | GDD 9×8%×100×1.6^境 |');
console.log('|---:|---|---:|---:|---:|---:|---:|');
for (let k = 0; k < progression.REALM_COUNT; k++) {
  const step = k * progression.STAGES_PER_REALM;
  const last = k === progression.REALM_COUNT - 1;
  // 末境第 9 重 = step80 = 终点（xpForStep 返回 Infinity），故末境累计只算前 8 重 + 标注满级
  const steps = last ? Array.from({ length: 8 }, (_, s) => step + s) : Array.from({ length: 9 }, (_, s) => step + s);
  const total = steps.reduce((a, s) => a + progression.xpForStep(s), 0);
  const gdd = 100 * Math.pow(1.6, k);
  const totalText = last ? `${total}+（第 9 重=满级，无需修为）` : `${total}`;
  console.log(`| ${step} | ${progression.realmName(step)}·${progression.stageName(step)} | ${progression.xpForStep(step)} | ${totalText} | ${fx(gdd, 0)} | ${fx(progression.xpForStep(step) / gdd)}× | ${fx(gdd * 0.72, 0)} |`);
}
const realmTotals = [];
for (let k = 0; k < 8; k++) {
  realmTotals.push(Array.from({ length: 9 }, (_, s) => progression.xpForStep(k * 9 + s)).reduce((a, b) => a + b, 0));
}
const lastRealmTotal = Array.from({ length: 8 }, (_, s) => progression.xpForStep(72 + s)).reduce((a, b) => a + b, 0);
console.log(`- 每境合计（9 重）1..8 境 = ${realmTotals.join(' / ')}；末境 8 重 = ${lastRealmTotal}（第 9 重满级）`);
console.log(`- 九境合计 = ${realmTotals.reduce((a, b) => a + b, 0) + lastRealmTotal}`);
console.log(`- 每杀修为（xpPerKill）1..9 层 = ${Array.from({ length: 9 }, (_, i) => `${i + 1}:${monsters.xpPerKill(i + 1)}`).join(' ')}（契约：2×层）`);
console.log('常量：', JSON.stringify({
  REALM_COUNT: progression.REALM_COUNT,
  STAGES_PER_REALM: progression.STAGES_PER_REALM,
  TOTAL_STEPS: progression.TOTAL_STEPS,
  STEP_BASE_XP: progression.STEP_BASE_XP,
  REALM_XP_MUL: progression.REALM_XP_MUL,
  STAGE_RATIO: progression.STAGE_RATIO,
  TRIBULATION_RATIO: progression.TRIBULATION_RATIO,
}));
console.log(`- xpForStep(0..10) = ${Array.from({ length: 11 }, (_, i) => `${i}:${progression.xpForStep(i)}`).join(' ')}`);
console.log(`- xpForStep(79)=${progression.xpForStep(79)}  •  9 重（渡劫）= 常规重的 ${fx(progression.TRIBULATION_RATIO / progression.STAGE_RATIO, 2)} 倍`);
console.log(`- 到 step81（走完全部 81 台阶）累计修为 = ${progression.totalXpToStep(progression.TOTAL_STEPS)}`);
console.log(`- isMaxStep(80)=${progression.isMaxStep(80)} isMaxStep(81)=${progression.isMaxStep(81)}`);
console.log('');

console.log('## 6. 掉落与灵蕴');
{
  const rng = new rngMod.Rng(20261021);
  const N = 200000;
  const counts = { fan: 0, ling: 0, bao: 0, xian: 0 };
  for (let i = 0; i < N; i++) counts[loot.rollRarity(rng, 1)]++;
  console.log(`- rollRarity 基线 ${N} 次（种子 20261021）：` + rarity.RARITIES.map((r) => `${r} ${pct(counts[r] / N)}`).join(' / '));
  console.log(`- 权重表 = ${JSON.stringify(rarity.RARITY_BASE_WEIGHT)}；词缀条数 = ${JSON.stringify(rarity.RARITY_AFFIX_COUNT)}`);

  const rng2 = new rngMod.Rng(20261021);
  const c2 = { fan: 0, ling: 0, bao: 0, xian: 0 };
  for (let i = 0; i < N; i++) c2[loot.rollRarity(rng2, 3)]++;
  console.log(`- rarityBonus=3 ${N} 次：` + rarity.RARITIES.map((r) => `${r} ${pct(c2[r] / N)}`).join(' / '));
}
console.log(`- ilvlForFloor(1..9) = ${Array.from({ length: 9 }, (_, i) => `${i + 1}:${drop.ilvlForFloor(i + 1)}`).join(' ')}`);
console.log(`- ilvlForTier(1..3) = ${[1, 2, 3].map((t) => `${t}:${drop.ilvlForTier(t)}`).join(' ')}`);
console.log(`- DROP_CHANCE = ${JSON.stringify(drop.DROP_CHANCE)}`);
console.log(`- DROP_RARITY_BONUS = ${JSON.stringify(drop.DROP_RARITY_BONUS)}`);
console.log('');

console.log('## 7. 角色成长（class=yujian，step 0 vs 80）');
{
  const ch = character.createCharacter('yujian');
  const rows = [0, 80].map((step) => {
    const c = { ...ch, step };
    const a = character.characterAttrs(c);
    const s = character.characterStats(c);
    return { step, attrs: `${a.body}/${a.agility}/${a.spirit}`, life: s.life, armor: s.armor, damage: s.damage, atkSpeed: fx(s.attackSpeed, 3), crit: fx(s.critChance, 3), critMulti: s.critMulti };
  });
  for (const r of rows) console.log(`- step ${r.step}: 属性 ${r.attrs} 气血 ${r.life} 护体 ${r.armor} 攻伐% ${r.damage} 出手 ${r.atkSpeed} 破防率 ${r.crit} 破防伤害 ${r.critMulti}`);
  console.log(`- baseDamage() = ${character.baseDamage()}（UNARMED_DAMAGE=${character.UNARMED_DAMAGE}）`);
  console.log(`- 气血倍率 step80/step0 = ${fx(rows[1].life / rows[0].life, 3)}×`);
  console.log(`- 面板 DPS（baseDamage × (1+攻伐%) × 出手 × 暴击期望）：step0 = ${fx(character.baseDamage() * (1 + rows[0].damage / 100) * rows[0].atkSpeed * (1 + rows[0].crit * (rows[0].critMulti - 1)), 2)} / step80 = ${fx(character.baseDamage() * (1 + rows[1].damage / 100) * rows[1].atkSpeed * (1 + rows[1].crit * (rows[1].critMulti - 1)), 2)}`);
}
console.log('');

console.log('## 8. session / 战斗常量');
console.log('常量：', JSON.stringify({
  MAX_FLOOR: monsters.MAX_FLOOR,
  BOSS_EVERY: session.BOSS_EVERY,
  WAVE_SIZE: session.WAVE_SIZE,
  WAVE_GAP: session.WAVE_GAP,
  DEATH_XP_PENALTY: session.DEATH_XP_PENALTY,
  PICKUP_DELAY: drop.PICKUP_DELAY,
  MAX_GROUND_DROPS: drop.MAX_GROUND_DROPS,
}));
console.log(`- tierOfFloor(1..9) = ${Array.from({ length: 9 }, (_, i) => `${i + 1}:${monsters.tierOfFloor(i + 1)}`).join(' ')}`);
console.log(`- floorOfTier(1..3) = ${[1, 2, 3].map((t) => `${t}:${monsters.floorOfTier(t)}`).join(' ')}`);
console.log(`- validateMonsters(ALL_MONSTERS) = ${JSON.stringify(monsters.validateMonsters(monsters.ALL_MONSTERS))}`);
console.log(`- 普通怪 ${monsters.MONSTERS.length} 只 / 镇守 ${monsters.BOSSES.length} 只`);

await src.close();
