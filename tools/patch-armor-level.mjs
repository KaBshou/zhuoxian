// 收口 armorReduction 的 level 语义：level = 攻击方的等级（damage.ts:108 注释原意）。
// 修前：怪打玩家用 p.level（台阶 0~81，层 27 时 k=820，护甲 86 只剩 9.5% 减伤）
//       玩家打怪用 target.tier（= 层数 1~27，玩家明明 step77）
// 修后：怪打玩家 → level = m.tier（层数，怪的等级）
//       玩家打怪 → level = p.level（台阶+1，玩家的等级）
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/src/core/battle.ts';
let c = fs.readFileSync(p, 'utf8');
let miss = 0;
function repl(oldS, neu, tag) {
  if (!c.includes(oldS)) { console.error('MISS: ' + tag); miss++; return; }
  c = c.replaceAll(oldS, neu);
  console.log('OK: ' + tag);
}

// 1) monsterStrike（先改，避免后面 p.level 计数混乱）：用三行上下文定位
repl(
  'armor: p.armor,\n    resist: p.resist,\n    level: p.level,',
  'armor: p.armor,\n    resist: p.resist,\n    level: m.tier, // 攻击方等级 = 怪所在层（护甲公式的 k 随攻方等级涨）',
  'monsterStrike level',
);

// 2) playerStrike / skillStrike：defense.level = target.tier → p.level
repl('level: target.tier,', 'level: p.level,', 'player→monster level ×2');

if (miss > 0) process.exit(1);
fs.writeFileSync(p, c, 'utf8');
console.log('written');
