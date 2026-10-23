// 周目 v1 第四步：main.ts 键位 + 调试钩子 + HUD 提示
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve('.');
const BT = String.fromCharCode(96);
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

patch('src/main.ts', [
  [
    'import session helpers',
    "import { characterGemLoadout } from './core/character';",
    [
      "import { characterGemLoadout } from './core/character';",
      "import { prestige, prestigeReady } from './core/session';",
      "import { cycleDmgMul, cycleHpMul, cycleMarksMul, cycleName } from './data/cycles';",
    ].join('\n'),
  ],
  [
    'KeyN branch',
    "  if (e.code === 'KeyF') {",
    [
      '  // N = 轮回（D36-A）：满级后重开一轮，是本项目唯一不可撤销的玩家操作。',
      '  // 未满级时按键不报错、只解释条件 —— 玩家在深层乱按不该看到红字。',
      "  if (e.code === 'KeyN') {",
      '    e.preventDefault();',
      '    if (!prestigeReady(session)) {',
      "      session.log.push({ text: '轮回需先满级（第九境渡劫）', color: '#6d665c', age: 0 });",
      '      return;',
      '    }',
      '    const before = session.cycle;',
      '    if (prestige(session)) {',
      '      autosaver.saveNow();',
      '      session.log.push({',
      "        text: '轮回：' + cycleName(before) + ' → ' + cycleName(session.cycle),",
      "        color: '#d4a13c',",
      '        age: 0,',
      '      });',
      '    }',
      '    return;',
      '  }',
      '',
      "  if (e.code === 'KeyF') {",
    ].join('\n'),
  ],
  [
    'hook types',
    '      setFragmentAim(el: string | null): void;',
    [
      '      setFragmentAim(el: string | null): void;',
      '      /** 周目（D36-A）：号 / 名称 / 是否可轮回 / 当前倍率（探针与 UI 同源） */',
      '      cycleInfo(): {',
      '        readonly cycle: number;',
      '        readonly name: string;',
      '        readonly ready: boolean;',
      '        readonly hpMul: number;',
      '        readonly dmgMul: number;',
      '        readonly marksMul: number;',
      '      };',
      '      /** 轮回（未满级返回 false，不改任何状态） */',
      '      prestige(): boolean;',
    ].join('\n'),
  ],
  [
    'hook impl',
    '    setFragmentAim: (el: string | null) => {',
    [
      '    cycleInfo: () => ({',
      '      cycle: session.cycle,',
      '      name: cycleName(session.cycle),',
      '      ready: prestigeReady(session),',
      '      hpMul: cycleHpMul(session.cycle),',
      '      dmgMul: cycleDmgMul(session.cycle),',
      '      marksMul: cycleMarksMul(session.cycle),',
      '    }),',
      '    prestige: () => {',
      '      const ok = prestige(session);',
      '      if (ok) autosaver.saveNow();',
      '      return ok;',
      '    },',
      '    setFragmentAim: (el: string | null) => {',
    ].join('\n'),
  ],
]);

patch('src/render/battle-renderer.ts', [
  [
    'hint cycle prefix',
    '第 ${s.wave} 波',
    "${s.cycle > 0 ? '第 ' + s.cycle + ' 周目 · ' : ''}第 ${s.wave} 波",
  ],
  ['hint N key', 'M 渊痕', 'M 渊痕　N 轮回'],
]);
console.log('done');
