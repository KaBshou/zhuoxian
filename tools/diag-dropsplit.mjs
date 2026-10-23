// 掉落三分类的分布验证：跑真实 session，统计法宝/通货/玉简的实际比例。
// 期望（BALANCE §5）：法宝 ~40% / 通货 ~47.5% / 玉简 ~12.5%。
import { createServer } from 'vite';

const server = await createServer({
  root: 'F:/dsh-work/zhuoxian', configFile: false, appType: 'custom', logLevel: 'error',
  server: { middlewareMode: true, watch: null, hmr: false, open: false },
});

const sess = await server.ssrLoadModule('/src/core/session.ts');
const basesM = await server.ssrLoadModule('/src/data/bases.ts');
const affixM = await server.ssrLoadModule('/src/data/affixes.ts');
const { createSession, startWave, tickSession } = sess;
const tables = { bases: basesM.ITEM_BASES, affixes: affixM.AFFIXES };
const DT = 1 / 60;

let gear = 0, cur = 0, gem = 0, kills = 0;
for (const seed of [11, 22, 33]) {
  const s = createSession({ classId: 'yujian', seed, tables });
  startWave(s);
  for (let f = 0; f < 10 * 60 / DT; f++) {
    const beforeKills = s.battle.kills;
    tickSession(s, DT);
    kills += s.battle.kills - beforeKills;
  }
  gear += s.ground.length + s.bag.length; // 近似：地上+背包 = 法宝
  for (const k of Object.keys(s.pocket)) cur += s.pocket[k];
  for (const k of Object.keys(s.gemPouch)) gem += s.gemPouch[k];
}
const sum = gear + cur + gem;
console.log(`击杀=${kills} (${(kills/10).toFixed(1)}/min)`);
console.log(`法宝=${gear} (${(100*gear/sum).toFixed(1)}%) 通货=${cur} (${(100*cur/sum).toFixed(1)}%) 玉简=${gem} (${(100*gem/sum).toFixed(1)}%)`);
console.log(`掉落率=${(sum/10).toFixed(2)}/min（目标 4）`);
await server.close();
