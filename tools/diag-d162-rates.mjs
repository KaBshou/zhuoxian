// D162 验收 3：层 <40 传奇率必须逐位不变；层 >=40 追加槽 ≈30%
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const loot = await server.ssrLoadModule('/src/core/loot.ts');
const rngMod = await server.ssrLoadModule('/src/core/rng.ts');
const bases = await server.ssrLoadModule('/src/data/bases.ts');
const affixes = await server.ssrLoadModule('/src/data/affixes.ts');
const leg = await server.ssrLoadModule('/src/data/legendary.ts');

const N = 40000;
function measure(floor, seed = 0x5eed) {
  const rng = new rngMod.Rng(seed);
  const ilvl = Math.max(1, Math.round((99 * Math.min(76, floor)) / 27));
  let xian = 0;
  let base = 0;
  let deepMain = 0;
  let extra = 0;
  let extraDeep = 0;
  for (let i = 0; i < N; i += 1) {
    const r = loot.rollLoot(rng, bases.ITEM_BASES, affixes.AFFIXES, {
      slot: 'sword',
      ilvl,
      // 用 drop.ts 的同一公式（含 depthRarityBonus）
      rarityBonus: 1.25 * (1 + (await0(floor))),
      floor,
    });
    if (r.rarity === 'xian') xian += 1;
    if (r.item.legendary) base += 1;
    if (r.item.legendary && leg.DEEP_LEGENDARY_DEFS.some((d) => d.id === r.item.legendary)) deepMain += 1;
    if (r.extraItem) {
      extra += 1;
      if (leg.DEEP_LEGENDARY_DEFS.some((d) => d.id === r.extraItem.legendary)) extraDeep += 1;
    }
  }
  return {
    floor,
    xianPct: +((xian / N) * 100).toFixed(2),
    legPct: +((base / N) * 100).toFixed(2),
    deepMain,
    extraPct: +((extra / N) * 100).toFixed(2),
    extraDeep,
  };
}
const monsters = await server.ssrLoadModule('/src/data/monsters.ts');
function await0(floor) {
  return monsters.depthRarityBonus(floor);
}

for (const f of [1, 10, 20, 27, 39, 40, 46, 60, 76]) console.log(JSON.stringify(measure(f)));
await server.close();
