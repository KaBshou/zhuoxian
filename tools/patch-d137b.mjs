// D137（续）：session 的 diveLock + 存档字段
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve('.');
function read(p) {
  const raw = fs.readFileSync(path.join(ROOT, p), 'utf8');
  return { text: raw.replace(/\r\n/g, '\n'), crlf: raw.includes('\r\n') };
}
function patch(p, edits) {
  const { text, crlf } = read(p);
  let t = text;
  for (const [tag, oldText, newText] of edits) {
    const at = t.indexOf(oldText);
    if (at < 0) throw new Error(`MISS ${p} :: ${tag}`);
    if (t.indexOf(oldText, at + 1) >= 0) throw new Error(`AMBIGUOUS ${p} :: ${tag}`);
    t = t.slice(0, at) + newText + t.slice(at + oldText.length);
  }
  if (t.length < text.length * 0.9) throw new Error(`SHRINK ${p}`);
  fs.writeFileSync(path.join(ROOT, p), crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
  console.log(`patched ${p} (${text.length} -> ${t.length})`);
}

patch('src/core/session.ts', [
  [
    'diveLock field',
    ['  cycle: number;'].join('\n'),
    [
      '  cycle: number;',
      '  /**',
      '   * 锁层挂机（D137 方案 d）：为 true 时清完一层不再下潜，停在本层反复刷。',
      '   * 需要先花渊痕开定渊（`character.diveLockUnlocked`）；运行时态，不入档。',
      '   */',
      '  diveLock: boolean;',
    ].join('\n'),
  ],
  ['init diveLock', '    cycle,', '    cycle,\n    diveLock: false,'],
  [
    'descent guard',
    '      if (s.wave % BOSS_EVERY === 0 && s.floor < MAX_FLOOR) {',
    [
      '      const lockHolding =',
      '        s.diveLock === true && s.character.diveLockUnlocked === true && s.floor < MAX_FLOOR;',
      '      if (s.wave % BOSS_EVERY === 0 && s.floor < MAX_FLOOR && !lockHolding) {',
    ].join('\n'),
  ],
]);

patch('src/core/save.ts', [
  [
    'player field',
    '  readonly marks?: number;',
    '  readonly marks?: number;\n  /** D137：定渊是否已解锁（一次性永久，不入档就会每次刷新吞掉玩家花的 720k） */\n  readonly diveLockUnlocked?: boolean;',
  ],
  [
    'serialize',
    '      marks: Math.max(0, Math.floor(ch.marks ?? 0)),',
    '      marks: Math.max(0, Math.floor(ch.marks ?? 0)),\n      diveLockUnlocked: ch.diveLockUnlocked === true,',
  ],
  [
    'deserialize',
    '        marks: typeof p.marks === \'number\' && Number.isFinite(p.marks) ? Math.max(0, Math.floor(p.marks)) : 0,',
    [
      '        marks: typeof p.marks === \'number\' && Number.isFinite(p.marks) ? Math.max(0, Math.floor(p.marks)) : 0,',
      '        diveLockUnlocked: p.diveLockUnlocked === true,',
    ].join('\n'),
  ],
]);

patch('src/core/save-bridge.ts', [
  [
    'restore',
    '  ch.marks = Math.max(0, Math.floor(state.player.marks ?? 0));',
    '  ch.marks = Math.max(0, Math.floor(state.player.marks ?? 0));\n  ch.diveLockUnlocked = state.player.diveLockUnlocked === true;',
  ],
]);
console.log('done');
