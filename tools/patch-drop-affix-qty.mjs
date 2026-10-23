import fs from 'node:fs';

function patch(path, pairs) {
  let raw = fs.readFileSync(path, 'utf8');
  const crlf = raw.includes('\r\n');
  let norm = raw.replace(/\r\n/g, '\n');
  const before = norm.length;
  for (const [oldText, newText] of pairs) {
    if (!norm.includes(oldText)) throw new Error(`MISS in ${path}: ${oldText.slice(0, 70)}`);
    norm = norm.replace(oldText, newText);
  }
  if (norm.length === before) throw new Error(`没有变化 ${path}`);
  if (crlf) norm = norm.replace(/\n/g, '\r\n');
  fs.writeFileSync(
    `F:/dsh-work/zhuoxian/tools/_bak/${path.split('/').pop()}.${Date.now()}.bak`,
    fs.readFileSync(path),
  );
  fs.writeFileSync(path, norm);
  console.log(`${path.split('/').pop()}: ${before} -> ${norm.length}${crlf ? ' (CRLF)' : ''}`);
}

// 1) 品阶加成：magic 1.7 → 1.25、rare 2.6 → 1.5（shuzhi v4.44）
//    两档一直是死代码（spawnRing 从不掷 magic/rare），可以自由改；
//    不能留 1.7/2.6：仙品权重 2(3b−2) 对 b 三倍敏感，会把仙品率抬 +35%、段④ 6.2h→4.6h。
patch('F:/dsh-work/zhuoxian/src/core/drop.ts', [
  [
    [
      'export const DROP_RARITY_BONUS: Readonly<Record<MonsterRarity, number>> = {',
      '  normal: 1,',
      '  magic: 1.7,',
      '  rare: 2.6,',
      '  boss: 4,',
      '};',
    ].join('\n'),
    [
      'export const DROP_RARITY_BONUS: Readonly<Record<MonsterRarity, number>> = {',
      '  normal: 1,',
      '  // 妖纹上线（D95）：这两档从「死代码」变成真用，因此按 shuzhi v4.44 下调。',
      '  // 不要改回 1.7 / 2.6 —— 仙品权重是 2(3b−2)，对 b 三倍敏感，1.7/2.6 会把',
      '  // 仙品率抬 +35%、段④ 从 6.2h 砸到 4.6h（那次是解析推出来的，不是拍的）。',
      '  magic: 1.25,',
      '  rare: 1.5,',
      '  boss: 4,',
      '};',
    ].join('\n'),
  ],
]);

// 2) 掉落分流：妖纹的「数量」加成按 shuzhi 的口径折进两份份额
//    通货/玉简份额 ×(1+q)，法宝吃剩下的 1 − 0.6(1+q)。
patch('F:/dsh-work/zhuoxian/src/core/session.ts', [
  [
    [
      '      const curShare = CURRENCY_SHARE * (1 + luckQ);',
      '      const gemShare = GEM_SHARE * (1 + luckQ);',
    ].join('\n'),
    [
      '      // 妖纹的「数量」加成（D95）：q 来自这只怪身上的 dropBonus 合计（钳到 MONSTER_QTY_CAP=0.24）。',
      '      // 口径（shuzhi v4.44）：通货/玉简份额 ×(1+q)，法宝吃剩下的 1 − 0.6(1+q)。',
      '      // ⚠️ 这意味着一只 4 条妖纹的怪法宝份额只剩 0.256 —— 精英的法宝倍数**完全靠掉率闸抬**，',
      '      //    所以 dropBonus 不能给大（给到 0.48 时 rare 反而比 normal 穷，即「越精英越穷」）。',
      '      const affixQ = Math.min(',
      '        MONSTER_QTY_CAP,',
      '        sumMonsterAffixes(killed.affixIds).dropBonus,',
      '      );',
      '      const curShare = CURRENCY_SHARE * (1 + luckQ) * (1 + affixQ);',
      '      const gemShare = GEM_SHARE * (1 + luckQ) * (1 + affixQ);',
    ].join('\n'),
  ],
]);
