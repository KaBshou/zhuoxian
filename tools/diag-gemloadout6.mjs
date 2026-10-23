// 诊断 6：诊断 5 里 step9 能装上 4 条 —— 说明 find 没问题。
// 差异：diag3 用 step 4（guantou/duanjin unlock 9 → 被滤 = 正常 2 条），
// 但结果只剩 cuijin 1 条 —— mengong unlock 0 应该留下！
// 逐条打印过滤过程。跑完即弃。
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
const { SUPPORT_GEMS } = gemM;
const { createCharacter } = chM;
const ch = { ...createCharacter('yujian'), step: 4, gemLoadout: ['menggong', 'cuijin', 'guantou', 'duanjin'] };
const out = [];
for (const id of ch.gemLoadout ?? []) {
  const def = SUPPORT_GEMS.find((g) => g.id === id);
  const keep = !!(def && ch.step >= def.unlockStep);
  console.log(id, 'def', !!def, 'unlock', def && def.unlockStep, 'keep', keep);
  if (keep) { out.push(id); if (out.length >= gemM.GEM_SLOTS) break; }
}
console.log('manual:', out);
await server.close();
