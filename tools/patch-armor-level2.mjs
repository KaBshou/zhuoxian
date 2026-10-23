// level 语义收口第二步：damage.ts 的 DefenseProfile.level 注释写的是「目标境界」，
// 但 armorReduction(:108) 注释写的是「敌人的境界」（= 攻击方等级）。
// 真实数学意图：护甲的边际常数 k = 50 + 10 × 攻击方等级（攻方越强，护甲越不值钱）。
// 方案：不在 computeDamage 里隐式换算，而是把 DefenseProfile.level 的语义改成「攻击方等级」，
// 并把 battle.ts 三处构造点的语义写死。这样 armorReduction 的两个调用方语义一致。
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/src/core/damage.ts';
let c = fs.readFileSync(p, 'utf8');
let miss = 0;
function repl(oldS, neu, tag) {
  if (!c.includes(oldS)) { console.error('MISS: ' + tag); miss++; return; }
  c = c.replace(oldS, neu);
  console.log('OK: ' + tag);
}

repl(
  `  /** 目标境界，参与护甲边际效应；不填按 1 算 */`,
  `  /**
   * 攻击方的等级（不是防御方的！）。
   * 护甲边际效应的常数 k = 50 + 10 × 攻方等级：攻方越强，同一件护甲越不值钱。
   * 所以护甲必须随游戏进程一起成长，否则后期等于裸装。
   * 不填按 1 算。`,
  'DefenseProfile.level comment',
);

repl(
  ` * 注意 \`level\` 用的是**敌人的境界**：同一个护甲值打境界越高的怪，减伤越低，`,
  ` * 注意 \`level\` 是**攻击方的等级**：怪的等级（层数）越高打你，护甲越不值钱，`,
  'armorReduction comment',
);

if (miss > 0) process.exit(1);
fs.writeFileSync(p, c, 'utf8');
console.log('written');
