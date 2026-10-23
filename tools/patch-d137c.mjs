// D137（续 3）：L 键锁层 + 调试钩子 + M 面板文案（按真实形状写锚点）
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

patch('src/main.ts', [
  [
    'KeyL',
    ["  if (e.code === 'KeyM') {", "    activatePanel('marks');", '    return;', '  }'].join('\n'),
    [
      "  if (e.code === 'KeyM') {",
      "    activatePanel('marks');",
      '    return;',
      '  }',
      '  // L = 锁层挂机开关（D137 方案 d）：需要先花渊痕开定渊',
      '  // 为什么要有它：定渊不再是「跳到已到过的最深层」（那会买走时长、且全重置后从深层起跑等于自杀），',
      '  // 而是「停在一层反复刷」—— 刷修为回层 21、刷仙品回层 46、刷装备回层 76，全靠这一个开关。',
      "  if (e.code === 'KeyL') {",
      '    e.preventDefault();',
      '    if (session.character.diveLockUnlocked !== true) {',
      "      session.log.push({ text: '尚未开定渊（M 面板可查）', color: '#8a8272', age: 0 });",
      '    } else {',
      '      session.diveLock = !session.diveLock;',
      '      session.log.push({',
      "        text: session.diveLock ? '锁层：停在本层反复刷' : '解层：继续下潜',",
      "        color: '#4fd1c5',",
      '        age: 0,',
      '      });',
      '      autosaver.saveNow();',
      '    }',
      '    return;',
      '  }',
    ].join('\n'),
  ],
  [
    'hooks type',
    ['      /** 轮回（未满级返回 false，不改任何状态） */', '      prestige(): boolean;'].join('\n'),
    [
      '      /** 锁层挂机（D137）：unlocked = 已开定渊；active = 当前是否锁层 */',
      '      diveLock(): { readonly unlocked: boolean; readonly active: boolean };',
      '      setDiveLock(on: boolean): boolean;',
      '      /** 轮回（未满级返回 false，不改任何状态） */',
      '      prestige(): boolean;',
    ].join('\n'),
  ],
  [
    'hooks impl',
    '    cycleInfo: () => ({',
    [
      '    diveLock: () => ({',
      '      unlocked: session.character.diveLockUnlocked === true,',
      '      active: session.diveLock === true,',
      '    }),',
      '    setDiveLock: (on: boolean) => {',
      '      if (session.character.diveLockUnlocked !== true) return false;',
      '      session.diveLock = on === true;',
      '      return true;',
      '    },',
      '    cycleInfo: () => ({',
    ].join('\n'),
  ],
]);

patch('src/render/marks-panel.ts', [
  [
    'sink hint table',
    ['const SINKS: readonly MarkSink[] = ['].join('\n'),
    [
      '/** 每档的一句话说明（D137 起「定渊」语义变了：不再是跳层，而是解锁锁层挂机） */',
      'const SINK_HINT: Readonly<Record<MarkSink, string>> = {',
      "  rerollCurrency: '买洗灵石 ×1（打造材料）',",
      "  setStartFloor: '一次性永久：解锁锁层挂机（按 L 在本层反复刷）',",
      "  divineReforge: '把最强的一件的灵纹拔到淬炼上限',",
      '};',
      '',
      'const SINKS: readonly MarkSink[] = [',
    ].join('\n'),
  ],
  [
    'row hint draw',
    '      ctx.fillText(sinkStatusText(marks, sink), x + W - PAD, ly);',
    [
      '      ctx.fillText(sinkStatusText(marks, sink), x + W - PAD, ly);',
      '      ctx.fillText(SINK_HINT[sink], x + PAD + 26, ly + 11);',
    ].join('\n'),
  ],
]);
console.log('done');
