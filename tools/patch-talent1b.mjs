// patch-talent1b.mjs — 修正 import 锚点（真实行是 createTurbid 那行）
import fs from 'node:fs';

function repl(p, old, neu, tag) {
  let c = fs.readFileSync(p, 'utf8');
  if (!c.includes(old)) throw new Error('MISS ' + tag);
  if (c.split(old).length - 1 !== 1) throw new Error('NOT-UNIQUE ' + tag);
  c = c.replace(old, neu);
  fs.writeFileSync(p, c, 'utf8');
}

repl(
  'src/core/character.ts',
  "import { createTurbid, type TurbidState } from './turbid';",
  "import { createTurbid, type TurbidState } from './turbid';\nimport { talentModifiers } from './talents-runtime';",
  'char-import',
);

console.log('done');
