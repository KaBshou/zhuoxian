// D14 落地第二批：character.ts 的 import 补齐（getActiveSkill / gemAffects）。
import fs from 'node:fs';
const p = 'F:/dsh-work/zhuoxian/src/core/character.ts';
let c = fs.readFileSync(p, 'utf8');
const old = "import { GEM_SLOTS, SUPPORT_GEMS } from '../data/support-gems';";
if (!c.includes(old)) { console.error('MISS'); process.exit(1); }
c = c.replace(old,
  old + "\nimport { getActiveSkill } from '../data/skills';\nimport { gemAffects } from '../data/support-gems';");
fs.writeFileSync(p, c, 'utf8');
console.log('OK');
