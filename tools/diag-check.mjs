// 修 diag 脚本：xpForStep 从 progression.ts import；step 用正常 gainXp 路径推。
import { createServer } from 'vite';

const server = await createServer({
  root: 'F:/dsh-work/zhuoxian', configFile: false, appType: 'custom', logLevel: 'error',
  server: { middlewareMode: true, watch: null, hmr: false, open: false },
});

const mons = await server.ssrLoadModule('/src/data/monsters.ts');
const chars = await server.ssrLoadModule('/src/core/character.ts');
const prog = await server.ssrLoadModule('/src/core/progression.ts');
const statsM = await server.ssrLoadModule('/src/data/stats.ts');

for (const f of [1, 5, 9, 13, 18, 27]) {
  const tier = mons.tierOfFloor(f);
  const list = mons.monstersOfTier(tier);
  console.log(`floor=${f} tier=${tier} monsters=${list.map((m) => m.id).join(',')}`);
}

// 正常路径推台阶到 22（层 9 的裸装面板）
let ch = chars.createCharacter('yujian');
for (let i = 0; i < 22; i++) {
  const need = prog.xpForStep(ch.step);
  ch = chars.gainXp(ch, need);
}
const st = chars.characterStats(ch);
console.log(`step=${ch.step} life=${st.life.toFixed(0)} armor=${st.armor.toFixed(0)} damage加成=${(st.damage*100).toFixed(1)}% atkSpeed=${st.attackSpeed.toFixed(2)}`);
await server.close();
