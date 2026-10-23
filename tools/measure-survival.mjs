// D105 生存性度量（shuzhi §6.4）：
//   死亡数是 0/1 事件，零死亡区间里信息量为零 —— 所以要测「距离死亡有多远」和「已经受了多少伤」。
//
// 四个量：
//   ① 承伤率 μ = ΣdamageTaken / Σ(lifeMax·dt)，单位 %/s   ← **唯一主判据**
//   ② 致死倍率 K = 扫 atk-mul 到首例死亡的前一档          ← 零死亡时的区分器
//   ③ 入伤/波（记录项，和 §6 表 G 对齐）
//   ④ 护盾活性：回充段数/波、吸收占比                     ← D103 的专属验收
//
// 场景：层 27（主线末）与层 40（无尽中段），12 预注册种子（base 2026 / step 1013，与门禁同一集），
// 每种子 3 分钟。**窗口从「首次到达那一层」开始** —— 「典型装备」的唯一定义就是玩家第一次走到
// 那里时身上的东西；事后再回到层 27 量出来的是满级装备，只能证明「后期很安全」。
//
// 纪律：
//   - 必须时间积分，不许按波平均（死亡波会被漏掉，v4.2 的「atk-mul 翻倍反而更低」就是这么来的）；
//   - **首轮只建基线、不判红**：阈值是从回气率反推的，若实测与推导差 >2 倍，先查模型；
//   - `incomingMul` 只在这里设，玩法路径永远是 1。
import { openSrc } from './vite-loader.mjs';
import { runInstrumentedSession } from './session-runner.mjs';

const SEEDS = Number(process.argv.find((a) => a.startsWith('--seeds='))?.split('=')[1] ?? 12);
const MULS = (process.argv.find((a) => a.startsWith('--muls='))?.split('=')[1] ?? '1')
  .split(',')
  .map(Number)
  .filter((x) => Number.isFinite(x));
const FLOORS = [27, 40];
const WINDOW_MIN = 3;
const BASE_SEED = 2026;
const SEED_STEP = 1013;
const MINUTES = 600;

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
  const TABLES = { bases: ITEM_BASES, affixes: AFFIXES };
  const mods = { sessionMod, craftMod, progMod, monstersMod, offlineMod, inventoryMod };

  const rows = [];
  for (const mul of MULS) {
    for (let i = 0; i < SEEDS; i++) {
      const seed = BASE_SEED + i * SEED_STEP;
      const t0 = Date.now();
      const r = runInstrumentedSession(mods, {
        classId: 'yujian',
        seed,
        tables: TABLES,
        talentIds: null,
        autoTalents: false,
        minutes: MINUTES,
        dt: 1 / 30,
        stopAtMaxStep: false,
        postCap: false,
        farmMode: 'off',
        farmFrom: 1,
        survivalWindows: FLOORS,
        survivalMinutes: WINDOW_MIN,
        incomingMul: mul,
      });
      for (const s of r.survival ?? []) rows.push({ ...s, seed, mul, wall: Date.now() - t0 });
      const got = (r.survival ?? []).length;
      process.stdout.write(`mul=${mul} seed=${seed} 窗口 ${got}/${FLOORS.length}（${((Date.now() - t0) / 1000).toFixed(0)}s）\n`);
    }
  }

  const windowSeconds = WINDOW_MIN * 60;
  /** K = 1 / (μ% / 100 × 窗口秒数)：把怪物伤害乘多少倍才会在窗口内打死玩家。 */
  const deathMultiplier = (r) => {
    const mu = r.muPctPerSec;
    if (!Number.isFinite(mu) || mu <= 0) return Number.POSITIVE_INFINITY;
    return 100 / (mu * windowSeconds);
  };

  for (const floor of FLOORS) {
    console.log(`\n== 层 ${floor} · 窗口 ${WINDOW_MIN} 分钟 · ${SEEDS} 种子 ==`);
    console.log(
      '| atk-mul | 种子 | μ (%/s) | K（致死倍率） | 入伤/波 | 波 | 死亡 | maxHit | 还能挨几下 | 护盾段/波 | 吸收占比 |',
    );
    console.log('|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
    for (const r of rows.filter((x) => x.floor === floor)) {
      console.log(
        `| ${r.mul} | ${r.seed} | ${f(r.muPctPerSec)} | ${f(deathMultiplier(r))} | ${f(r.hitsPerWave, 1)} | ${r.waves} | ${r.deaths} | ${f(r.maxHit, 1)} | ${f(r.hitsToDie, 1)} | ${f(r.shieldPerWave, 2)} | ${f(r.shieldShare * 100, 1)}% |`,
      );
    }
    const base = rows.filter((x) => x.floor === floor && x.mul === 1);
    if (base.length) {
      const muMed = med(base.map((x) => x.muPctPerSec));
      const muMax = Math.max(...base.map((x) => x.muPctPerSec).filter(Number.isFinite));
      const waves = base.reduce((s, x) => s + (x.waves ?? 0), 0);
      const deaths = base.reduce((s, x) => s + (x.deaths ?? 0), 0);
      const shieldPerWave = waves > 0 ? base.reduce((s, x) => s + (x.shieldRecharges ?? 0), 0) / waves : NaN;
      const shieldShareMed = med(base.map((x) => x.shieldShare * 100));
      const hitsToDieMed = med(base.map((x) => x.hitsToDie));
      const kMed = med(base.map(deathMultiplier));
      const kMin = Math.min(...base.map(deathMultiplier).filter(Number.isFinite));
      console.log(
        `- 基线（mul=1，${base.length} 样本 / ${waves} 波）：**μ 中位 ${f(muMed)} %/s**（最差 ${f(muMax)}，黄线 ${f(muMed * 1.3)}）· ` +
          `死亡 ${deaths} · 护盾 回充 ${f(shieldPerWave, 2)} 段/波、吸收占比中位 ${f(shieldShareMed, 1)}% · 致死代理「还能挨几下」中位 ${f(hitsToDieMed, 1)} · **K 中位 ${f(kMed)}**（最险样本 ${f(kMin)}；K=1 表示窗口内正好被打死）`,
      );
    }
    // K：最高「零死亡」的 mul（0.5 精度由 MULS 决定）
    const zero = MULS.filter((m) => rows.filter((x) => x.floor === floor && x.mul === m).every((x) => (x.deaths ?? 0) === 0));
    if (zero.length) console.log(`- **K（零死亡的最高 atk-mul）**：${Math.max(...zero)}`);
    else console.log(`- **K**：即使 ${MULS[0]}× 也有死亡（K < ${MULS[0]}）`);
  }
  console.log('\n※ 首轮只建基线、不判红（D105）：阈值由回气率反推，实测与推导差 >2 倍时先查入伤模型。');
} finally {
  await close();
}
