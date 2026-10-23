// 诊断：判据 C（成型档）到底卡在哪个部位。
// 背景（D61~D65 之后）：
//   seed 20261021 成型 200.9min（满级 345.4）✓
//   seed 20262034 成型 353.4min（满级 323.2）→ **满级后才成型，结构性错误**
//   seed 20263047 成型 246.9min（满级 335.0）✓
// 要回答：是「10 个部位都差一点」，还是「9 个都过线、某 1 个部位被运气卡住」。
// 这两者的修法完全不同：前者是判据/掉落量问题，后者是「最差部位」这种 max-of-10 统计量
// 天生脆弱 —— 要么放宽到 9/10，要么承认成型时刻由最倒霉的部位决定。
import { openSrc } from './vite-loader.mjs';
import { runInstrumentedSession } from './session-runner.mjs';

const { load, close } = await openSrc();
try {
  const sessionMod = await load('src/core/session.ts');
  const craftMod = await load('src/core/crafting.ts');
  const progMod = await load('src/core/progression.ts');
  const inventoryMod = await load('src/core/inventory.ts');
  const { ITEM_BASES } = await load('src/data/bases.ts');
  const { AFFIXES } = await load('src/data/affixes.ts');
  const monstersMod = await load('src/data/monsters.ts');
  const offlineMod = await load('src/core/offline.ts');
  const mods = { sessionMod, craftMod, progMod, monstersMod, offlineMod, inventoryMod };

  for (const seed of [20261021, 20262034, 20263047]) {
    const r = runInstrumentedSession(mods, {
      classId: 'yujian',
      seed,
      tables: { bases: ITEM_BASES, affixes: AFFIXES },
      minutes: 420,
      dt: 1 / 30,
      stopAtMaxStep: false,
      postCap: true,
      autoTalents: false,
    });
    const fmt = (v) => (Number.isFinite(v) ? `${v.toFixed(1)}min` : '未达成');
    console.log(`\n=== seed ${seed}  满级 ${Number.isFinite(r.maxedAt) ? r.maxedAt.toFixed(1) + 'min' : '未满级'}  成型 ${fmt(r.formedPowerAt)}  终局最差比 ${r.minPowerRatio?.toFixed(3)}`);
    for (const g of r.gearTrail ?? []) {
      const passed = Object.values(g.ratios ?? {}).filter((x) => x >= 1).length;
      const worst = g.worstSlot ?? '—';
      const wr = Number.isFinite(g.worstRatio) ? g.worstRatio.toFixed(2) : '—';
      const cells = Object.entries(g.ratios ?? {})
        .map(([k, v]) => `${k.slice(0, 4)}=${v >= 1 ? '✓' : ' '}${v.toFixed(2)}`)
        .join(' ');
      console.log(`  ${String(g.minute).padStart(3)}min 过线 ${String(passed).padStart(2)}/10  最差 ${worst}@${wr}  ${cells}`);
    }
  }
} finally {
  await close();
}
