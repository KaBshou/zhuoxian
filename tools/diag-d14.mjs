// D14 E2E 验证：默认装配 + 每神通 4 槽 + costMul（一次性，跑完即弃）
import { createServer } from 'vite';

const server = await createServer({
  root: 'F:/dsh-work/zhuoxian', configFile: false, appType: 'custom', logLevel: 'error',
  server: { middlewareMode: true, watch: null, hmr: false, open: false },
});
const chM = await server.ssrLoadModule('/src/core/character.ts');
const rt = await server.ssrLoadModule('/src/core/skills-runtime.ts');
const skM = await server.ssrLoadModule('/src/data/skills.ts');
const bM = await server.ssrLoadModule('/src/core/battle.ts');
const { createCharacter } = chM;
const { unlockedSkills, skillModifiers, skillCostMul } = rt;

const ch = createCharacter('yujian');
// step18：4 神通解锁，万汇/驭魔解锁
ch.step = 18;
const ch2 = { ...ch, step: 18 };

for (const skill of unlockedSkills(ch2)) {
  const loadout = chM.characterGemLoadout(ch2, skill.id);
  const mods = skillModifiers(ch2, skill);
  const mul = skillCostMul(ch2, skill);
  console.log(`${skill.id.padEnd(10)} 装配=[${loadout.join(',')}] mods=${mods.length} costMul=${mul}`);
}

// 未装配时兜底默认装配已验证；再验：显式装配只对该神通生效
const ch3 = { ...ch2, gemLoadouts: { 'hanshui-jian': ['wanhui', 'jixie'] } };
const hs = skM.getActiveSkill('hanshui-jian');
console.log('hanshui 显式装配:', chM.characterGemLoadout(ch3, 'hanshui-jian').join(','), 'costMul=', skillCostMul(ch3, hs));
const other = unlockedSkills(ch3).find((s) => s.id !== 'hanshui-jian');
console.log(`${other.id} 未装配走默认:`, chM.characterGemLoadout(ch3, other.id).join(','));

await server.close();
