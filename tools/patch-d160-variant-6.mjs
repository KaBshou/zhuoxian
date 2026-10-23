// D160（② 异变体）第 6 段：存档序列化 / 反序列化 / save-bridge 透传 variants
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

const SHAPE_OLD = 'readonly codex?: { readonly monsters?: readonly string[]; readonly legendaries?: readonly string[] };';
const SHAPE_NEW =
  'readonly codex?: {\n    readonly monsters?: readonly string[];\n    readonly legendaries?: readonly string[];\n    readonly variants?: readonly string[];\n  };';

edit('src/core/save.ts', [
  // 两处同样的类型（ProgressSave 与 serialize 输入）
  [SHAPE_OLD, SHAPE_NEW, 'shape-a'],
  [
    '    codex: {\n      monsters: Array.isArray(input.codex?.monsters) ? [...input.codex.monsters] : [],\n      legendaries: Array.isArray(input.codex?.legendaries) ? [...input.codex.legendaries] : [],',
    [
      '    codex: {',
      '      monsters: Array.isArray(input.codex?.monsters) ? [...input.codex.monsters] : [],',
      '      legendaries: Array.isArray(input.codex?.legendaries) ? [...input.codex.legendaries] : [],',
      '      variants: Array.isArray(input.codex?.variants) ? [...input.codex.variants] : [],',
    ].join('\n'),
    'serialize',
  ],
]);

// 第二处类型（serialize 入参）单独替换
{
  const raw = fs.readFileSync('src/core/save.ts', 'utf8');
  const crlf = raw.includes('\r\n');
  let t = raw.replace(/\r\n/g, '\n');
  if (t.includes(SHAPE_OLD)) {
    t = t.replace(SHAPE_OLD, SHAPE_NEW);
    fs.writeFileSync('src/core/save.ts', crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
    console.log('patched src/core/save.ts (shape-b)');
  } else {
    console.log('shape-b already done');
  }
}

// deserialize 的 codex 重建
{
  const raw = fs.readFileSync('src/core/save.ts', 'utf8');
  const crlf = raw.includes('\r\n');
  let t = raw.replace(/\r\n/g, '\n');
  const anchorIdx = t.indexOf('legendaries: Array.isArray((pr.codex as { legendaries?: unknown } | undefined)?.legendaries)');
  if (anchorIdx < 0) throw new Error('MISS deserialize anchor');
  const endIdx = t.indexOf('\n', t.indexOf('\n', anchorIdx) + 1);
  const oldBlock = t.slice(anchorIdx, endIdx);
  console.log('--- deserialize block ---\n' + oldBlock);
  t = t.slice(0, endIdx) +
    "\n      variants: Array.isArray((pr.codex as { variants?: unknown } | undefined)?.variants)\n        ? ((pr.codex as { variants: unknown[] }).variants.filter((x): x is string => typeof x === 'string'))\n        : []," +
    t.slice(endIdx);
  fs.writeFileSync('src/core/save.ts', crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
  console.log('patched src/core/save.ts (deserialize)');
}

edit('src/core/save-bridge.ts', [
  [
    '    codex: { monsters: s.codex?.monsters ?? [], legendaries: s.codex?.legendaries ?? [] },',
    '    codex: {\n      monsters: s.codex?.monsters ?? [],\n      legendaries: s.codex?.legendaries ?? [],\n      variants: s.codex?.variants ?? [],\n    },',
    'bridge-out',
  ],
]);

// 测试修正：CodexState 字面量补 variants
edit('tests/cycles.test.ts', [
  [
    '    legendaries: [],',
    '    legendaries: [],\n    variants: [],',
    'test-codex',
  ],
]);
