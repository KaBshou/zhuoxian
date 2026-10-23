// 一次性：D46.1 修法 —— 掉落闸前移（18% 击杀出货，再按 40/47.5/12.5 分流）
// 根因：session.ts 把三分类放在 DROP_CHANCE 闸之前，通货/玉简各超发 1/0.28 = 3.57 倍。
// 设计原意可自证：旧 §5「4 次/分 = 法宝 1.6 + 通货 1.9 + 玉简 0.5」三条都是「先过 0.28 闸、再分流」。
import fs from 'node:fs';

const DROP = 'F:/dsh-work/zhuoxian/src/core/drop.ts';
const SESS = 'F:/dsh-work/zhuoxian/src/core/session.ts';
const OFF = 'F:/dsh-work/zhuoxian/src/core/offline.ts';

function patch(file, edits) {
  let c = fs.readFileSync(file, 'utf8');
  const before = c.length;
  for (const [a, b, tag] of edits) {
    if (!c.includes(a)) throw new Error(`MISS ${file}: ${tag}`);
    const n = c.split(a).length - 1;
    if (n !== 1) throw new Error(`AMBIGUOUS(${n}) ${file}: ${tag}`);
    c = c.replace(a, b);
    console.log('OK', tag);
  }
  if (c.length < before * 0.95) throw new Error(`结果比原文短，拒绝写盘 ${file}`);
  fs.writeFileSync(file, c, 'utf8');
  console.log('written', file, before, '->', c.length);
}

patch(DROP, [
  [
    `export interface DropTables {`,
    `/**
 * 这一击**会不会掉东西**（D46.1：闸在分流之前）。
 *
 * 为什么闸必须在分流前：设计原意是「28% 的击杀出货，内部再按 40/47.5/12.5 分三类」——
 * 旧实现先按份额分流、再让法宝支单独过闸，结果通货/玉简各超发 \`1/0.28 = 3.57\` 倍
 * （实测通货 47.5%/杀 vs 设计 13.6%/杀），「捡到东西」这件事被白菜价抹平了。
 *
 * 注意：\`dropsFound\` 是**击杀计数**不是出货计数，历史上有人拿它的差分当法宝数，
 * 结果把法宝支掷失败的 72% 也算成了出货（高估 3.4 倍）。要数出货请数 \`s.ground\`。
 */
export function rollDropGate(rng: Rng, rarity: MonsterRarity): boolean {
  const p = DROP_CHANCE[rarity];
  if (!Number.isFinite(p)) return false;
  return rng.chance(p);
}

export interface DropTables {`,
    'drop-gate',
  ],
  [
    `  /** 玩家仙缘（lootRarity），D39：以 0.5 倍折进 rarityBonus */
  lootRarity = 0,
): Item | null {
  if (!Number.isFinite(DROP_CHANCE[rarity])) return null;
  if (!rng.chance(DROP_CHANCE[rarity])) return null;`,
    `  /** 玩家仙缘（lootRarity），D39：以 0.5 倍折进 rarityBonus */
  lootRarity = 0,
  /** 调用方已经过 \`rollDropGate\`（D46.1），别再掷一次闸 */
  alreadyGated = false,
): Item | null {
  if (!alreadyGated) {
    if (!Number.isFinite(DROP_CHANCE[rarity])) return null;
    if (!rng.chance(DROP_CHANCE[rarity])) return null;
  }`,
    'drop-already-gated',
  ],
]);

patch(SESS, [
  [
    `      s.dropsFound += 1;
      // D39：通货/玉简吃「机缘」（lootQuantity），法宝吃「仙缘」（lootRarity）。
      // 为什么数量只给通货/玉简：法宝份额若也放大，段②「装备成型 6.9h」会被 +23% 压到 4.5h，
      // 直接击穿 GDD 的 6h。cap 0.58 保证 (0.475+0.125)(1+q) <= 0.95，法宝份额永远 >= 5%。
      const lootStats = characterStats(s.character);
      const luckQ = Math.max(
        0,
        Math.min(LOOT_QUANTITY_CAP, Number.isFinite(lootStats.lootQuantity) ? lootStats.lootQuantity : 0),
      );
      const curShare = CURRENCY_SHARE * (1 + luckQ);
      const gemShare = GEM_SHARE * (1 + luckQ);
      const curRoll = s.rng.float(0, 1);
      if (curRoll < curShare) {`,
    `      s.dropsFound += 1;
      // D39：通货/玉简吃「机缘」（lootQuantity），法宝吃「仙缘」（lootRarity）。
      // 为什么数量只给通货/玉简：法宝份额若也放大，段②「装备成型 6.9h」会被 +23% 压到 4.5h，
      // 直接击穿 GDD 的 6h。cap 0.58 保证 (0.475+0.125)(1+q) <= 0.95，法宝份额永远 >= 5%。
      const lootStats = characterStats(s.character);
      const luckQ = Math.max(
        0,
        Math.min(LOOT_QUANTITY_CAP, Number.isFinite(lootStats.lootQuantity) ? lootStats.lootQuantity : 0),
      );
      const curShare = CURRENCY_SHARE * (1 + luckQ);
      const gemShare = GEM_SHARE * (1 + luckQ);
      // D46.1：**闸在分流之前**。设计原意是「28% 的击杀出货，内部再按 40/47.5/12.5 分三类」，
      // 旧实现把分流放在闸前 → 通货/玉简各超发 3.57 倍（实测通货 47.5%/杀 vs 设计 13.6%/杀）。
      // 现在没出货的击杀什么都不掉，这是设计，不是 bug。
      const gated = rollDropGate(s.rng, killed.rarity);
      const curRoll = gated ? s.rng.float(0, 1) : 1;
      if (!gated) {
        // 什么也不掉：不掷后面的骰子，保证随机数消耗与「出货/不出货」一致可复现
      } else if (curRoll < curShare) {`,
    'session-gate',
  ],
  [
    `        const item = rollMonsterDrop(
          killed.defId,
          killed.tier,
          killed.rarity,
          s.rng,
          s.tables,
          lootStats.lootRarity,
        );
        if (item) addGroundDrop(s, item, killed.x, killed.y);`,
    `        const item = rollMonsterDrop(
          killed.defId,
          killed.tier,
          killed.rarity,
          s.rng,
          s.tables,
          lootStats.lootRarity,
          // 闸已经在外面掷过了（D46.1），这里不能再掷一次
          true,
        );
        if (item) addGroundDrop(s, item, killed.x, killed.y);`,
    'session-passthrough',
  ],
]);

patch(OFF, [
  [
    `  // 掉落分成与在线完全一致（session.ts 的三分类），只是不落地、直接进袋
  for (let i = 0; i < kills; i++) {
    const r = rng.float(0, 1);
    if (r < 0.475) {`,
    `  // 掉落分成与在线完全一致（session.ts 的三分类），只是不落地、直接进袋。
  // D46.1：闸在分流之前 —— 先问「这一击掉不掉」，再问「掉哪一类」。
  for (let i = 0; i < kills; i++) {
    if (!rollDropGate(rng, 'normal')) continue;
    const r = rng.float(0, 1);
    if (r < 0.475) {`,
    'offline-gate',
  ],
  [
    `      const item = rollMonsterDrop('normal', floor, 'normal', rng, s.tables, characterStats(s.character).lootRarity);`,
    `      const item = rollMonsterDrop(
        'normal',
        floor,
        'normal',
        rng,
        s.tables,
        characterStats(s.character).lootRarity,
        true,
      );`,
    'offline-passthrough',
  ],
  [
    `import { rollMonsterDrop } from './drop';`,
    `import { rollDropGate, rollMonsterDrop } from './drop';`,
    'offline-import',
  ],
]);
