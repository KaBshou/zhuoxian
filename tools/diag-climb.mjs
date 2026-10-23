// 全程爬层模拟（修正版）：一个角色从层 1 往上爬，装备随身携带、换装保留。
//
// ⚠️ 原版 diag-climb.mjs 有两个方法学坑（lead 2026-10-22 02:34 版）：
//   1) `step/life/armor` 列用的是**终局**角色快照（`chars.characterStats(s.character)` 在打印循环里取），
//      所以层 1 那行也显示 step 80 / life 623 —— 不是「层 1 的 EHP」，是「跑完时的 EHP」。
//   2) 每层的 kills/deaths/drops/dmg/waves 直接赋 `s.battle.*` 的**累计值**，不是本层增量，
//      所以「层 15 死 298」实际是「从层 1 到层 15 的累计死亡」；`dmg/wave` 同理是全run均值。
//   3) 注释说「每层 6 分钟上限」，代码里没有单层上限，只有总时长上限（180 分钟）。
// 本版改为：进入每层时快照 step/life/armor，按层记录增量、停留时长、前 6 分钟切片。
import { createServer } from 'vite';

const TOTAL_MINUTES = 180; // 总时长上限（游戏时间）
const SLICE_MINUTES = 6; // 前 6 分钟切片：对齐原版「每层 6 分钟」的口径
const DT = 1 / 60;

const server = await createServer({
  root: 'F:/dsh-work/zhuoxian', configFile: false, appType: 'custom', logLevel: 'error',
  server: { middlewareMode: true, watch: null, hmr: false, open: false },
});

const sess = await server.ssrLoadModule('/src/core/session.ts');
const battleM = await server.ssrLoadModule('/src/core/battle.ts');
const chars = await server.ssrLoadModule('/src/core/character.ts');
const invM = await server.ssrLoadModule('/src/core/inventory.ts');
const basesM = await server.ssrLoadModule('/src/data/bases.ts');
const affixM = await server.ssrLoadModule('/src/data/affixes.ts');
const { createSession, startWave, tickSession, syncBattleFromCharacter } = sess;
const { createBattle, playerBattleFromCharacter } = battleM;
void createBattle;
void playerBattleFromCharacter;
const tables = { bases: basesM.ITEM_BASES, affixes: affixM.AFFIXES };

const s = createSession({ classId: 'yujian', seed: 424242, tables });
let ch = s.character;
startWave(s);

const rows = [];
let rec = null;

function beginFloor(t) {
  const st = chars.characterStats(s.character);
  rec = {
    floor: s.floor,
    tStart: t,
    // 进入本层时的真实面板（这就是原版缺失的东西）
    step: s.character.step,
    life: st.life,
    armor: st.armor,
    kills0: s.battle.kills,
    deaths0: s.battle.deaths,
    drops0: s.dropsFound,
    dmg0: s.battle.damageTaken,
    waves0: s.wave,
    sliceDone: false,
    sliceDeaths: null,
    sliceDmg: null,
    sliceWaves: null,
  };
}

function endFloor(t) {
  if (!rec) return;
  rec.seconds = t - rec.tStart;
  rec.kills = s.battle.kills - rec.kills0;
  rec.deaths = s.battle.deaths - rec.deaths0;
  rec.drops = s.dropsFound - rec.drops0;
  rec.dmg = s.battle.damageTaken - rec.dmg0;
  rec.waves = s.wave - rec.waves0;
  rec.stepEnd = s.character.step;
  rows.push(rec);
  rec = null;
}

beginFloor(0);
const totalFrames = Math.round((TOTAL_MINUTES * 60) / DT);
for (let f = 0; f < totalFrames; f++) {
  const t = f * DT;
  if (s.floor !== rec.floor) {
    endFloor(t);
    beginFloor(t);
    if (s.floor > 27) break;
  }

  tickSession(s, DT);

  // 自动拾取 + 周期性换装（必须写回 s.character，原版 diag-ehp-gear 少了这句）
  ch = s.character;
  while (s.ground.length > 0) {
    const d = s.ground.shift();
    const r = invM.pickup(ch, s.bag, d.item);
    ch = r.character;
    s.bag = r.bag;
    s.character = ch;
    if (r.equipped) syncBattleFromCharacter(s);
  }
  if (f % 120 === 0) {
    for (let i = s.bag.length - 1; i >= 0; i--) {
      const dec = invM.decideEquip(ch, s.bag[i]);
      if (dec.shouldEquip) {
        const bag = s.bag.slice();
        const item = bag.splice(i, 1)[0];
        const r = invM.pickup(ch, bag, item);
        ch = r.character;
        s.bag = r.bag;
        s.character = ch;
        syncBattleFromCharacter(s);
      }
    }
  }

  if (!rec.sliceDone && t - rec.tStart >= SLICE_MINUTES * 60) {
    rec.sliceDone = true;
    rec.sliceDeaths = s.battle.deaths - rec.deaths0;
    rec.sliceDmg = s.battle.damageTaken - rec.dmg0;
    rec.sliceWaves = s.wave - rec.waves0;
  }
}
endFloor((TOTAL_MINUTES * 60));

console.log(`# 全程爬层（修正版）· 总时长上限 ${TOTAL_MINUTES} 分钟 · 种子 424242`);
console.log(`# 每行 = 该层的增量与进入时快照；「前 ${SLICE_MINUTES} 分钟」列 = 原版「每层 6 分钟」口径`);
console.log('');
console.log(`| 层 | 进入step | 进入life | 进入armor | 停留(min) | 击杀 | 死亡 | 掉落 | 本层dmg/波 | 前6min死亡 | 前6min dmg/波 | 离开step |`);
console.log(`|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|`);
for (const r of rows) {
  const dmgPerWave = r.waves > 0 ? (r.dmg / r.waves).toFixed(0) : '-';
  const d6 = r.sliceWaves ? (r.sliceDmg / r.sliceWaves).toFixed(0) : '-';
  console.log(
    `| ${r.floor} | ${r.step} | ${r.life.toFixed(0)} | ${r.armor.toFixed(0)} | ${(r.seconds / 60).toFixed(1)} | ` +
      `${r.kills} | ${r.deaths} | ${r.drops} | ${dmgPerWave} | ${r.sliceDeaths ?? '-'} | ${d6} | ${r.stepEnd} |`,
  );
}

const last = rows[rows.length - 1];
console.log('');
console.log(`- 到达最高层：${last ? last.floor : 1} · 终局 step ${s.character.step} · 累计死亡 ${s.battle.deaths} · 累计掉落 ${s.dropsFound}`);
const stuck = rows.filter((r) => r.floor === last?.floor && r.seconds >= SLICE_MINUTES * 60);
if (stuck.length > 0) {
  console.log(`- 末层停留 ${(stuck[0].seconds / 60).toFixed(1)} 分钟仍未推进 → 该层是真正的卡点`);
}

await server.close();
