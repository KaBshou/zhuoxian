// 修真 bug：镇守 hpMul 已经是 BOSS_HP_MUL（25），我又乘了一次 bossHpMul(floor) → 地 1 镇守 42 500 血
// 正解：bossHpMul(floor) 只表达「相对主线的降幂比例」，spawnMonster 里用 bossHpMul(floor)/BOSS_HP_MUL
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/src/core/battle.ts';
const orig = fs.readFileSync(p, 'utf8');
let c = orig;
function repl(oldText, newText, tag) {
  const n = c.split(oldText).length - 1;
  if (n !== 1) throw new Error('MISS(' + n + '): ' + tag);
  c = c.replace(oldText, newText);
  console.log('ok:', tag);
}

repl(
  [
    '  // 镇守血量 = 同层普通怪 × bossHpMul(floor)：层 ≤27 恒 25；',
    '  // 层 28+（D36-A 无尽层）线性降幂到 10 —— 因为镇守密度从"每层一只"变"每 5 层一只"，',
    '  // 血系数不降会让层 36 一只镇守打 111 秒，每 5 层被强制卡近 2 分钟。',
    '  const bossMul = def.boss ? bossHpMul(floor) : 1;',
    '  const maxHp = Math.max(1, Math.round(BASE_MONSTER_HP * def.hpMul * s.hp * bossMul));',
  ].join('\n'),
  [
    '  // 镇守血量：BOSSES 表里的 def.hpMul 已经是 BOSS_HP_MUL（25），',
    '  // 所以这里只能乘「相对主线的降幂比例」bossHpMul(floor)/BOSS_HP_MUL，绝不能再乘一次绝对值。',
    '  // （曾经乘了绝对值：层 1 镇守 68×25×1×25 = 42 500 血，玩家 5 面板伤打到 900 秒都打不死。',
    '  //   这条是 ceshi 用「层 1 跑 900s 杀数不动」抓出来的，看截图看不出来。）',
    '  const bossRel = def.boss ? bossHpMul(floor) / BOSS_HP_MUL : 1;',
    '  const maxHp = Math.max(1, Math.round(BASE_MONSTER_HP * def.hpMul * s.hp * bossRel));',
  ].join('\n'),
  'boss-relative',
);

repl(
  '  BOSS_REGEN_RATIO,\n  bossHpMul,',
  '  BOSS_HP_MUL,\n  BOSS_REGEN_RATIO,\n  bossHpMul,',
  'import-boss-hp-mul',
);

if (c.length < orig.length * 0.98) throw new Error('拒绝写盘');
fs.writeFileSync(p, c, 'utf8');
console.log('done', c.length, 'B');
