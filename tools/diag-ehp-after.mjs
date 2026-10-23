// EHP 复跑（修正版）：step 用正常 gainXp 路径推、用 characterStats 打印面板、
// 明确把 s.floor 传给 startWave 用的 GameSession（session.startWave 内部读 s.floor）。
// 判据：死亡/10min 显著下降（对比 ceshi diag-floor 基线 21/25/27/29/39/75）、层 27 击杀 > 0。
import { createServer } from 'vite';

const server = await createServer({
  root: 'F:/dsh-work/zhuoxian', configFile: false, appType: 'custom', logLevel: 'error',
  server: { middlewareMode: true, watch: null, hmr: false, open: false },
});

const sess = await server.ssrLoadModule('/src/core/session.ts');
const chars = await server.ssrLoadModule('/src/core/character.ts');
const prog = await server.ssrLoadModule('/src/core/progression.ts');
const basesM = await server.ssrLoadModule('/src/data/bases.ts');
const affixM = await server.ssrLoadModule('/src/data/affixes.ts');
const { createSession, startWave, tickSession, WAVE_SIZE } = sess;
const { createBattle, playerBattleFromCharacter } = await server.ssrLoadModule('/src/core/battle.ts');

const tables = { bases: basesM.ITEM_BASES, affixes: affixM.AFFIXES };
const DT = 1 / 60;

// 裸装面板 = ceshi 同款：境 ceil(N/3)、台阶 (境-1)*9+4
function charAtFloor(floor) {
  const realm = Math.ceil(floor / 3);
  const target = Math.min(80, (realm - 1) * 9 + 4);
  let ch = chars.createCharacter('yujian');
  while (ch.step < target) {
    const need = prog.xpForStep(ch.step);
    ch = chars.gainXp(ch, need);
  }
  return ch;
}

function run(floor, minutes, seed) {
  const ch = charAtFloor(floor);
  const st = chars.characterStats(ch);
  const s = createSession({ classId: 'yujian', seed, tables });
  s.character = ch;
  s.floor = floor;
  s.battle = createBattle(playerBattleFromCharacter(ch), ch.turbid, ch);
  startWave(s);
  const frames = minutes * 60 / DT;
  let cleared = 0, prevWave = s.wave;
  for (let f = 0; f < frames; f++) {
    tickSession(s, DT);
    if (s.wave > prevWave) { cleared++; prevWave = s.wave; }
  }
  const dmgPerWave = s.battle.damageTaken / Math.max(1, s.wave);
  console.log(`floor=${String(floor).padStart(2)} step=${ch.step} life=${st.life.toFixed(0)} armor=${st.armor.toFixed(0)} | waves=${s.wave} cleared=${cleared} kills=${s.battle.kills} drops=${s.dropsFound} deaths=${s.battle.deaths} dmg/wave=${dmgPerWave.toFixed(0)}`);
}

console.log(`WAVE_SIZE=${WAVE_SIZE}`);
for (const f of [1, 5, 9, 13, 18, 27]) run(f, 10, 1000 + f * 77);
await server.close();
