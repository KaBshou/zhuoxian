// 诊断 5：mengong 的 find 为什么失败 —— 打印 id 的字符码。跑完即弃。
import { createServer } from 'vite';

const server = await createServer({
  root: 'F:/dsh-work/zhuoxian',
  configFile: false,
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, watch: null, hmr: false, open: false },
});

const gemM = await server.ssrLoadModule('/src/data/support-gems.ts');
const chM = await server.ssrLoadModule('/src/core/character.ts');
const ids = gemM.SUPPORT_GEMS.map((g) => g.id);
console.log('module ids:', ids.join(','));
const probe = 'mengong';
console.log('probe codes:', [...probe].map((c) => c.charCodeAt(0)).join(','));
const hit = ids.find((i) => i === probe);
console.log('exact hit?', hit);
const hit2 = gemM.SUPPORT_GEMS.find((g) => g.id === probe);
console.log('find hit?', !!hit2);
// try each module id char codes
for (const i of ids.slice(0, 3)) {
  console.log(i, [...i].map((c) => c.charCodeAt(0)).join(','));
}
const { characterGemLoadout } = chM;
const { createCharacter } = chM;
const ch = { ...createCharacter('yujian'), step: 9, gemLoadout: ['mengong', 'cuijin', 'guantou', 'duanjin'] };
console.log('step9 loadout:', characterGemLoadout(ch));
await server.close();
