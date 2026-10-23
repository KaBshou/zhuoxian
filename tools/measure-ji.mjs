// D149 待查：`疾行 speed +50%` 对击杀率到底有没有正贡献？
//
// 怀疑（shuzhi）：它只让怪更快贴脸、更快挨打 —— 玩家 DPS 不变 ⇒ 击杀率不变，
// 只是把「怪进入玩家射程」的时间缩短，从而**提高接触率**（承伤↑）。
// 判据不是「数值对不对」，而是「改 `speedInc` 时，击杀率 / 死亡 / 承伤 是否单调变化」。
//
// 口径：12 预注册种子（base 2026 / step 1013，与其他门禁同集）× 300min × cycle 0，
// 场次与门禁一致（--talents=off 不用管，本脚本不跑天赋）。
// 三个量：击杀/分（产出）、死亡（威胁）、承伤/kill（接触率代理）。
import fs from 'node:fs';
import { openSrc } from './vite-loader.mjs';
import { runInstrumentedSession } from './session-runner.mjs';

const SEEDS = Number(process.argv.find((a) => a.startsWith('--seeds='))?.split('=')[1] ?? 12);
const MINUTES = Number(process.argv.find((a) => a.startsWith('--minutes='))?.split('=')[1] ?? 300);
const LABEL = process.argv.find((a) => a.startsWith('--label='))?.split('=')[1] ?? 'variant';
const BASE_SEED = 2026;
const SEED_STEP = 1013;

const f = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—');
const med = (xs) => {
  const a = xs.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return NaN;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

const { load, close } = await openSrc();
try {
  const sessionMod = await load('src/core/session.ts');
  const craftMod = await load('src/core/crafting.ts');
  const progMod = await load('src/core/progression.ts');
  const { ITEM_BASES } = await load('src/data/bases.ts');
  const { AFFIXES } = await load('src/data/affixes.ts');
  const monstersMod = await load('src/data/monsters.ts');
  const offlineMod = await load('src/core/offline.ts');
  const inventoryMod = await load('src/core/inventory.ts');
  const affixesMod = await load('src/data/monster-affixes.ts');
  const { getMonsterAffix } = affixesMod;
  const TABLES = { bases: ITEM_BASES, affixes: AFFIXES };
  const mods = { sessionMod, craftMod, progMod, monstersMod, offlineMod, inventoryMod };

  const rows = [];
  for (let i = 0; i < SEEDS; i++) {
    const seed = BASE_SEED + i * SEED_STEP;
    const r = runInstrumentedSession(mods, {
      classId: 'yujian',
      seed,
      tables: TABLES,
      minutes: MINUTES,
      cycle: 0,
      dt: 1 / 30,
    });
    rows.push({
      seed,
      kills: r.kills,
      minutes: r.minutes ?? MINUTES,
      deaths: r.deaths,
      damageTaken: r.battle?.damageTaken ?? r.damageTaken ?? NaN,
      floor: r.floor,
    });
  }
  const killsPerMin = rows.map((r) => r.kills / r.minutes);
  const perKill = rows.map((r) => (r.kills > 0 ? r.damageTaken / r.kills : NaN));
  const ji = getMonsterAffix('ji');
  fs.writeFileSync(`tmp/ji-${LABEL}.json`, JSON.stringify({ label: LABEL, speedInc: ji?.speedInc, rows }, null, 1));
  console.log(
    `[${LABEL}] speedInc=${ji?.speedInc} ｜ 击杀/分 中位 ${f(med(killsPerMin))}（min ${f(Math.min(...killsPerMin))} / max ${f(Math.max(...killsPerMin))}）` +
      ` ｜ 死亡 中位 ${f(med(rows.map((r) => r.deaths)))}（合计 ${rows.reduce((a, r) => a + r.deaths, 0)}）` +
      ` ｜ 承伤/kill 中位 ${f(med(perKill))}`,
  );
  console.log(
    `[${LABEL}] 逐种子 击杀/分: ${killsPerMin.map((x) => f(x, 1)).join(' ')}`,
  );
} finally {
  await close();
}
