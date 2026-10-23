// D160（② 异变体）第 3 段：session 接波号 / 掉落数量加成 / 图鉴收录 / 日志
import fs from 'node:fs';

function edit(file, pairs) {
  const raw = fs.readFileSync(file, 'utf8');
  const crlf = raw.includes('\r\n');
  let t = raw.replace(/\r\n/g, '\n');
  for (const [a, b, tag] of pairs) {
    if (!t.includes(a)) throw new Error('MISS[' + tag + '] ' + file);
    t = t.replace(a, b);
  }
  fs.writeFileSync(file, crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
  console.log('patched', file);
}

edit('src/core/session.ts', [
  [
    '    ...spawnRing(monstersOfTier(tierOfFloor(floor)), floor, WAVE_SIZE, s.rng, uidCounter, s.cycle),',
    '    ...spawnRing(monstersOfTier(tierOfFloor(floor)), floor, WAVE_SIZE, s.rng, uidCounter, s.cycle, s.wave),',
    'ring-wave',
  ],
  [
    '      const affixQ = Math.min(\n        MONSTER_QTY_CAP,\n        sumMonsterAffixes(killed.affixIds).dropBonus,\n      );',
    [
      '      const affixQ = Math.min(',
      '        MONSTER_QTY_CAP,',
      '        sumMonsterAffixes(killed.affixIds).dropBonus,',
      '      );',
      '      // 异变体（D160）：额外 +10% 数量，**独立于 MONSTER_QTY_CAP**（否则会被 0.24 的钳位吞掉，',
      '      // 变成又一个「有字段没效果」的死通道 —— 这是本项目第八次同类风险，所以在写的时候就分开）。',
      '      const variantQ = killed.variant === true ? VARIANT_EXTRA_DROP : 0;',
    ].join('\n'),
    'qty',
  ],
  [
    '      const curShare = CURRENCY_SHARE * (1 + luckQ) * (1 + affixQ);\n      const gemShare = GEM_SHARE * (1 + luckQ) * (1 + affixQ);',
    [
      '      const curShare = CURRENCY_SHARE * (1 + luckQ) * (1 + affixQ + variantQ);',
      '      const gemShare = GEM_SHARE * (1 + luckQ) * (1 + affixQ + variantQ);',
    ].join('\n'),
    'share',
  ],
  [
    "import { MONSTER_QTY_CAP, sumMonsterAffixes } from '../data/monster-affixes';",
    "import { MONSTER_QTY_CAP, sumMonsterAffixes } from '../data/monster-affixes';\nimport { VARIANT_EXTRA_DROP } from './monster-roll';",
    'import',
  ],
]);
