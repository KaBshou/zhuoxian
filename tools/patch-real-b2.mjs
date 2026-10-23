// 一次性补丁 B2：D39 掉落两乘区 + kills/floorKills/floorMinutes + 渊痕出口
import fs from 'node:fs';

const ROOT = 'F:/dsh-work/zhuoxian';
const files = {};
function load(rel) {
  const p = `${ROOT}/${rel}`;
  const c = fs.readFileSync(p, 'utf8');
  files[rel] = { p, orig: c, cur: c };
  fs.writeFileSync(`${ROOT}/tools/_bak/${rel.replace(/\//g, '_')}.${Date.now()}.bak`, c, 'utf8');
}
function repl(rel, old, neu, tag) {
  const f = files[rel];
  const n = f.cur.split(old).length - 1;
  if (n !== 1) throw new Error('MISS(' + n + ') ' + rel + ': ' + tag);
  f.cur = f.cur.replace(old, neu);
  console.log('ok:', rel, tag);
}
function flush(rel) {
  const f = files[rel];
  if (f.cur.length < f.orig.length * 0.98) throw new Error('拒绝写盘 ' + rel);
  fs.writeFileSync(f.p, f.cur, 'utf8');
  console.log('flush', rel, f.cur.length, 'B');
}

// ── drop.ts：两乘区相乘（稀有度词缀 ×0.5 + 深品阶）──
load('src/core/drop.ts');
repl('src/core/drop.ts',
  `  const params: LootParams = {
    ilvl: ilvlForFloor(floor),
    rarityBonus: DROP_RARITY_BONUS[rarity],
  };`,
  `  // D39 + D36-A：两个乘区**相乘**（不是覆盖）
  //   ① 玩家仙缘（lootRarity）×0.5 —— 0.5 折是因为 1:1 会让仙品率翻倍，把 6h 收集压到 4.5h
  //   ② 深品阶（层 28+ 每层 +0.05、层 36 封顶 0.45）—— 无尽层的"往下走有回报"
  const lootRarity = Number.isFinite(params.lootRarity) ? Math.max(0, params.lootRarity ?? 0) : 0;
  const paramsOut: LootParams = {
    ilvl: ilvlForFloor(floor),
    rarityBonus:
      DROP_RARITY_BONUS[rarity] * (1 + 0.5 * lootRarity) * (1 + depthRarityBonus(floor)),
  };`,
  'loot-two-multipliers',
);
repl('src/core/drop.ts',
  `  const result = rollLoot(rng, tables.bases, tables.affixes, params);`,
  `  const result = rollLoot(rng, tables.bases, tables.affixes, paramsOut);`,
  'loot-call',
);
repl('src/core/drop.ts',
  `): Item | null {
  if (!Number.isFinite(DROP_CHANCE[rarity])) return null;`,
  `  params: LootParams = {},
): Item | null {
  if (!Number.isFinite(DROP_CHANCE[rarity])) return null;`,
  'roll-signature',
);
flush('src/core/drop.ts');

// 上面改成「第 6 参 params」后，原第 6 参不存在，函数签名要重排
load('src/core/drop.ts');
const f = files['src/core/drop.ts'];
const idx = f.cur.indexOf('export function rollMonsterDrop(');
console.log(f.cur.slice(idx, idx + 900));
