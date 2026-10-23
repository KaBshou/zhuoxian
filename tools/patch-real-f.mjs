// D39 剩余落点：session 分流吃 lootQuantity、法宝吃 lootRarity；存档带 marks；离线吃 lootRarity
import fs from 'node:fs';

const ROOT = 'F:/dsh-work/zhuoxian';

function patchFile(rel, edits) {
  const p = ROOT + '/' + rel;
  const orig = fs.readFileSync(p, 'utf8');
  let cur = orig;
  fs.writeFileSync(ROOT + '/tools/_bak/' + rel.replace(/\//g, '_') + '.' + Date.now() + '.bak', orig, 'utf8');
  for (const [tag, oldText, newText] of edits) {
    const n = cur.split(oldText).length - 1;
    if (n !== 1) throw new Error('MISS(' + n + ') ' + rel + ': ' + tag);
    cur = cur.replace(oldText, newText);
    console.log('ok:', rel, tag);
  }
  if (cur.length < orig.length * 0.98) throw new Error('拒绝写盘 ' + rel);
  fs.writeFileSync(p, cur, 'utf8');
  console.log('flush', rel, cur.length, 'B');
}

// ── session.ts：三分类份额 + 插值 ──
patchFile('src/core/session.ts', [
  [
    'shares',
    [
      '      s.dropsFound += 1;',
      '      const curRoll = s.rng.float(0, 1);',
      '      if (curRoll < CURRENCY_SHARE) {',
    ].join('\n'),
    [
      '      s.dropsFound += 1;',
      '      // D39：通货/玉简吃「机缘」（lootQuantity），法宝吃「仙缘」（lootRarity）。',
      '      // 为什么数量只给通货/玉简：法宝份额若也放大，段②「装备成型 6.9h」会被 +23% 压到 4.5h，',
      '      // 直接击穿 GDD 的 6h。cap 0.58 保证 (0.475+0.125)(1+q) <= 0.95，法宝份额永远 >= 5%。',
      '      const lootStats = characterStats(s.character);',
      '      const luckQ = Math.max(',
      '        0,',
      '        Math.min(LOOT_QUANTITY_CAP, Number.isFinite(lootStats.lootQuantity) ? lootStats.lootQuantity : 0),',
      '      );',
      '      const curShare = CURRENCY_SHARE * (1 + luckQ);',
      '      const gemShare = GEM_SHARE * (1 + luckQ);',
      '      const curRoll = s.rng.float(0, 1);',
      '      if (curRoll < curShare) {',
    ].join('\n'),
  ],
  [
    'gem-share',
    '      } else if (curRoll < CURRENCY_SHARE + GEM_SHARE) {',
    '      } else if (curRoll < curShare + gemShare) {',
  ],
  [
    'loot-rarity',
    "        const item = rollMonsterDrop(killed.defId, killed.tier, killed.rarity, s.rng, s.tables);",
    '        const item = rollMonsterDrop(\n          killed.defId,\n          killed.tier,\n          killed.rarity,\n          s.rng,\n          s.tables,\n          lootStats.lootRarity,\n        );',
  ],
]);

console.log('done');
