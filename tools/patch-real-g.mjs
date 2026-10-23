// 存档带 marks（渊痕）+ 离线掉落吃 lootRarity
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

// ── save.ts：PlayerSave 加 marks（可选，老档没有也能读）──
patchFile('src/core/save.ts', [
  [
    'player-save-marks',
    '  readonly talentIds?: readonly string[];\n  readonly equipment: Partial<Record<string, Item>>;',
    [
      '  readonly talentIds?: readonly string[];',
      '  /** 渊痕（满级后的积累物，D36-A）。可选：老档没有它，读回来按 0 处理。 */',
      '  readonly marks?: number;',
      '  readonly equipment: Partial<Record<string, Item>>;',
    ].join('\n'),
  ],
]);

console.log('done save');
