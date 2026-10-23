/**
 * 一次性证据脚本（生成后即删）：打印「每层修为/分」标尺，证明 farm=best 为什么选那一层。
 * 用法：node tools\_xptable.mjs
 */
import { openSrc } from './vite-loader.mjs';
import { xpPerMinuteOfFloorWith } from './session-runner.mjs';

const { load, close } = await openSrc();
try {
  const offlineMod = await load('src/core/offline.ts');
  const monstersMod = await load('src/data/monsters.ts');
  const mods = { offlineMod, monstersMod };
  const rows = [];
  for (let f = 1; f <= monstersMod.MAX_FLOOR; f++) {
    rows.push({
      floor: f,
      tier: monstersMod.tierOfFloor(f),
      kills: offlineMod.killsPerMinute(f),
      xp: xpPerMinuteOfFloorWith(mods, f),
    });
  }
  const best = rows.reduce((a, b) => (b.xp > a.xp ? b : a), rows[0]);
  console.log('层 | 阶 | 击杀/min | 修为/min');
  console.log('---:|---:|---:|---:');
  for (const r of rows) {
    const mark = r.floor === best.floor ? '  ← 全表最高' : '';
    console.log(`${r.floor} | ${r.tier} | ${r.kills.toFixed(1)} | ${Math.round(r.xp)}${mark}`);
  }
  console.log(`\nargmax = 层 ${best.floor}（${Math.round(best.xp)} 修为/分）；层 27 = ${Math.round(rows[26].xp)}`);
  const t3 = rows.filter((r) => r.tier === 3);
  console.log(`三阶内最高 = 层 ${t3.reduce((a, b) => (b.xp > a.xp ? b : a), t3[0]).floor}`);
} finally {
  await close();
}
