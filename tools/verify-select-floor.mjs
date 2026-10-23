// 验证「正向路径」：真的推进到第 2 层，然后回刷第 1 层，再回第 2 层
import {
  createSession, floorSelectableMax, highestFloorReached, setFloor, startWave, tickSession,
} from 'F:/dsh-work/zhuoxian/src/core/session.ts';
import { ITEM_BASES } from 'F:/dsh-work/zhuoxian/src/data/bases.ts';
import { AFFIXES } from 'F:/dsh-work/zhuoxian/src/data/affixes.ts';

const s = createSession({ classId: 'yujian', seed: 20261021, tables: { bases: ITEM_BASES, affixes: AFFIXES }, autoTalents: true });
startWave(s);
const DT = 1 / 30;

// 跑到第 2 层（一路正常战斗，不许作弊）
let steps = 0;
const limit = Math.round((30 * 60) / DT);
while (s.floor < 2 && steps < limit) {
  tickSession(s, DT);
  steps++;
}
console.log(JSON.stringify({
  phase: 'reach-floor2',
  floor: s.floor,
  minutes: +((steps * DT) / 60).toFixed(1),
  max: highestFloorReached(s),
  selMax: floorSelectableMax(s),
  deaths: s.battle.deaths,
  firstCleared: s.firstClearedFloors,
}));

const back = setFloor(s, 1);
const afterBack = { ok: back, floor: s.floor, selMax: floorSelectableMax(s), wave: s.wave };
console.log(JSON.stringify({ phase: 'back-to-1', ...afterBack }));

// 回刷到第 1 层后还要能再回第 2 层（这是「回刷不会锁死」的关键）
const fwd = setFloor(s, 2);
console.log(JSON.stringify({ phase: 'forward-again', ok: fwd, floor: s.floor, selMax: floorSelectableMax(s) }));

// 回刷后再打一会儿，确认没有 NaN / 怪不越界
for (let i = 0; i < 60 * 30; i++) tickSession(s, DT);
const ok = Number.isFinite(s.character.xp) && s.battle.monsters.every((m) => Number.isFinite(m.hp));
console.log(JSON.stringify({ phase: 'run-after-switch', sane: ok, floor: s.floor, wave: s.wave, kills: s.battle.kills, drops: s.dropsFound }));

const verdict = back === true && fwd === true && ok === true;
console.log(verdict ? 'VERDICT: PASS 回刷正向路径成立' : 'VERDICT: FAIL');
process.exitCode = verdict ? 0 : 1;
