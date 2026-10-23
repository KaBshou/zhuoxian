// 诊断：段②「成型档」（10 部位同时宝品以上且 ≥1 条灵纹）到底怎么爬升的。
// 起因：修完两个真 bug（自动换装同部位比 / 灭灵石只灭满条）后，3 种子 900min 从 0/3 → 1/3，
// 需要一条「宝品以上部位数 vs 分钟」的曲线来判断：
//   (a) 只是种子运气（曲线都过 10 但时间点不同）→ 放宽窗口或改判据
//   (b) 结构性到不了（曲线在 7~8 处长期平台）→ 稀有度曲线 / 掉落量问题
import { openSrc } from './vite-loader.mjs';
import { runInstrumentedSession } from './session-runner.mjs';

const { load, close } = await openSrc();
try {
  const sessionMod = await load('src/core/session.ts');
  const craftMod = await load('src/core/crafting.ts');
  const progMod = await load('src/core/progression.ts');
  const { ITEM_BASES } = await load('src/data/bases.ts');
  const { AFFIXES } = await load('src/data/affixes.ts');
  const monstersMod = await load('src/data/monsters.ts');
  const offlineMod = await load('src/core/offline.ts');
  const mods = { sessionMod, craftMod, progMod, monstersMod, offlineMod };

  for (const seed of [20261021, 20262034, 20263047]) {
    const r = runInstrumentedSession(mods, {
      classId: 'yujian',
      seed,
      tables: { bases: ITEM_BASES, affixes: AFFIXES },
      minutes: 540,
      dt: 0.1,
      stopAtMaxStep: false,
      postCap: true,
      autoTalents: true,
    });
    const fmt = (v) => (Number.isFinite(v) ? v.toFixed(1) + 'min' : '未达成');
    console.log(`\n=== seed ${seed}  满级 ${r.maxedAt?.toFixed(1)}min`);
    console.log(`    判据(宝品+/10) ${fmt(r.formedAt)}  判据A(件件≥2纹) ${fmt(r.formedAffixAt)}  判据B(件件ilvl≥90) ${fmt(r.ilvl90At)} ===`);
    const trail = r.gearTrail ?? [];
    for (const g of trail) {
      const bar = '#'.repeat(g.baoPlus) + '.'.repeat(Math.max(0, 10 - g.baoPlus));
      console.log(
        `  ${String(g.minute).padStart(4)}min  宝品以上 ${bar} ${String(g.baoPlus).padStart(2)}/10  仙品 ${g.xianCount}  带灵纹 ${g.withAffix}/10`,
      );
    }
  }
} finally {
  await close();
}
