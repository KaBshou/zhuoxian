// 诊断 2：为什么 characterGemLoadout 只留 cuijin —— step 4 时 guantou/duanjin 要 step 9，被过滤正常。
// 但 mengong(step0) 也被滤掉了？检查 GEM_SLOTS import 与 SUPPORT_GEMS 常量。跑完即弃。
import { createServer } from 'vite';

const server = await createServer({
  root: 'F:/dsh-work/zhuoxian',
  configFile: false,
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, watch: null, hmr: false, open: false },
});

const { createCharacter, characterGemLoadout } = await server.ssrLoadModule('/src/core/character.ts');
const ch = { ...createCharacter('yujian'), step: 4, gemLoadout: ['menggong', 'cuijin', 'guantou', 'duanjin'] };
for (const id of ch.gemLoadout) {
  console.log('try', id);
}
console.log('loadout:', characterGemLoadout(ch));

// 逐条手推
const { SUPPORT_GEMS } = await server.ssrLoadModule('/src/data/support-gems.ts');
for (const id of ['menggong', 'cuijin', 'guantou', 'duanjin']) {
  const def = SUPPORT_GEMS.find((g) => g.id === id);
  console.log(id, 'def?', !!def, 'unlock', def && def.unlockStep, 'step ok', def && ch.step >= def.unlockStep);
}
await server.close();
