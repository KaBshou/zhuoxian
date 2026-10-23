// 一次性补丁：bossRegenTimer 在 spawnMonster 初始化为 0（可选字段 → 必有字段）。
import fs from 'node:fs';

function edit(p, old, neu, tag) {
  let c = fs.readFileSync(p, 'utf8');
  if (!c.includes(old)) { console.error('MISS ' + tag); process.exit(1); }
  c = c.split(old).join(neu);
  fs.writeFileSync(p, c, 'utf8');
  console.log('OK ' + tag);
}

const B = 'F:/dsh-work/zhuoxian/src/core/battle.ts';
const M = 'F:/dsh-work/zhuoxian/src/data/monsters.ts';

// MonsterInPlay 的字段声明：找 bossRegenTimer 定义
const c0 = fs.readFileSync(B, 'utf8');
const i = c0.indexOf('bossRegenTimer');
console.log('decl context:');
console.log(c0.slice(i-200, i+80));

console.log('DONE');
