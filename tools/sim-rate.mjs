/**
 * 一局游戏的产出速率标定 —— 用真实 tick 跑，不看公式。
 *
 * 为什么必须真跑：模型算出来的"每分钟掉几件"和实际差过 8~16 倍（idle-grim 的教训）。
 * 这里跑 10 分钟游戏时间 × 5 个种子，数真实产出。
 *
 * 输出对齐 `docs/BALANCE.md` 表 A / 表 C 的验收口径：**按层**汇总
 * 波次 / 击杀 / 掉落 / 入伤 / 死亡，便于逐层和标定目标比对。
 *
 * 载入方式：用 vite 的 ssrLoadModule 加载 src/*.ts。
 * 不能直接 `import '../src/core/session.ts'` —— src 内部是**无扩展名**相对导入
 * （`from './battle'`），Node 直接跑 .mjs 会 ERR_MODULE_NOT_FOUND。
 * 这里用 middlewareMode + 关闭 watcher，避免和 dev server 抢锁（EBUSY）。
 *
 * 用法：node tools/sim-rate.mjs
 */

import { createServer } from 'vite';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const MINUTES = 10;
const SEEDS = [1, 2, 3, 4, 5];
const DT = 1 / 60;

/** BALANCE 表 A / §3 的标定目标 */
const TARGET = {
  waveSeconds: 75, // 60~90 秒
  killsPerMin: 6.4, // 8 只 / 75 秒 = 384 只/小时
  dropPerMin: 4, // 4 次/分钟（法宝 1.6 + 通货 1.9 + 玉简 0.5）
  damageTakenPerWave: 24, // 层 1 每波入伤 = 初始气血 100 的 24%
};

const server = await createServer({
  root: ROOT,
  configFile: false,
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, watch: null, hmr: false, open: false },
});

const { createSession, startWave, tickSession } = await server.ssrLoadModule('/src/core/session.ts');
const { AFFIXES } = await server.ssrLoadModule('/src/data/affixes.ts');
const { ITEM_BASES } = await server.ssrLoadModule('/src/data/bases.ts');

const TABLES = { bases: ITEM_BASES, affixes: AFFIXES };
const steps = Math.round((MINUTES * 60) / DT);
const seeds = [];

for (const seed of SEEDS) {
  const s = createSession({ classId: 'yujian', seed, tables: TABLES });
  startWave(s);

  /** @type {Map<number, {seconds:number, waves:number, kills:number, drops:number, taken:number, deaths:number}>} */
  const byFloor = new Map();
  let prevFloor = s.floor;
  let prevWave = s.wave;
  let prevKills = s.battle.kills;
  let prevDrops = s.dropsFound;
  let prevTaken = s.battle.damageTaken;
  let prevDeaths = s.battle.deaths;

  const row = (floor) => {
    let r = byFloor.get(floor);
    if (!r) {
      r = { seconds: 0, waves: 0, kills: 0, drops: 0, taken: 0, deaths: 0 };
      byFloor.set(floor, r);
    }
    return r;
  };

  for (let i = 0; i < steps; i += 1) {
    const before = s.floor;
    tickSession(s, DT);
    // 本帧算在「进入这帧时的层」上，避免下潜瞬间把时间算到新层
    const r = row(before);
    r.seconds += DT;
    r.kills += s.battle.kills - prevKills;
    r.drops += s.dropsFound - prevDrops;
    r.taken += s.battle.damageTaken - prevTaken;
    r.deaths += s.battle.deaths - prevDeaths;
    r.waves += s.wave - prevWave;
    if (s.floor !== before) r.waves = Math.max(0, r.waves); // 下潜那帧的波数仍算旧层
    prevFloor = s.floor;
    prevWave = s.wave;
    prevKills = s.battle.kills;
    prevDrops = s.dropsFound;
    prevTaken = s.battle.damageTaken;
    prevDeaths = s.battle.deaths;
    void prevFloor;
  }

  seeds.push({ seed, byFloor, snap: s });
}

// ── 汇总：跨种子按层合并 ────────────────────────────────────
/** @type {Map<number, {seconds:number, waves:number, kills:number, drops:number, taken:number, deaths:number}>} */
const total = new Map();
for (const s of seeds) {
  for (const [floor, r] of s.byFloor) {
    let t = total.get(floor);
    if (!t) {
      t = { seconds: 0, waves: 0, kills: 0, drops: 0, taken: 0, deaths: 0 };
      total.set(floor, t);
    }
    t.seconds += r.seconds;
    t.waves += r.waves;
    t.kills += r.kills;
    t.drops += r.drops;
    t.taken += r.taken;
    t.deaths += r.deaths;
  }
}

const f = (n) => (Number.isFinite(n) ? Number(n.toFixed(2)) : 0);
const lines = [];
lines.push(`# 一局产出速率标定 · ${MINUTES} 分钟 × ${SEEDS.length} 种子（真实 tick）`);
lines.push('');
lines.push('| 层 | 波次 | 击杀 | 掉落 | 平均一波(s) | 击杀/min | 掉落/min | 入伤合计 | 入伤/波 | 入伤/s | 死亡 |');
lines.push('|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
const ordered = [...total.entries()].sort((a, b) => a[0] - b[0]);
for (const [floor, r] of ordered) {
  const waves = r.waves || 0;
  const seconds = r.seconds || 1;
  lines.push(
    `| ${floor} | ${waves} | ${r.kills} | ${r.drops} | ${f(seconds / Math.max(1, waves))} | ` +
      `${f(r.kills / (seconds / 60))} | ${f(r.drops / (seconds / 60))} | ${Math.round(r.taken)} | ` +
      `${f(r.taken / Math.max(1, waves))} | ${f(r.taken / seconds)} | ${r.deaths} |`,
  );
}

lines.push('');
lines.push('## 标定目标（BALANCE 表 A / §3）');
lines.push('');
lines.push(`- 一波 **${TARGET.waveSeconds}s**（60~90 算合格）`);
lines.push(`- 击杀 **${TARGET.killsPerMin}/min**（8 只 / 75 秒 = 384 只/小时）`);
lines.push(`- 掉落 **${TARGET.dropPerMin}/min** 总次数（法宝 1.6 + 通货 1.9 + 玉简 0.5）；本作目前只实现法宝`);
lines.push(`- 层 1 入伤 **${TARGET.damageTakenPerWave}/波**（= 初始气血 100 的 24%）`);
lines.push('');
lines.push('## 判定（偏差 > 20% 即不合格，先调系数不调结构）');
lines.push('');
for (const [floor, r] of ordered) {
  const waves = r.waves || 0;
  const seconds = r.seconds || 1;
  const waveSec = seconds / Math.max(1, waves);
  const kpm = r.kills / (seconds / 60);
  const dpm = r.drops / (seconds / 60);
  const dtpw = r.taken / Math.max(1, waves);
  const dev = (actual, target) => `${f(((actual - target) / target) * 100)}%`;
  lines.push(
    `- 层 ${floor}：一波耗时 ${f(waveSec)}s（${dev(waveSec, TARGET.waveSeconds)}）· ` +
      `击杀 ${f(kpm)}/min（${dev(kpm, TARGET.killsPerMin)}）· ` +
      `掉落 ${f(dpm)}/min（${dev(dpm, TARGET.dropPerMin)}）· ` +
      `入伤 ${f(dtpw)}/波（${dev(dtpw, TARGET.damageTakenPerWave)}）`,
  );
}

lines.push('');
lines.push('## 每种子快照');
lines.push('');
for (const { seed, snap } of seeds) {
  lines.push(
    `- seed ${seed}：波次 ${snap.wave} · 层 ${snap.floor} · 击杀 ${snap.battle.kills} · ` +
      `掉落 ${snap.dropsFound} · 死亡 ${snap.battle.deaths} · 台阶 ${snap.character.step} · ` +
      `背包 ${snap.bag.length} · 装备 ${Object.keys(snap.character.equipment).length}`,
  );
}

console.log(lines.join('\n'));

await server.close();
