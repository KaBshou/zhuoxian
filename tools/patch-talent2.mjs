// patch-talent2.mjs — characterModifiers 接 talentModifiers（一个改动唯一落点）
import fs from 'node:fs';

const p = 'src/core/character.ts';
let c = fs.readFileSync(p, 'utf8');

const old = `  const def = getClass(ch.classId);
  if (def && ch.ascendancyId === def.ascendancy.id) {
    out.push(...def.ascendancy.effects);
  }
  return out;
}`;
const neu = `  const def = getClass(ch.classId);
  if (def && ch.ascendancyId === def.ascendancy.id) {
    out.push(...def.ascendancy.effects);
  }
  out.push(...talentModifiers(ch));
  return out;
}`;

if (!c.includes(old)) throw new Error('MISS body');
if (c.split(old).length - 1 !== 1) throw new Error('NOT-UNIQUE body');
c = c.replace(old, neu);
fs.writeFileSync(p, c, 'utf8');
console.log('done');
