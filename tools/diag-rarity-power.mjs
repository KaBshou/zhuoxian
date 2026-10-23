// 诊断：品阶（rareness）到底是不是「战力」的单调代理？
// 起因：把「自动换装」从全角色战力比改成同部位比之后，gearTrail 里出现
// 「宝品以上部位数 10/10 → 5/10」的**回落**，说明有部位被更低品阶的装备替换掉了。
// 如果灵品的高战力分布能盖过宝品的低战力分布，那「宝品以上且 ≥1 条灵纹」这个
// 段② 判据本身就不是战力的好代理 —— 这是判据问题，不是换装 bug。
import { openSrc } from './vite-loader.mjs';

const { load, close } = await openSrc();
try {
  const { ITEM_BASES } = await load('src/data/bases.ts');
  const { AFFIXES } = await load('src/data/affixes.ts');
  const { rollLoot } = await load('src/core/loot.ts');
  const { itemPower } = await load('src/core/inventory.ts');
  const { Rng } = await load('src/core/rng.ts');

  const N = 20000;
  const rng = new Rng(20261022);
  const byRarity = new Map();
  for (let i = 0; i < N; i++) {
    const res = rollLoot(rng, ITEM_BASES, AFFIXES, { ilvl: 99, rarityBonus: 1.45 });
    const arr = byRarity.get(res.rarity) ?? [];
    arr.push(itemPower(res.item));
    byRarity.set(res.rarity, arr);
  }
  const q = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))];
  console.log(`ilvl 99 / rarityBonus 1.45，各品阶 itemPower 分布（n=${N}）：`);
  for (const r of ['fan', 'ling', 'bao', 'xian']) {
    const arr = (byRarity.get(r) ?? []).sort((a, b) => a - b);
    if (arr.length === 0) continue;
    const mean = arr.reduce((s, x) => s + x, 0) / arr.length;
    console.log(
      `${r.padEnd(5)} n=${String(arr.length).padStart(5)} 占比 ${((arr.length / N) * 100).toFixed(1).padStart(5)}%  ` +
        `p10=${q(arr, 0.1).toFixed(1).padStart(7)} p50=${q(arr, 0.5).toFixed(1).padStart(7)} ` +
        `p90=${q(arr, 0.9).toFixed(1).padStart(7)} mean=${mean.toFixed(1).padStart(7)}`,
    );
  }
  // 关键问题：一件「灵品」有多大概率强过一件「宝品」？
  const ling = (byRarity.get('ling') ?? []).sort((a, b) => a - b);
  const bao = (byRarity.get('bao') ?? []).sort((a, b) => a - b);
  if (ling.length && bao.length) {
    let wins = 0;
    for (const v of ling) if (v > q(bao, 0.5)) wins += 1;
    console.log(
      `\n灵品强过「宝品中位(${q(bao, 0.5).toFixed(1)})」的比例 = ${((wins / ling.length) * 100).toFixed(1)}%`,
    );
    let w2 = 0;
    for (const v of bao) if (v < q(ling, 0.9)) w2 += 1;
    console.log(
      `宝品弱于「灵品 p90(${q(ling, 0.9).toFixed(1)})」的比例 = ${((w2 / bao.length) * 100).toFixed(1)}%  ← 这些宝品会被灵品顶掉`,
    );
  }
} finally {
  await close();
}
