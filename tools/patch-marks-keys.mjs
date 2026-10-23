// main.ts：接渊痕三档花法（1/2/3 键）+ 调试钩子
import fs from 'node:fs';

const ROOT = 'F:/dsh-work/zhuoxian';
const p = ROOT + '/src/main.ts';
const orig = fs.readFileSync(p, 'utf8');
let c = orig;
fs.writeFileSync(ROOT + '/tools/_bak/main.ts.' + Date.now() + '.bak', orig, 'utf8');

function repl(oldText, newText, tag) {
  const n = c.split(oldText).length - 1;
  if (n !== 1) throw new Error('MISS(' + n + '): ' + tag);
  c = c.replace(oldText, newText);
  console.log('ok:', tag);
}

repl(
  "import { setFloor, floorSelectableMax } from './core/session';",
  [
    "import { setFloor, floorSelectableMax } from './core/session';",
    "import { spendMarks } from './core/marks-runtime';",
    "import type { MarkSink } from './data/marks';",
  ].join('\n'),
  'imports',
);

repl(
  [
    "  if (e.code !== 'ArrowLeft' && e.code !== 'ArrowRight') return;",
  ].join('\n'),
  [
    '  // 1 / 2 / 3 = 花渊痕的三个口子（D36-A E1）。',
    '  // 为什么要绑键：渊痕只是数字时玩家满级后看着它涨却不知道能干什么，',
    '  // 等于这个系统不存在。键位和 HUD 上那行「渊痕 N · 可换」对应。',
    "  const sinkByKey: Record<string, MarkSink> = {",
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
  'marks-keys',
);

if (c.length < orig.length * 0.98) throw new Error('拒绝写盘');
fs.writeFileSync(p, c, 'utf8');
console.log('flush', c.length, 'B');
