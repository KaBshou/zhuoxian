// 一次性补丁：B1 真元基线 2→4（battle.ts 的 MANA_REGEN_PER_SEC 引用 STAT_META 基线）。
// stats.ts 的 base: 2 → 4 归 shuzhi 改，这里只动 battle.ts。
import fs from 'node:fs';

function edit(p, old, neu, tag) {
  let c = fs.readFileSync(p, 'utf8');
  if (!c.includes(old)) { console.error('MISS ' + tag); process.exit(1); }
  c = c.split(old).join(neu);
  fs.writeFileSync(p, c, 'utf8');
  console.log('OK ' + tag);
}

const B = 'F:/dsh-work/zhuoxian/src/core/battle.ts';

edit(B,
  "import type { ElementStatKey } from '../data/stats';",
  "import { STAT_META, type ElementStatKey } from '../data/stats';",
  'stats-import');
edit(B,
  "/** 真元回复（每秒）。BALANCE §11.5：基础回复 2/s，先写死，等数值定稿改可调。 */\nexport const MANA_REGEN_PER_SEC = 2;",
  "/** 真元回复（每秒）基线。引用 STAT_META.manaRegen.base（唯一出处），\n *  等级带来的真元回复成长由修正器管线加在它上面。\n *  （BALANCE v2 §11.5 / B1：基线 2→4，法术才能单开一条持续用。\n *   之前这里自己写了个 2，stats.ts 改基线时这里就漂 —— 两处写数必漂。） */\nexport const MANA_REGEN_PER_SEC = STAT_META.manaRegen.base;",
  'mana-ref');
console.log('DONE');
