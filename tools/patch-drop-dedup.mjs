// 一次性补丁：drop.ts 删除重复的 floorOfTier，改从 monsters.ts 导入。跑完即弃。
import fs from 'node:fs';

const p = 'src/core/drop.ts';
let c = fs.readFileSync(p, 'utf8');
let misses = [];

function repl(old, neu, tag) {
  if (!c.includes(old)) {
    misses.push(tag);
    return;
  }
  c = c.split(old).join(neu);
}

repl(
  "import type { MonsterRarity } from '../data/monsters';",
  "import type { MonsterRarity } from '../data/monsters';\nimport { floorOfTier } from '../data/monsters';",
  'imp',
);

repl(
  "/** 每阶相当于第几层（一阶 = 1~3 层，二阶 = 4~6 层，三阶 = 7~9 层） */\nexport function floorOfTier(tier: 1 | 2 | 3): number {\n  return tier * 3;\n}\n\n",
  '',
  'dedup',
);

if (misses.length > 0) {
  console.error('MISS:', misses.join(', '));
  process.exit(1);
}
fs.writeFileSync(p, c, 'utf8');
console.log('OK');
