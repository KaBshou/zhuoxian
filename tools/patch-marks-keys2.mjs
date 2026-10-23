// 修两处：main.ts 的 import 锚点（session 是多行 import）+ marks.test 的 equipment 只读
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
  fs.writeFileSync(p, cur, 'utf8');
  console.log('flush', rel, cur.length, 'B');
}

patchFile('src/main.ts', [
  [
    'imports',
    "import { createLocalStorageAdapter } from './core/storage';",
    [
      "import { createLocalStorageAdapter } from './core/storage';",
      "import { spendMarks } from './core/marks-runtime';",
      "import type { MarkSink } from './data/marks';",
    ].join('\n'),
  ],
  [
    'marks-keys',
    "  if (e.code !== 'ArrowLeft' && e.code !== 'ArrowRight') return;",
    [
      '  // 1 / 2 / 3 = 花渊痕的三个口子（D36-A E1）。',
      '  // 为什么要绑键：渊痕只是数字时玩家满级后看着它涨却不知道能干什么，',
      '  // 等于这个系统不存在。键位与 HUD 那行「渊痕 N · 可换」对应。',
      '  const sinkByKey: Record<string, MarkSink> = {',
      "    Digit1: 'rerollCurrency',",
      "    Digit2: 'setStartFloor',",
      "    Digit3: 'divineReforge',",
      '  };',
      '  const sink = sinkByKey[e.code];',
      '  if (sink) {',
      '    e.preventDefault();',
      '    const r = spendMarks(session, sink);',
      '    session.log.push({',
      "      text: r.ok ? r.message : (r.reason ?? '这一档现在换不了'),",
      "      color: r.ok ? '#d4a13c' : '#6d665c',",
      '      age: 0,',
      '    });',
      '    autosaver.saveNow();',
      '    return;',
      '  }',
      "  if (e.code !== 'ArrowLeft' && e.code !== 'ArrowRight') return;",
    ].join('\n'),
  ],
]);

patchFile('tests/marks.test.ts', [
  [
    'readonly-equipment',
    '    s.character.equipment = {};',
    "    (s.character as { equipment: Record<string, unknown> }).equipment = {};",
  ],
]);
