// 周目 v1 第三步：只补 save.ts 的 cycle 字段（前两步已落 session/battle）
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve('.');
function read(p) {
  const raw = fs.readFileSync(path.join(ROOT, p), 'utf8');
  return { text: raw.replace(/\r\n/g, '\n'), crlf: raw.includes('\r\n') };
}
function write(p, text, crlf) {
  fs.writeFileSync(path.join(ROOT, p), crlf ? text.replace(/\n/g, '\r\n') : text, 'utf8');
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
  write(p, t, crlf);
  console.log(`patched ${p} (${text.length} -> ${t.length})`);
}

patch('src/core/save.ts', [
  [
    'ProgressSave.cycle',
    '  readonly deaths?: number;',
    '  readonly deaths?: number;\n  /** 周目数（D36-A；缺省 = 初临，老档自动视为 0） */\n  readonly cycle?: number;',
  ],
  [
    'serialize input.cycle',
    '  deaths?: number;\n  pocket: Record<CurrencyId, number>;',
    '  deaths?: number;\n  cycle?: number;\n  pocket: Record<CurrencyId, number>;',
  ],
  [
    'serialize deaths',
    '      deaths: Math.max(0, Math.floor(input.deaths ?? 0)),',
    '      deaths: Math.max(0, Math.floor(input.deaths ?? 0)),\n      cycle: Math.max(0, Math.floor(input.cycle ?? 0)),',
  ],
  [
    'deserialize deaths',
    "        deaths:\n          typeof pr.deaths === 'number' && Number.isFinite(pr.deaths) ? Math.max(0, Math.floor(pr.deaths)) : 0,",
    [
      '        deaths:',
      "          typeof pr.deaths === 'number' && Number.isFinite(pr.deaths) ? Math.max(0, Math.floor(pr.deaths)) : 0,",
      '        cycle:',
      "          typeof pr.cycle === 'number' && Number.isFinite(pr.cycle) ? Math.max(0, Math.floor(pr.cycle)) : 0,",
    ].join('\n'),
  ],
]);

patch('src/core/save-bridge.ts', [
  ['bridge to save', '    deaths: s.deaths ?? 0,', '    deaths: s.deaths ?? 0,\n    cycle: s.cycle ?? 0,'],
  [
    'bridge from save',
    '  s.deaths = Math.max(0, Math.floor(state.progress.deaths ?? 0));',
    '  s.deaths = Math.max(0, Math.floor(state.progress.deaths ?? 0));\n  s.cycle = clampCycle(state.progress.cycle ?? 0);',
  ],
  [
    'bridge import cycle',
    "import { sanitizeAchievements } from './achievement';",
    "import { sanitizeAchievements } from './achievement';\nimport { clampCycle } from '../data/cycles';",
  ],
]);
console.log('done');
