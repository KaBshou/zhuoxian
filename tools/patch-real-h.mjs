// 存档补全：serialize 写 marks、sessionFromSave 回填 marks 与 maxFloorReached、离线掉落吃 lootRarity
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

patchFile('src/core/save.ts', [
  [
    'serialize-marks',
    '      talentIds: ch.talentIds ? [...ch.talentIds] : undefined,\n      equipment: JSON.parse(JSON.stringify(ch.equipment))',
    [
      '      talentIds: ch.talentIds ? [...ch.talentIds] : undefined,',
      '      marks: Math.max(0, Math.floor(ch.marks ?? 0)),',
      '      equipment: JSON.parse(JSON.stringify(ch.equipment))',
    ].join('\n'),
  ],
]);

patchFile('src/core/save-bridge.ts', [
  [
    'restore-marks',
    '  ch.talentIds = state.player.talentIds ? [...state.player.talentIds] : undefined;',
    [
      '  ch.talentIds = state.player.talentIds ? [...state.player.talentIds] : undefined;',
      '  // 渊痕（D36-A）：满级后的唯一积累物，丢它等于把几十小时清零。老档没有 → 0。',
      '  ch.marks = Math.max(0, Math.floor(state.player.marks ?? 0));',
    ].join('\n'),
  ],
  [
    'restore-max-floor',
    "  s.wave = state.progress.wave;",
    [
      '  s.wave = state.progress.wave;',
      '  // 到过的最高层必须比当前层不低，否则选层上限会掉回去（老档没有这个字段）',
      '  s.maxFloorReached = Math.max(state.progress.floor, Math.floor(state.progress.maxFloorReached ?? state.progress.floor));',
    ].join('\n'),
  ],
]);

patchFile('src/core/offline.ts', [
  [
    'offline-loot-rarity',
    "        const item = rollMonsterDrop('normal', floor, 'normal', rng, tables);",
    [
      "        const luck = characterStats(s.character).lootRarity;",
      "        const item = rollMonsterDrop('normal', floor, 'normal', rng, tables, luck);",
    ].join('\n'),
  ],
]);

console.log('done');
