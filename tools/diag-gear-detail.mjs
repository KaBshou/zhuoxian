// 一次性诊断：满级/长时间挂机之后，身上每个槽到底是什么东西。
// 触发原因：run-timeline 的 gear 快照里出现 `relic:xian/0`（仙品 0 条灵纹）
// 和 `crown:空` —— 仙品按定义应该 4 条灵纹，0 条说明这件东西不是正常掉落物。
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
  const TABLES = { bases: ITEM_BASES, affixes: AFFIXES };
  const mods = { sessionMod, craftMod, progMod, monstersMod, offlineMod };

  const r = runInstrumentedSession(mods, {
    classId: 'yujian',
    seed: 20262034,
    tables: TABLES,
    talentIds: null,
    autoTalents: true,
    minutes: 480,
    dt: 0.25,
    stopAtMaxStep: false,
    postCap: true,
    farmMode: 'off',
    farmFrom: 1,
  });

  console.log(`满级 ${r.maxedAt?.toFixed?.(1) ?? r.maxedAt} min，终点 ${r.minutes.toFixed(1)} min`);
  void progMod;
  const gear = r.atMax ? r.atMax.gear : r.gear;
  if (!gear) {
    console.log('没有 gear 快照');
  } else {
    for (const g of gear) {
      console.log(
        `${g.slot.padEnd(8)} rarity=${String(g.rarity).padEnd(6)} affixes=${g.affixes} ilvl=${String(g.ilvl).padEnd(4)} name=${g.name}`,
      );
    }
  }
} finally {
  await close();
}
