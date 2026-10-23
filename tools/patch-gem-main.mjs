// main.ts 接线：神通面板可交互（光标 + 空格换玉简 + R 恢复自动）
// 纪律：一个改动的所有落点写在同一个脚本里；任何锚点 MISS 就 throw，不写盘。
// 纪律二：本文件**不许出现嵌套反引号模板**（A1 事故同源）—— 替换文本一律用行数组 join('\n')。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const p = 'src/main.ts';
const raw = readFileSync(p, 'utf8');
const crlf = raw.includes('\r\n');
let n = raw.replace(/\r\n/g, '\n');

function rep(oldText, newLines, tag) {
  const newText = Array.isArray(newLines) ? newLines.join('\n') : newLines;
  if (oldText === n) throw new Error(tag + ': 第一参是整文件，拒绝执行');
  if (!n.includes(oldText)) throw new Error(tag + ': MISS');
  if (n.split(oldText).length - 1 !== 1) throw new Error(tag + ': 命中多次');
  n = n.replace(oldText, () => newText);
  console.log('ok', tag);
}

// ── 1) import ──────────────────────────────────────────────
rep(
  "import { indexFromDigit, moveClassIndex } from './render/class-select';",
  [
    "import { indexFromDigit, moveClassIndex } from './render/class-select';",
    "import { characterGemLoadout } from './core/character';",
    'import {',
    '  applyGemLoadout,',
    '  cycleGemAt,',
    '  gemAtSlot,',
    '  moveSkillCursor,',
    '  moveSlotCursor,',
    '  orderedSkillRows,',
    '  resetGemLoadout,',
    "} from './core/gem-edit';",
  ],
  'import',
);

// ── 2) 光标状态 ─────────────────────────────────────────────
rep(
  'let selectTime = 0;',
  [
    'let selectTime = 0;',
    '',
    '/**',
    ' * 神通面板光标（G 打开时才有意义）。',
    ' *',
    ' * 为什么状态放在 main.ts 而不是 renderer：面板自己的字段只管「画什么」，',
    ' * 而「玩家选了哪一格」背后是会触发存档的业务状态（改装配 = 改存档里的 gemLoadouts），',
    ' * 按本项目分层纪律，业务状态归入口/核心层，渲染层只读。',
    ' */',
    'let skillCursor = { skill: 0, slot: 0 };',
    '',
    '/** 把光标同步给渲染层（每次移动后都调一次，避免两处各存一份状态） */',
    'function syncSkillCursor(): void {',
    '  renderer.setSkillCursor(skillCursor);',
    '}',
    '',
    '/** 提交一次装配改动：写进 character 后立刻自动存档（配置丢了比掉一件法宝更恼人） */',
    'function commitGemLoadout(skillId: string, next: string[]): void {',
    '  applyGemLoadout(session.character, skillId, next);',
    '  autosaver.saveNow();',
    '}',
  ],
  'state',
);

// ── 3) 面板按键接管（必须插在「空格跳引导」之前）─────────────
rep(
  '  keysUsed.add(e.code);',
  [
    '  keysUsed.add(e.code);',
    '',
    '  // ── 神通面板打开时，方向键 / 空格 / R 归面板 ──────────────',
    '  // 冲突：ArrowLeft/Right 平时是回刷层（D36-B），空格平时是「跳过一条引导」。',
    '  // 面板一开就接管这三个键，否则「改装配」和「回刷层」互相打架，',
    '  // 而且空格会在玩家换玉简时顺手把引导跳掉（两个功能一起动，最难查）。',
    '  if (renderer.skillVisible) {',
    '    const rows = orderedSkillRows(session.character);',
    '    const row = rows[skillCursor.skill];',
    '    const skillId = row ? row.skill.id : null;',
    "    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {",
    '      e.preventDefault();',
    '      skillCursor = {',
    "        skill: moveSkillCursor(skillCursor.skill, e.code === 'ArrowDown' ? 1 : -1, rows.length),",
    '        slot: skillCursor.slot,',
    '      };',
    '      syncSkillCursor();',
    '      return;',
    '    }',
    "    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {",
    '      e.preventDefault();',
    '      skillCursor = {',
    '        skill: skillCursor.skill,',
    "        slot: moveSlotCursor(skillCursor.slot, e.code === 'ArrowRight' ? 1 : -1),",
    '      };',
    '      syncSkillCursor();',
    '      return;',
    '    }',
    "    if ((e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') && skillId) {",
    '      e.preventDefault();',
    '      if (row && row.unlocked) {',
    '        commitGemLoadout(skillId, cycleGemAt(session.character, skillId, skillCursor.slot, 1));',
    '        const picked = gemAtSlot(session.character, skillId, skillCursor.slot);',
    '        session.log.push({',
    "          text: row.skill.name + ' 第 ' + (skillCursor.slot + 1) + ' 槽 → ' + (picked ? picked.name : '空槽'),",
    "          color: '#d4a13c',",
    '          age: 0,',
    '        });',
    '      }',
    '      return;',
    '    }',
    "    if (e.code === 'KeyR' && skillId) {",
    '      e.preventDefault();',
    '      if (row && row.unlocked) {',
    '        commitGemLoadout(skillId, resetGemLoadout(session.character, skillId));',
    "        session.log.push({ text: row.skill.name + ' 玉简恢复自动装配', color: '#d4a13c', age: 0 });",
    '      }',
    '      return;',
    '    }',
    '  }',
  ],
  'keys',
);

// ── 4) 开面板时初始化光标；关面板时清掉渲染层光标 ─────────────
rep(
  ['  if (e.code === \'KeyG\') {', '    const on = renderer.toggleSkill();'].join('\n'),
  [
    "  if (e.code === 'KeyG') {",
    '    const on = renderer.toggleSkill();',
    '    if (on) {',
    '      // 打开时把光标夹回有效行：面板可能是在「又解锁了几条神通」之后打开的',
    '      const rows = orderedSkillRows(session.character);',
    '      skillCursor = {',
    '        skill: moveSkillCursor(skillCursor.skill, 0, rows.length),',
    '        slot: moveSlotCursor(skillCursor.slot, 0),',
    '      };',
    '      syncSkillCursor();',
    '    } else {',
    '      renderer.setSkillCursor(null);',
    '    }',
  ],
  'toggleG',
);

// ── 5) 调试钩子 ────────────────────────────────────────────
rep(
  '    get tutorialLength() {',
  [
    '    /** 某条神通当前的装配（探针断言用；与面板画的是同一个来源） */',
    '    gems(skillId: string) {',
    '      return characterGemLoadout(session.character, skillId);',
    '    },',
    '    /** 面板光标（探针断言「方向键真的动了光标」） */',
    '    get skillCursor() {',
    '      return { skill: skillCursor.skill, slot: skillCursor.slot };',
    '    },',
    '    get tutorialLength() {',
  ],
  'hooks',
);

const out = crlf ? n.replace(/\n/g, '\r\n') : n;
if (out.length < raw.length * 0.9) throw new Error('长度断言失败 ' + raw.length + ' -> ' + out.length);
mkdirSync('tools/_bak', { recursive: true });
writeFileSync('tools/_bak/main.ts.gem.bak', raw, 'utf8');
writeFileSync(p, out, 'utf8');
console.log('written', raw.length, '->', out.length, 'crlf=', crlf);
