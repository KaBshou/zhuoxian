// 把成就面板接进渲染器（D89）：字段 / 开关 / panelOpen / closeAllPanels / activeButtons / render
import fs from 'node:fs';

const P = 'F:/dsh-work/zhuoxian/src/render/battle-renderer.ts';
let raw = fs.readFileSync(P, 'utf8');
const crlf = raw.includes('\r\n');
const nl = crlf ? '\r\n' : '\n';
raw = raw.replace(/\r\n/g, '\n');
const before = raw.length;

const pairs = [
  [
    '  /** 渊痕价目表（按 M）：满级后唯一还在涨的数字，必须能点开看价 */\n  private showMarksPanel = false;',
    '  /** 渊痕价目表（按 M）：满级后唯一还在涨的数字，必须能点开看价 */\n  private showMarksPanel = false;\n  /** 成就（按 J，D87）：24h 缺口里「有终点」的收集。看不见的进度等于不存在 */\n  private showAchievements = false;',
  ],
  [
    '  get marksPanelVisible(): boolean {\n    return this.showMarksPanel;\n  }',
    '  get marksPanelVisible(): boolean {\n    return this.showMarksPanel;\n  }\n\n  /** 成就面板开关（J）。返回切换后的状态，调用方据此写日志。 */\n  toggleAchievements(): boolean {\n    this.showAchievements = !this.showAchievements;\n    return this.showAchievements;\n  }\n\n  get achievementsVisible(): boolean {\n    return this.showAchievements;\n  }',
  ],
  [
    "      case 'marks':\n        return this.showMarksPanel;",
    "      case 'marks':\n        return this.showMarksPanel;\n      case 'achievement':\n        return this.showAchievements;",
  ],
  [
    '    this.showCodex = false;\n    this.showMarksPanel = false;\n    this.skillCursor = null;',
    '    this.showCodex = false;\n    this.showMarksPanel = false;\n    this.showAchievements = false;\n    this.skillCursor = null;',
  ],
  [
    "    if (this.showCodex) on.push('codex');\n    if (this.showMarksPanel) on.push('marks');",
    "    if (this.showCodex) on.push('codex');\n    if (this.showAchievements) on.push('achievement');\n    if (this.showMarksPanel) on.push('marks');",
  ],
  [
    '    if (this.showCodex) drawCodexPanel(this.ctx, s.codex, BATTLE_W, BATTLE_H, this.codexCursor);',
    '    if (this.showCodex) drawCodexPanel(this.ctx, s.codex, BATTLE_W, BATTLE_H, this.codexCursor);\n    if (this.showAchievements) {\n      // 事实从 session 现算：面板不许自己算第二套口径\n      drawAchievementPanel(this.ctx, s.achievements, sessionAchievementFacts(s), BATTLE_W, BATTLE_H);\n    }',
  ],
];

for (const [oldText, newText] of pairs) {
  if (!raw.includes(oldText)) throw new Error(`MISS: ${oldText.slice(0, 60)}`);
  raw = raw.replace(oldText, newText);
}

// import：面板 + 事实函数
const importAnchor = "import { drawCodexPanel } from './codex-panel';";
if (!raw.includes(importAnchor)) throw new Error('MISS import anchor: codex-panel');
raw = raw.replace(importAnchor, `${importAnchor}\nimport { drawAchievementPanel } from './achievement-panel';`);

const sessionImport = "import type { GameSession } from '../core/session';";
if (!raw.includes(sessionImport)) throw new Error('MISS import anchor: session');
raw = raw.replace(sessionImport, `import { pushLog, sessionAchievementFacts, tickSession, type GameSession } from '../core/session';`);

if (raw.length < before * 0.95) throw new Error('长度断言失败：替换后再短了');
if (crlf) raw = raw.replace(/\n/g, nl);
fs.mkdirSync('F:/dsh-work/zhuoxian/tools/_bak', { recursive: true });
fs.writeFileSync(`F:/dsh-work/zhuoxian/tools/_bak/battle-renderer.ts.${Date.now()}.bak`, fs.readFileSync(P));
fs.writeFileSync(P, raw);
console.log(`battle-renderer patched: ${before} -> ${raw.length}`);
