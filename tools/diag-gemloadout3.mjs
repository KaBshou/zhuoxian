// 诊断 3：同一模块里直接调 characterGemLoadout，绕过 vite 模块缓存怀疑。跑完即弃。
import { createServer } from 'vite';

const server = await createServer({
  root: 'F:/dsh-work/zhuoxian',
  configFile: false,
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, watch: null, hmr: false, open: false },
});

const chM = await server.ssrLoadModule('/src/core/character.ts');
const gemM = await server.ssrLoadModule('/src/data/support-gems.ts');
const { createCharacter, characterGemLoadout } = chM;
console.log('SUPPORT_GEMS ids:', gemM.SUPPORT_GEMS.map((g) => g.id).join(','));
console.log('GEM_SLOTS:', gemM.GEM_SLOTS);
const ch = { ...createCharacter('yujian'), step: 4, gemLoadout: ['menggong', 'cuijin', 'guantou', 'duanjin'] };
console.log('fn source:', characterGemLoadout.toString());
console.log('result:', characterGemLoadout(ch));
await server.close();
