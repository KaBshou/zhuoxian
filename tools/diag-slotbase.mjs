// 诊断：判据 C 的「部位基准」怎么算最省。
// shuzhi 定的判据 C = 每部位 itemPower ≥ 同部位「同灵蕴宝品中位」× 1.0。
// 真跑里 ilvl 会从 3 一路涨到 99，如果每个 ilvl 都现场抽样会太贵。
// 这里验证一个省事的假设：**itemPower 与灵蕴近似成正比**，
// 拿 ilvl 99 的基准按 ilvl/99 线性缩放即可（不用每个 ilvl 都抽）。
import { openSrc } from './vite-loader.mjs';

const { load, close } = await openSrc();
try {
  const { ITEM_BASES } = await load('src/data/bases.ts');
  const { AFFIXES } = await load('src/data/affixes.ts');
  const { rollLoot } = await load('src/core/loot.ts');
  const { itemPower } = await load('src/core/inventory.ts');
  const { Rng } = await load('src/core/rng.ts');

  const SLOTS = ['sword', 'relic', 'crown', 'robe', 'bracer', 'boots', 'belt', 'ring', 'pendant'];
  const ILVLS = [20, 40, 60, 80, 99];
  const median = (a) => {
    const s = [...a].sort((x, y) => x - y);
    return s.length === 0 ? NaN : s[Math.floor(s.length / 2)];
  };

  const table = new Map();
  for (const slot of SLOTS) {
    const row = [];
    for (const ilvl of ILVLS) {
      const rng = new Rng(900000 + ilvl * 31 + slot.length);
      const vals = [];
      let guard = 0;
      while (vals.length < 400 && guard < 200000) {
        guard += 1;
        const res = rollLoot(rng, ITEM_BASES, AFFIXES, { ilvl, rarityBonus: 0, slot });
        if (res.rarity === 'bao') vals.push(itemPower(res.item));
      }
      row.push({ ilvl, med: median(vals), n: vals.length });
    }
    table.set(slot, row);
  }

  console.log('宝品 itemPower 中位（每格 400 件抽样）：');
  console.log(`部位      ${ILVLS.map((v) => `ilvl${String(v).padStart(3)}`).join('   ')}   | 线性缩放误差（以 99 为基准）`);
  let worst = 0;
  for (const slot of SLOTS) {
    const row = table.get(slot);
    const med99 = row[row.length - 1].med;
    const cells = row.map((r) => r.med.toFixed(1).padStart(8));
    const errs = row.map((r) => {
      const pred = (med99 * r.ilvl) / 99;
      return pred > 0 ? ((r.med - pred) / pred) * 100 : 0;
    });
    for (const e of errs) worst = Math.max(worst, Math.abs(e));
    console.log(
      `${slot.padEnd(8)} ${cells.join('   ')}   | ${errs.map((e) => `${e >= 0 ? '+' : ''}${e.toFixed(0)}%`).join('/')}`,
    );
  }
  console.log(`\n最大绝对误差 ${worst.toFixed(1)}% —— ${worst < 25 ? '线性缩放在 ±25% 内，够用（判据本身是量级判据）' : '线性缩放误差过大，得按 ilvl 分档抽样'}`);
} finally {
  await close();
}
