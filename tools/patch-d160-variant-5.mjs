// D160（② 异变体）第 5 段：会话收录 + 存档 + 渲染标签 + 测试修正
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

// ── session.ts：异变体收录 + 日志 ───────────────────────────────────────
edit('src/core/session.ts', [
  [
    "        if (def) pushLog(s, codexUnlockText('monster', def.name), '#8eeae2');\n      }",
    [
      "        if (def) pushLog(s, codexUnlockText('monster', def.name), '#8eeae2');",
      '      }',
      '      // 图鉴（D160）：异变体独立一行。只记「见过」，不计数（计数是成就的活）。',
      '      if (killed.variant === true) {',
      '        const nextVariant = recordVariant(s.codex);',
      '        if (nextVariant !== s.codex) {',
      '          s.codex = nextVariant;',
      "          pushLog(s, codexUnlockText('variant', '异变体'), '#c9a3ff');",
      '        }',
      '      }',
    ].join('\n'),
    'session-record',
  ],
  [
    "import { codexUnlockText, createCodex, recordLegendary, recordMonsterKill, type CodexState } from './codex';",
    "import { codexUnlockText, createCodex, recordLegendary, recordMonsterKill, recordVariant, type CodexState } from './codex';",
    'session-import',
  ],
]);

// ── save.ts：codex 形状加 variants ─────────────────────────────────────
edit('src/core/save.ts', [
  [
    '    readonly monsters?: readonly string[];\n    readonly legendaries?: readonly string[];',
    [
      '    readonly monsters?: readonly string[];',
      '    readonly legendaries?: readonly string[];',
      '    readonly variants?: readonly string[];',
    ].join('\n'),
    'save-shape',
  ],
]);
