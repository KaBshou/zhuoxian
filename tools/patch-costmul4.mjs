/**
 * 万汇 costMul 接线（第四轮：补 BattleState 字段与初始化 —— 第一轮补丁当时被 MISS 跳过了）。
 * 一次性补丁，跑完即弃。
 */
import fs from 'node:fs';

function edit(p, old, neu, tag) {
  let c = fs.readFileSync(p, 'utf8');
  if (!c.includes(old)) { console.error('MISS ' + tag); process.exit(1); }
  c = c.split(old).join(neu);
  fs.writeFileSync(p, c, 'utf8');
  console.log('OK ' + tag);
}

const B = 'F:/dsh-work/zhuoxian/src/core/battle.ts';

// 1) BattleState 字段
edit(B,
  '  readonly gemModsBySkill: Readonly<Record<string, readonly Modifier[]>>;\n}',
  '  readonly gemModsBySkill: Readonly<Record<string, readonly Modifier[]>>;\n  /** 每神通的真元代价倍率（预计算，扣费与够不够判定都读这张表；别在施放处现算） */\n  readonly gemCostMulBySkill: Readonly<Record<string, number>>;\n}',
  'state-field');

// 2) createBattle 初始化
edit(B,
  '    gemModsBySkill: gemMods,\n    damageTaken: 0,',
  '    gemModsBySkill: gemMods,\n    gemCostMulBySkill: gemCostMul,\n    damageTaken: 0,',
  'init');

console.log('DONE');
