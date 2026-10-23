// D160（② 异变体）第 7 段：save.ts 剩下的 shape-b / serialize / deserialize
import fs from 'node:fs';

function load(file) {
  const raw = fs.readFileSync(file, 'utf8');
  return { raw, crlf: raw.includes('\r\n'), text: raw.replace(/\r\n/g, '\n') };
}
function save(file, crlf, text) {
  fs.writeFileSync(file, crlf ? text.replace(/\n/g, '\r\n') : text, 'utf8');
  console.log('patched', file);
}

// 1) serialize 入参的 codex 形状
{
  const { crlf, text } = load('src/core/save.ts');
  const a = '  codex?: { readonly monsters?: readonly string[]; readonly legendaries?: readonly string[] };';
  const b =
    '  codex?: {\n    readonly monsters?: readonly string[];\n    readonly legendaries?: readonly string[];\n    readonly variants?: readonly string[];\n  };';
  if (!text.includes(a)) throw new Error('MISS shape-b');
  save('src/core/save.ts', crlf, text.replace(a, b));
}

// 2) serialize 里的 codex 输出
{
  const { crlf, text } = load('src/core/save.ts');
  const a =
    '      codex: {\n        monsters: Array.isArray(input.codex?.monsters) ? [...input.codex.monsters] : [],\n        legendaries: Array.isArray(input.codex?.legendaries) ? [...input.codex.legendaries] : [],\n      },';
  const b =
    '      codex: {\n        monsters: Array.isArray(input.codex?.monsters) ? [...input.codex.monsters] : [],\n        legendaries: Array.isArray(input.codex?.legendaries) ? [...input.codex.legendaries] : [],\n        variants: Array.isArray(input.codex?.variants) ? [...input.codex.variants] : [],\n      },';
  if (!text.includes(a)) throw new Error('MISS serialize');
  save('src/core/save.ts', crlf, text.replace(a, b));
}

// 3) deserialize 的 codex 重建
{
  const { crlf, text } = load('src/core/save.ts');
  const marker = 'legendaries: Array.isArray((pr.codex as { legendaries?: unknown } | undefined)?.legendaries)';
  const at = text.indexOf(marker);
  if (at < 0) throw new Error('MISS deserialize anchor');
  // 找到该 legendaries 表达式的结尾（其后的第一个 ' : [],' 或 '? (...)' 组合结束行）
  const lineStart = text.lastIndexOf('\n', at) + 1;
  const lineEndIdx = text.indexOf('\n', text.indexOf(':', text.indexOf('?', at)));
  const blockEnd = text.indexOf('\n', lineEndIdx + 1);
  const snippet = text.slice(lineStart, blockEnd);
  console.log('--- deserialize codex block ---\n' + snippet);
  const insert =
    '\n        variants: Array.isArray((pr.codex as { variants?: unknown } | undefined)?.variants)\n          ? (pr.codex as { variants: unknown[] }).variants.filter((x): x is string => typeof x === \'string\')\n          : [],';
  save('src/core/save.ts', crlf, text.slice(0, blockEnd) + insert + text.slice(blockEnd));
}

// 4) save-bridge：出口带 variants
{
  const { crlf, text } = load('src/core/save-bridge.ts');
  const a = '    codex: { monsters: s.codex?.monsters ?? [], legendaries: s.codex?.legendaries ?? [] },';
  const b =
    '    codex: {\n      monsters: s.codex?.monsters ?? [],\n      legendaries: s.codex?.legendaries ?? [],\n      variants: s.codex?.variants ?? [],\n    },';
  if (!text.includes(a)) throw new Error('MISS bridge-out');
  save('src/core/save-bridge.ts', crlf, text.replace(a, b));
}

// 5) 测试：CodexState 字面量补 variants
{
  const { crlf, text } = load('tests/cycles.test.ts');
  const a = '    legendaries: [],';
  if (!text.includes(a)) throw new Error('MISS test-codex');
  save('tests/cycles.test.ts', crlf, text.replace(a, '    legendaries: [],\n    variants: [],'));
}
