// 重建忠实度校验：关掉自动天赋后跑全程，和 412.8min 的定稿时间线对齐
// （自动天赋会 +20% 快，所以必须关掉才能和我重建前的口径比）
import { createSession, startWave, tickSession } from 'F:/dsh-work/zhuoxian/src/core/session.ts';
import { ITEM_BASES } from 'F:/dsh-work/zhuoxian/src/data/bases.ts';
import { AFFIXES } from 'F:/dsh-work/zhuoxian/src/data/affixes.ts';

const TABLES = { bases: ITEM_BASES, affixes: AFFIXES };
const DT = 1 / 30;

function run(seed, auto) {
  const s = createSession({ classId: 'yujian', seed, tables: TABLES, autoTalents: auto });
  startWave(s);
  const maxSteps = Math.round((720 * 60) / DT);
  let minutes = null;
  let drops = 0;
  for (let i = 0; i < maxSteps; i++) {
    tickSession(s, DT);
    if (s.character.step >= 80) {
      minutes = (i * DT) / 60;
      break;
    }
  }
  drops = s.dropsFound;
  return {
    seed,
    minutes: minutes === null ? '>720' : +minutes.toFixed(1),
    step: s.character.step,
    floor: s.floor,
    waves: s.wave,
    deaths: s.battle.deaths,
    drops,
    dropsPerMin: minutes === null ? 0 : +(drops / minutes).toFixed(2),
  };
}

const seeds = [20261021, 20262034, 20263047];
console.log('== autoTalents=false（对照定稿 412.79 / 412.07 / 449.82 min）==');
for (const sd of seeds) console.log(JSON.stringify(run(sd, false)));
console.log('== autoTalents=true（当前版本）==');
for (const sd of seeds) console.log(JSON.stringify(run(sd, true)));
