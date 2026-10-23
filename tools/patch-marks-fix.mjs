// marks-runtime.ts 引用修正：itemPowerOf → inventory.itemPower
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/src/core/marks-runtime.ts';
const orig = fs.readFileSync(p, 'utf8');
let c = orig;
fs.writeFileSync('F:/dsh-work/zhuoxian/tools/_bak/marks-runtime.ts.' + Date.now() + '.bak', orig, 'utf8');

function repl(oldText, newText, tag) {
  const n = c.split(oldText).length - 1;
  if (n !== 1) throw new Error('MISS(' + n + '): ' + tag);
  c = c.replace(oldText, newText);
  console.log('ok:', tag);
}

repl(
  "import { rerollAffixAt, improveAffixes, itemPowerOf } from './item';",
  [
    "import { rerollAffixAt, improveAffixes } from './item';",
    "import { itemPower as itemPowerOf } from './inventory';",
  ].join('\n'),
  'imports',
);

fs.writeFileSync(p, c, 'utf8');
console.log('flush', c.length, 'B');
