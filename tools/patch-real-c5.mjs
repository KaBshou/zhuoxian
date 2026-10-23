// 修：补 TOTAL_STEPS import（用当前真实锚点）并替换 MAX_STEP
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/src/core/session.ts';
const orig = fs.readFileSync(p, 'utf8');
let c = orig;

function repl(oldText, newText, tag) {
  const n = c.split(oldText).length - 1;
  if (n !== 1) throw new Error('MISS(' + n + '): ' + tag);
  c = c.replace(oldText, newText);
  console.log('ok:', tag);
}

repl(
  "import { hasBossFloor, bossOfTier, monstersOfTier, MAX_FLOOR, tierOfFloor } from '../data/monsters';",
  "import { hasBossFloor, bossOfTier, monstersOfTier, MAX_FLOOR, tierOfFloor } from '../data/monsters';\nimport { TOTAL_STEPS } from './progression';",
  'import-total-steps',
);

repl('if (before >= MAX_STEP) {', 'if (before >= TOTAL_STEPS - 1) {', 'use-total-steps');

if (c.length < orig.length * 0.99) throw new Error('拒绝写盘');
fs.writeFileSync(p, c, 'utf8');
console.log('done', c.length, 'B');
