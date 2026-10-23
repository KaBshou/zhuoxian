// 生成两张「部位基准表」——两者都由本脚本产出，因为它们必须同源失效。
//
// ① tools/slot-power-base.json：每部位在给定灵蕴下，一件**宝品**的 itemPower 中位。
//    用途 = shuzhi 定的段② 判据 C 的分母（`tools/session-runner.mjs` 读它）。
// ② src/data/slot-power-table.json：同上的宝品中位 + 每部位 × 每品阶的 p10/p50/p90。
//    用途 = 玩家在面板上看到的「1.03×（宝品 · 前 30%）」（`src/core/power-rank.ts` 读它）。
//
// 为什么第二张也要这个脚本产出（D89 口径 2）：分位表如果手抄或另写一个脚本，
// 它就一定会和判据 C 的分母脱钩，而**基表失效是静默的**（§5.4.3 的教训：
// 分母失真不报错，只让判据悄悄变宽或变窄）。
//
// 重跑条件（动任何一个都必须重跑本脚本）：
//   `src/data/bases.ts` 的基底 / `src/data/affixes.ts` 的灵纹表 /
//   `src/core/item.ts` 的 itemPower 权重 / loot 的稀有度权重。
import fs from 'node:fs';
import path from 'node:path';
import { openSrc } from './vite-loader.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_BASE = path.join(ROOT, 'tools/slot-power-base.json');
const OUT_SRC = path.join(ROOT, 'src/data/slot-power-table.json');
const SLOTS = ['sword', 'relic', 'crown', 'robe', 'bracer', 'boots', 'belt', 'ring', 'pendant'];
const ILVL_STEP = 4;
const SAMPLES = 200;
/** 分位表的抽样量：撑 2% 的仙品也有 ~80 个样本 */
const QUANT_SAMPLES = 4000;
const RARITIES = ['fan', 'ling', 'bao', 'xian'];

const { load, close } = await openSrc();
try {
  const { ITEM_BASES } = await load('src/data/bases.ts');
  const { AFFIXES } = await load('src/data/affixes.ts');
  const { rollLoot } = await load('src/core/loot.ts');
  const { itemPower } = await load('src/core/inventory.ts');
  const { Rng } = await load('src/core/rng.ts');

  const median = (a) => {
    const s = [...a].sort((x, y) => x - y);
    return s[Math.floor(s.length / 2)];
  };
  const quantile = (a, q) => {
    if (a.length === 0) return 0;
    const s = [...a].sort((x, y) => x - y);
    const i = Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * q)));
    return s[i];
  };

  const grid = [];
  for (let ilvl = ILVL_STEP; ilvl <= 99; ilvl += ILVL_STEP) grid.push(ilvl);

  const slotBase = {};
  const quantiles = {};
  const t0 = Date.now();
  for (const slot of SLOTS) {
    // ① 宝品中位：种子与抽样流程保持与上一版**逐位一致**，
    //    否则这张表一变，段②/满级门禁全部漂移（历史验收作废）。
    slotBase[slot] = grid.map((ilvl) => {
      const rng = new Rng(0x5eed + ilvl * 131 + slot.length * 17);
      const vals = [];
      let guard = 0;
      while (vals.length < SAMPLES && guard < 200000) {
        guard += 1;
        const res = rollLoot(rng, ITEM_BASES, AFFIXES, { ilvl, rarityBonus: 0, slot });
        if (res.rarity === 'bao') vals.push(itemPower(res.item));
      }
      return Number(median(vals).toFixed(3));
    });

    // ② 分位：另一个独立种子（不能污染上面的抽序），按实际抽到的品阶分桶。
    quantiles[slot] = {};
    for (const rarity of RARITIES) {
      const p10 = [];
      const p50 = [];
      const p90 = [];
      const counts = [];
      for (const ilvl of grid) {
        const rng = new Rng(0x9a11 + ilvl * 977 + slot.length * 31);
        const vals = [];
        for (let i = 0; i < QUANT_SAMPLES; i++) {
          const res = rollLoot(rng, ITEM_BASES, AFFIXES, { ilvl, rarityBonus: 0, slot });
          if (res.rarity === rarity) vals.push(itemPower(res.item));
        }
        counts.push(vals.length);
        p10.push(Number(quantile(vals, 0.1).toFixed(3)));
        p50.push(Number(quantile(vals, 0.5).toFixed(3)));
        p90.push(Number(quantile(vals, 0.9).toFixed(3)));
      }
      quantiles[slot][rarity] = {
        // 样本不足的档（低灵蕴的仙品）标记出来，运行时据此决定显不显示分位
        minCount: Math.min(...counts),
        p10,
        p50,
        p90,
      };
    }
  }

  const basePayload = {
    note: '宝品 itemPower 中位（每格 SAMPLES 件），按灵蕴分档；运行时线性插值。改动 bases/affixes/itemPower/loot 权重后必须重跑 tools/gen-slot-base.mjs',
    ilvlStep: ILVL_STEP,
    samples: SAMPLES,
    grid,
    slots: slotBase,
  };
  fs.writeFileSync(OUT_BASE, JSON.stringify(basePayload, null, 0) + '\n', 'utf8');

  const srcPayload = {
    note: '由 tools/gen-slot-base.mjs 生成，不要手改。slotBase = 宝品 itemPower 中位（= 判据 C 的分母）；quantiles = 各品阶 p10/p50/p90（面板显示「宝品 · 前 30%」用）。改 bases/affixes/itemPower/loot 权重后必须重跑。',
    ilvlStep: ILVL_STEP,
    quantSamples: QUANT_SAMPLES,
    grid,
    slotBase,
    quantiles,
  };
  fs.writeFileSync(OUT_SRC, JSON.stringify(srcPayload, null, 0) + '\n', 'utf8');

  console.log(`ok: ${OUT_BASE}`);
  console.log(`ok: ${OUT_SRC}`);
  console.log(`  ${grid.length} 档 × ${SLOTS.length} 部位，分位抽样 ${QUANT_SAMPLES}/格，耗时 ${Date.now() - t0}ms`);
  for (const slot of SLOTS) {
    const row = slotBase[slot];
    console.log(`${slot.padEnd(8)} ilvl${grid[0]}=${String(row[0]).padStart(7)} … ilvl99=${String(row[row.length - 1]).padStart(8)}`);
  }
  const xianCounts = SLOTS.map((s) => quantiles[s].xian.minCount);
  console.log(`  仙品最小样本数（各部位）：${xianCounts.join(' / ')}`);
} finally {
  await close();
}
