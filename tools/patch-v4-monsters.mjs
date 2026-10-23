// BALANCE v4 D18 落地：抹掉阶强度轴（hpMul/dmgMul 按阶均值归一）+ 曲线常量换血。
// 依据 shuzhi §16 附录 B（改前必读 docs/BALANCE.md）：
// 12 只怪的 hpMul/dmgMul 原来按阶递增（阶轴 ×8.3 血 / ×5.6 攻），叠在层曲线上
// 造成层 27 名义 TTK 59.6s（设计 9.6s）、每发伤害 = 气血 52%。归一后均值 1.00，
// 层强度全部收口到 scaleOfFloor。
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/src/data/monsters.ts';
let c = fs.readFileSync(p, 'utf8');
let miss = 0;
function repl(oldS, neu, tag) {
  if (!c.includes(oldS)) { console.error('MISS: ' + tag); miss++; return; }
  c = c.replace(oldS, neu);
  console.log('OK: ' + tag);
}

// ── 1) 曲线常量 ──
repl(
  `/** 每层攻伐倍率（BALANCE §3：攻伐 1.16/层，低于血量增速 → 越刷越安全，挂机不死） */
export const FLOOR_DAMAGE_MUL = 1.14;`,
  `/** 每层攻伐倍率（BALANCE v4 D18：1.09 = 玩家气血供给实测 9.3× 的 26 次方根。
 *  基底决定「层 1 有多疼」，growth 决定「疼不疼会变」，两条独立。 */
export const FLOOR_DAMAGE_MUL = 1.09;`,
  'FLOOR_DAMAGE_MUL',
);

repl(
  `export const BASE_MONSTER_HP = 90;
export const BASE_MONSTER_DAMAGE = 3;`,
  `/** 68 = 90 × 一阶 hpMul 均值 0.75：归一后均值 1.00，不降基数等于前 9 层怪血整体 ×1.33。
 *  取 68 让层 1 怪血仍 67.5，前 9 层手感一键不变。 */
export const BASE_MONSTER_HP = 68;
/** 1.0：每发伤害 = 玩家气血 0.8%（恒定，BALANCE v4 §16）。不能再低：
 *  battle.ts 伤害有 Math.max(1, …) 地板，波 10 想压到 20% 需每发 0.35，会被地板抬回 1。 */
export const BASE_MONSTER_DAMAGE = 1.0;`,
  'BASE_*',
);

// ── 2) 注释口径 ──
repl(
  ` * 这样换掉曲线只动两个常量，不用重写 15 只怪。`,
  ` * 这样换掉曲线只动两个常量，不用重写 15 只怪。
 *
 * ⚠️ v4 D18（2026-10-22）：hpMul/dmgMul 已按**阶均值归一**（每阶均值 = 1.00）。
 * 它们现在只表达「同阶内的个体差异」，层的强度全部在 scaleOfFloor 的层曲线上。
 * 这次危机的成因就是把阶强度藏在 hpMul 里（阶轴 ×8.3 血 / ×5.6 攻）叠在层曲线上。`,
  'MonsterDef comment',
);
repl(
  ` * 基准 = 90 / 3（层 1）。锈剑傀 hpMul=0.5 → 层 1 血 45。`,
  ` * 基准 = 68 / 1.0（层 1）。锈剑傀 hpMul=0.6667 → 层 1 血 68×0.6667 = 45.3。`,
  'bench comment',
);
repl(
  ` * hpMul/dmgMul 写成对层基准的比例，与旧表（层 1 绝对值）换算：
 * hpMul = 旧 hp / 90，dmgMul = 旧 damage / 3。`,
  ` * hpMul/dmgMul = 该阶个体差异（均值 1.00，v4 D18 归一），层强度全交给 scaleOfFloor。`,
  'table comment',
);

// ── 3) 12 只怪归一值（shuzhi 算好，均值精确 1.00）──
repl(`    hpMul: 1.0,
    dmgMul: 1.0,
    armor: 5,`, `    hpMul: 1.3333,
    dmgMul: 0.8,
    armor: 5,`, 'fangshi');
repl(`    hpMul: 0.5,
    dmgMul: 1.33,
    armor: 22,`, `    hpMul: 0.6667,
    dmgMul: 1.064,
    armor: 22,`, 'xiujian-kui');
repl(`    hpMul: 0.89,
    dmgMul: 1.0,
    armor: 0,`, `    hpMul: 1.1867,
    dmgMul: 0.8,
    armor: 0,`, 'shijie-pu');
repl(`    hpMul: 0.61,
    dmgMul: 1.67,
    armor: 8,`, `    hpMul: 0.8133,
    dmgMul: 1.336,
    armor: 8,`, 'duanqiang-gui');
repl(`    hpMul: 1.78,
    dmgMul: 3.0,
    armor: 12,`, `    hpMul: 0.9295,
    dmgMul: 1.0284,
    armor: 12,`, 'yaoshi-zhu');
repl(`    hpMul: 1.33,
    dmgMul: 3.67,
    armor: 0,`, `    hpMul: 0.6945,
    dmgMul: 1.2576,
    armor: 0,`, 'danzha');
repl(`    hpMul: 2.44,
    dmgMul: 2.67,
    armor: 30,`, `    hpMul: 1.2741,
    dmgMul: 0.9152,
    armor: 30,`, 'lu-nu');
repl(`    hpMul: 2.11,
    dmgMul: 2.33,
    armor: 6,`, `    hpMul: 1.1018,
    dmgMul: 0.7988,
    armor: 6,`, 'yaoteng');
repl(`    hpMul: 4.67,
    dmgMul: 6.67,
    armor: 55,`, `    hpMul: 0.7502,
    dmgMul: 0.9525,
    armor: 55,`, 'duoxiu-zu');
repl(`    hpMul: 7.78,
    dmgMul: 5.0,
    armor: 90,`, `    hpMul: 1.2498,
    dmgMul: 0.714,
    armor: 90,`, 'beiyou-zhe');
repl(`    hpMul: 5.78,
    dmgMul: 7.67,
    armor: 40,`, `    hpMul: 0.9285,
    dmgMul: 1.0954,
    armor: 40,`, 'xiecheng-shiwei');
repl(`    hpMul: 6.67,
    dmgMul: 8.67,
    armor: 30,`, `    hpMul: 1.0715,
    dmgMul: 1.2382,
    armor: 30,`, 'leisheng-sui');

if (miss > 0) process.exit(1);
fs.writeFileSync(p, c, 'utf8');
console.log('written');
