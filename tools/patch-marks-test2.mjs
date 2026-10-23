// 追加：渊痕存档往返（deserialize 漏字段曾真的静默清零）
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/tests/marks.test.ts';
const orig = fs.readFileSync(p, 'utf8');
let c = orig;

function repl(oldText, newText, tag) {
  const n = c.split(oldText).length - 1;
  if (n !== 1) throw new Error('MISS(' + n + '): ' + tag);
  c = c.replace(oldText, newText);
  console.log('ok:', tag);
}

repl(
  "import { itemPower } from '../src/core/inventory';",
  [
    "import { itemPower } from '../src/core/inventory';",
    "import { serialize, deserialize } from '../src/core/save';",
    "import { sessionToSave } from '../src/core/save-bridge';",
  ].join('\n'),
  'imports',
);

repl(
  [
    '  it(\'部位名取自术语表（防止 UI 里出现裸 id）\', () => {',
    '    expect(SLOT_NAME.robe).toBeTruthy();',
    '  });',
    '});',
  ].join('\n'),
  [
    '  it(\'部位名取自术语表（防止 UI 里出现裸 id）\', () => {',
    '    expect(SLOT_NAME.robe).toBeTruthy();',
    '  });',
    '',
    '  it(\'渊痕能存档往返（deserialize 是逐字段重建的，漏字段=静默清零）\', () => {',
    '    const s = make();',
    '    giveMarks(s, 654_321);',
    '    s.maxFloorReached = 12;',
    '    const state = sessionToSave(s);',
    '    expect(state.player.marks).toBe(654_321);',
    '    const back = deserialize(JSON.parse(JSON.stringify(state)));',
    '    expect(back.ok).toBe(true);',
    '    if (!back.ok) return;',
    '    expect(back.state.player.marks).toBe(654_321);',
    '    expect(back.state.progress.maxFloorReached).toBe(12);',
    '  });',
    '',
    '  it(\'老档没有 marks 字段：读回来是 0 而不是崩\', () => {',
    '    const s = make();',
    '    giveMarks(s, 500_000);',
    '    const state = sessionToSave(s);',
    '    const raw = JSON.parse(JSON.stringify(state)) as { player: Record<string, unknown> };',
    '    delete raw.player.marks;',
    '    const back = deserialize(raw);',
    '    expect(back.ok).toBe(true);',
    '    if (!back.ok) return;',
    '    expect(back.state.player.marks).toBe(0);',
    '  });',
    '});',
  ].join('\n'),
  'roundtrip',
);

fs.writeFileSync(p, c, 'utf8');
console.log('flush', c.length, 'B');
