// D95 诊断：按稀有度分解「每杀法宝数」，确认妖纹上线后法宝 −3% 的原因
// shuzhi 期望（band 按停留权重）：normal 0.112 / magic 0.149 / rare 0.221
// 判读：
//   ① 若 magic/rare 的 法宝/kill 明显低于期望 → 份额被 q 挤压（贪婪 0.12 太大 / cap 0.24 太大）
//   ② 若 normal 行也低于 0.112 → 多掷了一次 gate（bug）
//   ③ 若稀有度占比远低于设计（magic 10% / rare 2%）→ 分层停留权重问题
import { openSrc } from './vite-loader.mjs';
import { runInstrumentedSession } from './session-runner.mjs';

const SEEDS = [20261021, 20262034, 20263047, 20265073, 20266086, 20267099];
const MINUTES = Number(process.argv[2] ?? 900);

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

  const sum = { normal: 0, magic: 0, rare: 0, boss: 0 };
  const items = { normal: 0, magic: 0, rare: 0, boss: 0 };
  const cur = { normal: 0, magic: 0, rare: 0, boss: 0 };
  const gem = { normal: 0, magic: 0, rare: 0, boss: 0 };
  let minutes = 0;

  for (const seed of SEEDS) {
    const r = runInstrumentedSession(mods, {
      classId: 'yujian',
      seed,
      tables: { bases: ITEM_BASES, affixes: AFFIXES },
      minutes: MINUTES,
      dt: 1 / 30,
      stopAtMaxStep: false,
      postCap: true,
      autoTalents: false,
    });
    const d = r.diag;
    for (const k of ['normal', 'magic', 'rare', 'boss']) {
      sum[k] += d.killsByRarity[k];
      items[k] += d.itemsByRarity[k];
      cur[k] += d.currencyByRarity[k];
      gem[k] += d.gemByRarity[k];
    }
    minutes += r.minutes;
  }

  const totalKills = sum.normal + sum.magic + sum.rare + sum.boss;
  const totalItems = items.normal + items.magic + items.rare + items.boss;
  const totalCur = cur.normal + cur.magic + cur.rare + cur.boss;
  const totalGem = gem.normal + gem.magic + gem.rare + gem.boss;
  const totalGated = totalItems + totalCur + totalGem;

  console.log(`\n=== ${SEEDS.length} 种子 × ${MINUTES}min（合计 ${(minutes / 60).toFixed(1)}h）===`);
  console.log('\n## 每杀法宝数（分稀有度）');
  console.log('| 稀有度 | 击杀 | 占比 | 法宝/kill | 期望 | 偏差 | 通货/kill | 玉简/kill |');
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|');
  const EXPECT = { normal: 0.112, magic: 0.149, rare: 0.221, boss: NaN };
  for (const k of ['normal', 'magic', 'rare', 'boss']) {
    const kill = sum[k];
    const per = kill ? items[k] / kill : 0;
    const exp = EXPECT[k];
    const dev = Number.isFinite(exp) && exp > 0 ? `${(((per - exp) / exp) * 100).toFixed(1)}%` : '—';
    console.log(
      `| ${k} | ${kill} | ${((kill / totalKills) * 100).toFixed(1)}% | ${per.toFixed(4)} | ${Number.isFinite(exp) ? exp.toFixed(3) : '—'} | ${dev} | ${(kill ? cur[k] / kill : 0).toFixed(4)} | ${(kill ? gem[k] / kill : 0).toFixed(4)} |`,
    );
  }
  console.log(
    `\n合计：击杀 ${totalKills}（${(totalKills / minutes).toFixed(2)}/分）｜法宝 ${totalItems}（${(totalItems / minutes).toFixed(3)}/分，按杀 ${(totalItems / totalKills).toFixed(4)}）｜通货 ${totalCur}｜玉简 ${totalGem}`,
  );

  // 份额分解：闸后三分类，按稀有度看实际分流比例
  console.log('\n## 闸后三分类份额（每杀）');
  console.log('| 稀有度 | 闸通过率 | 通货份额 | 玉简份额 | 法宝份额 |');
  console.log('|---|---:|---:|---:|---:|---:|');
  for (const k of ['normal', 'magic', 'rare', 'boss']) {
    const kill = sum[k];
    if (!kill) continue;
    const gated = cur[k] + gem[k] + items[k];
    const total = gated + (kill - gated) * 0; // 闸未过不进分母
    console.log(
      `| ${k} | ${((gated / kill) * 100).toFixed(1)}% | ${((cur[k] / kill) * 100).toFixed(1)}% | ${((gem[k] / kill) * 100).toFixed(1)}% | ${((items[k] / kill) * 100).toFixed(1)}% |`,
    );
    void total;
  }
  const gatedAll = totalGated;
  console.log(
    `\n全局：闸通过率 ${((gatedAll / totalKills) * 100).toFixed(1)}% ｜通货 ${((totalCur / totalKills) * 100).toFixed(1)}% ｜玉简 ${((totalGem / totalKills) * 100).toFixed(1)}% ｜法宝 ${((totalItems / totalKills) * 100).toFixed(1)}%`,
  );
  console.log(
    '\n判读：normal 行 法宝/kill 应 ≈ 0.112（0.40 × 0.28）。若 magic/rare 明显偏低 → q 挤压份额（改 贪婪/cap）；若 normal 也偏低 → 多掷了一次闸（bug）。',
  );
} finally {
  await close();
}
