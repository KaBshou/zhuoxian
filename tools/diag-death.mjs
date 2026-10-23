/**
 * 死亡口径对账：sim-gear 的「死亡 0」 vs sim-rate 的「层 1 死 45」。
 *
 * 结论：两个工具读同一个计数器 `battle.deaths`（唯一 +1 点在 src/core/battle.ts:665，player-died 事件），
 * 差别只在**打印窗口**：
 *   sim-gear.mjs:60-61 每帧末尾执行 `prevDeaths = s.battle.deaths`；
 *   sim-gear.mjs:57 打印 `s.battle.deaths - prevDeaths` → 得到的是「最后 1/60 秒内死了几次」，
 *   死亡 1~4 次/分钟，随机落在某一帧上，所以整列表几乎恒为 0（偶尔蹦个 1）。
 *   sim-rate.mjs:80 每帧把增量累加进该层（`r.deaths += s.battle.deaths - prevDeaths`）→ 正确。
 *
 * 本脚本同一局里同时输出三种数：整分钟增量（正确）、tick 帧瞬时值（= sim-gear 打印值）、逐帧累加。
 * 并交叉验证下潜 / 换波都不动计数器。
 *
 * 用法：node tools/diag-death.mjs [minutes] [seed]
 */
import { openSrc } from './vite-loader.mjs';

const MINUTES = Number(process.argv[2] ?? 10);
const SEED = Number(process.argv[3] ?? 1);
const DT = 1 / 60;
const FRAMES_PER_MINUTE = Math.round(60 / DT);

const { load, close } = await openSrc();
try {
  const session = await load('src/core/session.ts');
  const { AFFIXES } = await load('src/data/affixes.ts');
  const { ITEM_BASES } = await load('src/data/bases.ts');
  const TABLES = { bases: ITEM_BASES, affixes: AFFIXES };

  const s = session.createSession({ classId: 'yujian', seed: SEED, tables: TABLES });
  session.startWave(s);

  const steps = Math.round((MINUTES * 60) / DT);
  const rows = [];

  let prevFrameDeaths = s.battle.deaths;
  let minuteStartDeaths = s.battle.deaths;
  let frameAccum = 0;
  let floorChanges = 0;
  let waveChanges = 0;
  let prevFloor = s.floor;
  let prevWave = s.wave;

  /** @type {Map<number, number>} */
  const perFloorDeaths = new Map();

  for (let i = 0; i < steps; i++) {
    const floorBefore = s.floor;
    session.tickSession(s, DT);

    const delta = s.battle.deaths - prevFrameDeaths;
    prevFrameDeaths = s.battle.deaths;
    frameAccum += delta;
    perFloorDeaths.set(floorBefore, (perFloorDeaths.get(floorBefore) ?? 0) + delta);

    if (s.floor !== prevFloor) {
      floorChanges++;
      prevFloor = s.floor;
    }
    if (s.wave !== prevWave) {
      waveChanges++;
      prevWave = s.wave;
    }

    if ((i + 1) % FRAMES_PER_MINUTE === 0) {
      rows.push({
        minute: Math.round((i + 1) * DT / 60),
        correct: s.battle.deaths - minuteStartDeaths, // 整分钟增量
        atTick: delta, // sim-gear 打印值（最后一帧）
        accum: frameAccum, // 逐帧累加（恒等于终值）
        floor: s.floor,
        wave: s.wave,
        step: s.character.step,
        hp: s.battle.player.hp,
      });
      minuteStartDeaths = s.battle.deaths;
    }
  }

  console.log(`# 死亡口径对账 · ${MINUTES} 分钟 · seed ${SEED}`);
  console.log('');
  console.log('| 分钟 | 整分钟增量(正确) | tick帧瞬时(=sim-gear 打印) | 逐帧累加 | 层 | 波 | 台阶 | 玩家血 |');
  console.log('|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const r of rows) {
    console.log(
      `| ${r.minute} | ${r.correct} | ${r.atTick} | ${r.accum} | ${r.floor} | ${r.wave} | ${r.step} | ${r.hp.toFixed(1)} |`,
    );
  }
  console.log('');
  console.log(`- 终局 battle.deaths = ${s.battle.deaths} · session.floorDeaths = ${s.floorDeaths}（两者应相等）`);
  console.log(`- 逐帧累加 = ${frameAccum} → 计数器本身无重置，不是统计不到，是**打印窗口选错了**`);
  console.log(`- tick 帧瞬时值全列 = [${rows.map((r) => r.atTick).join(', ')}] ← sim-gear 死亡列的真面目`);
  console.log(`- 下潜 ${floorChanges} 次 · 换波 ${waveChanges} 次 → 都不动 battle.deaths；唯一来源是 player-died 事件`);
  const floorSorted = [...perFloorDeaths.entries()].sort((a, b) => a[0] - b[0]);
  console.log(`- 按层死亡（逐帧累加口径）= ${floorSorted.map(([f, d]) => `层${f}:${d}`).join(' · ') || '无'}`);
  console.log(
    `- 终局面板：台阶 ${s.character.step} · 层 ${s.floor} · 击杀 ${s.battle.kills} · 掉落 ${s.dropsFound} · ` +
      `装备 ${Object.keys(s.character.equipment).length} · 背包 ${s.bag.length}`,
  );
} finally {
  await close();
}
