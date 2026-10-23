// 击杀率诊断：打印 step/kills/deaths/dps 随时间变化。
// 上一个版本被 PowerShell Set-Content -Encoding UTF8 写坏（import 行被并进注释行）。
import { createServer } from 'vite';

const server = await createServer({
  root: 'F:/dsh-work/zhuoxian', configFile: false, appType: 'custom', logLevel: 'error',
  server: { middlewareMode: true, watch: null, hmr: false, open: false },
});

const sess = await server.ssrLoadModule('/src/core/session.ts');
const chars = await server.ssrLoadModule('/src/core/character.ts');
const basesM = await server.ssrLoadModule('/src/data/bases.ts');
const affixM = await server.ssrLoadModule('/src/data/affixes.ts');
const { createSession, startWave, tickSession } = sess;
const tables = { bases: basesM.ITEM_BASES, affixes: affixM.AFFIXES };
const DT = 1 / 60;

const s = createSession({ classId: 'yujian', seed: 11, tables });
startWave(s);
const marks = [60, 180, 300, 420];
let mi = 0;
for (let f = 0; f < 420 / DT; f++) {
  tickSession(s, DT);
  const t = f * DT;
  if (mi < marks.length && t >= marks[mi]) {
    const st = chars.characterStats(s.character);
    console.log(`t=${marks[mi]}s step=${s.character.step} kills=${s.battle.kills} deaths=${s.battle.deaths} floor=${s.floor} wave=${s.wave} dps=${(st.damage * (1 + st.critChance * (st.critMulti - 1)) * st.attackSpeed).toFixed(1)}`);
    mi++;
  }
}
await server.close();
