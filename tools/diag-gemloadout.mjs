// 诊断脚本：装配制下 gemModsBySkill 为什么是空的。跑完即弃。
import { createServer } from 'vite';

const server = await createServer({
  root: 'F:/dsh-work/zhuoxian',
  configFile: false,
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, watch: null, hmr: false, open: false },
});

const { createCharacter } = await server.ssrLoadModule('/src/core/character.ts');
const { characterGemLoadout } = await server.ssrLoadModule('/src/core/character.ts');
const { createBattle, playerBattleFromCharacter } = await server.ssrLoadModule('/src/core/battle.ts');
const { SUPPORT_GEMS, getSupportGem } = await server.ssrLoadModule('/src/data/support-gems.ts');

const ch = { ...createCharacter('yujian'), step: 4, gemLoadout: ['menggong', 'cuijin', 'guantou', 'duanjin'] };
console.log('loadout:', characterGemLoadout(ch));
const gems = characterGemLoadout(ch).map((id) => getSupportGem(id));
console.log('gems mapped:', gems.map((g) => g && g.id));
const p = playerBattleFromCharacter(ch);
const state = createBattle(p, ch.turbid, ch);
console.log('rotation:', state.skillRotation.map((s) => s.id));
console.log('gemModsBySkill:', Object.fromEntries(Object.entries(state.gemModsBySkill).map(([k, v]) => [k, v.length])));
console.log('gemCostMul:', state.gemCostMulBySkill);
await server.close();
