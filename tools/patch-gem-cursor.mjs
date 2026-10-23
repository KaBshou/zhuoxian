// 把神通面板光标接进 battle-renderer.ts（apply 型补丁，锚点 MISS 就 throw 不写盘）
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const p = 'src/render/battle-renderer.ts';
const raw = readFileSync(p, 'utf8');
const crlf = raw.includes('\r\n');
let n = raw.replace(/\r\n/g, '\n');

function rep(oldText, newText, tag) {
  if (oldText === n) throw new Error(`${tag}: 第一参是整文件，拒绝执行`);
  if (!n.includes(oldText)) throw new Error(`${tag}: MISS`);
  if (n.split(oldText).length - 1 !== 1) throw new Error(`${tag}: 命中多次`);
  n = n.replace(oldText, newText);
  console.log('ok', tag);
}

rep(
  "import { drawSkillPanel } from './skill-panel';",
  "import { drawSkillPanel } from './skill-panel';\nimport type { SkillCursor } from './skill-panel';",
  'import',
);

rep(
  '  private showSkill = false;',
  '  private showSkill = false;\n  /** 神通面板的光标（main.ts 是权威状态，这里只存一份给渲染用） */\n  private skillCursor: SkillCursor | null = null;',
  'field',
);

rep(
  '    this.showSkill = !this.showSkill;\n    return this.showSkill;',
  '    this.showSkill = !this.showSkill;\n    if (!this.showSkill) this.skillCursor = null;\n    return this.showSkill;',
  'toggle',
);

rep(
  '  get skillVisible(): boolean {',
  '  /** 设置神通面板光标（null = 不画光标；关面板时自动清空，避免下次打开残留） */\n  setSkillCursor(cursor: SkillCursor | null): void {\n    this.skillCursor = cursor;\n  }\n\n  get skillCursorState(): SkillCursor | null {\n    return this.skillCursor;\n  }\n\n  get skillVisible(): boolean {',
  'setter',
);

rep(
  '    if (this.showSkill) drawSkillPanel(this.ctx, s);',
  '    if (this.showSkill) drawSkillPanel(this.ctx, s, s.character, this.skillCursor);',
  'draw',
);

const out = crlf ? n.replace(/\n/g, '\r\n') : n;
if (out.length < raw.length * 0.9) throw new Error(`长度断言失败 ${raw.length} -> ${out.length}`);
mkdirSync('tools/_bak', { recursive: true });
writeFileSync(join('tools/_bak', 'battle-renderer.ts.bak'), raw, 'utf8');
writeFileSync(p, out, 'utf8');
console.log('written', raw.length, '->', out.length, 'crlf=', crlf);
