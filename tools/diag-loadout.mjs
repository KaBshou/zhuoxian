// R2 失败排查：浊焰咒 step18 为什么只有 1.944×？
// shuzhi 说六神通全 2.484×。打印装配明细。
import { createCharacter, gainXp, characterGemLoadout } from '../src/core/character';
import { xpForStep } from '../src/core/progression';
import { getActiveSkill } from '../src/data/skills';
import { SUPPORT_GEMS, gemModifiersFor } from '../src/data/support-gems';
import { unlockedSkills } from '../src/core/skills-runtime';

let ch = createCharacter('yujian');
while (ch.step < 18) ch = gainXp(ch, xpForStep(ch.step));

for (const skill of unlockedSkills(ch)) {
  if (skill.cooldown <= 0) continue;
  const loadout = characterGemLoadout(ch, skill.id);
  const mods = gemModifiersFor(loadout.map((id) => SUPPORT_GEMS.find((g) => g.id === id)).filter(Boolean), skill.tags);
  console.log(`\n${skill.name} tags=[${skill.tags.join(',')}] 装配=[${loadout.join(',')}]`);
  for (const m of mods) console.log(`   ${m.stat} ${m.op} ${m.value} (${m.source?.label})`);
}
