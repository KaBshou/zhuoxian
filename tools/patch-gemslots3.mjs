// 一次性补丁：skillModifiers 把 id 装配表映射回 SupportGemDef 再喂 gemModifiersFor。
import fs from 'node:fs';
const p = 'F:/dsh-work/zhuoxian/src/core/skills-runtime.ts';
let c = fs.readFileSync(p, 'utf8');
const old = `import { SUPPORT_GEMS, gemModifiersFor } from '../data/support-gems';`;
const neu = `import { SUPPORT_GEMS, gemModifiersFor, getSupportGem } from '../data/support-gems';`;
if (!c.includes(old)) { console.error('MISS import'); process.exit(1); }
c = c.split(old).join(neu);

const oldFn = `  return gemModifiersFor(characterGemLoadout(ch), skill.tags);`;
const neuFn = `  const gems = characterGemLoadout(ch)
    .map((id) => getSupportGem(id))
    .filter((g) => g !== undefined);
  return gemModifiersFor(gems, skill.tags);`;
if (!c.includes(oldFn)) { console.error('MISS fn'); process.exit(1); }
c = c.split(oldFn).join(neuFn);

fs.writeFileSync(p, c, 'utf8');
console.log('OK');
