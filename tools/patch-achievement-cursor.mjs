// 成就面板光标：渲染器持副本 + main 接管 ↑↓ + 关面板清光标
import fs from 'node:fs';

function patch(path, pairs) {
  let raw = fs.readFileSync(path, 'utf8');
  const crlf = raw.includes('\r\n');
  const nl = crlf ? '\r\n' : '\n';
  raw = raw.replace(/\r\n/g, '\n');
  const before = raw.length;
  for (const [oldText, newText] of pairs) {
    if (!raw.includes(oldText)) throw new Error(`MISS in ${path}: ${oldText.slice(0, 70)}`);
    raw = raw.replace(oldText, newText);
  }
  if (raw.length < before) throw new Error(`长度断言失败 ${path}`);
  if (crlf) raw = raw.replace(/\n/g, nl);
  fs.mkdirSync('F:/dsh-work/zhuoxian/tools/_bak', { recursive: true });
  fs.writeFileSync(`F:/dsh-work/zhuoxian/tools/_bak/${path.split('/').pop()}.${Date.now()}.bak`, fs.readFileSync(path));
  fs.writeFileSync(path, raw);
  console.log(`${path.split('/').pop()}: ${before} -> ${raw.length}`);
}

// ---------- 渲染器 ----------
patch('F:/dsh-work/zhuoxian/src/render/battle-renderer.ts', [
  [
    '  private showAchievements = false;',
    [
      '  private showAchievements = false;',
      '  // 光标只在这里存「本帧副本」：权威在 main.ts（与图鉴/神通同一条纪律，',
      '  // 免得面板与 session 两处各记一份、翻着翻着对不上）。',
      '  private achievementCursor = 0;',
    ].join('\n'),
  ],
  [
    '  toggleAchievements(): boolean {\n    this.showAchievements = !this.showAchievements;\n    return this.showAchievements;\n  }',
    [
      '  toggleAchievements(): boolean {',
      '    this.showAchievements = !this.showAchievements;',
      '    // 关掉时把光标归零：下次打开停在第一条，而不是上次翻到的第 17 条',
      '    if (!this.showAchievements) this.achievementCursor = 0;',
      '    return this.showAchievements;',
      '  }',
      '',
      '  setAchievementCursor(index: number): void {',
      '    this.achievementCursor = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0;',
      '  }',
      '',
      '  get achievementCursorState(): number {',
      '    return this.achievementCursor;',
      '  }',
    ].join('\n'),
  ],
  [
    '      drawAchievementPanel(this.ctx, s.achievements, sessionAchievementFacts(s), BATTLE_W, BATTLE_H);',
    '      drawAchievementPanel(this.ctx, s.achievements, sessionAchievementFacts(s), BATTLE_W, BATTLE_H, this.achievementCursor);',
  ],
]);

// ---------- main ----------
patch('F:/dsh-work/zhuoxian/src/main.ts', [
  [
    [
      '  // J = 成就（D87）：「有终点」的收集。只读面板，Escape 也由 activatePanel 之外的',
      '  // 上一条通用分支处理（面板只进不出是玩家最容易被骂的缺口，见 D91.1）。',
      "  if (renderer.achievementsVisible && e.code === 'Escape') {",
      '    e.preventDefault();',
      '    renderer.toggleAchievements();',
      "    session.log.push({ text: '关闭成就', color: '#6d665c', age: 0 });",
      '    return;',
      '  }',
      "  if (e.code === 'KeyJ') {",
      "    activatePanel('achievement');",
      '    return;',
      '  }',
    ].join('\n'),
    [
      '  // J = 成就（D87）：「有终点」的收集。打开时接管 ↑↓ 翻条目 ——',
      '  // 否则方向键会顺手去回刷层（与图鉴、神通面板是同一个冲突）。',
      "  if (renderer.achievementsVisible && (e.code === 'ArrowUp' || e.code === 'ArrowDown')) {",
      '    e.preventDefault();',
      "    achievementCursor = moveAchievementCursor(achievementCursor, e.code === 'ArrowDown' ? 1 : -1, ACHIEVEMENT_TOTAL);",
      '    renderer.setAchievementCursor(achievementCursor);',
      '    return;',
      '  }',
      "  if (renderer.achievementsVisible && (e.code === 'KeyJ' || e.code === 'Escape')) {",
      '    e.preventDefault();',
      '    renderer.toggleAchievements();',
      "    session.log.push({ text: '关闭成就', color: '#6d665c', age: 0 });",
      '    return;',
      '  }',
      "  if (e.code === 'KeyJ') {",
      "    activatePanel('achievement');",
      '    return;',
      '  }',
    ].join('\n'),
  ],
  [
    "import { achievementEntries, achievementSummary } from './core/achievement';",
    [
      "import {",
      '  ACHIEVEMENT_TOTAL,',
      '  achievementEntries,',
      '  achievementSummary,',
      '  moveAchievementCursor,',
      "} from './core/achievement';",
    ].join('\n'),
  ],
]);

// ---------- main：光标状态 + 打开时夹回 + 钩子 ----------
let raw = fs.readFileSync('F:/dsh-work/zhuoxian/src/main.ts', 'utf8');
const crlf = raw.includes('\r\n');
const nl = crlf ? '\r\n' : '\n';
raw = raw.replace(/\r\n/g, '\n');
const before = raw.length;

// 1) 状态变量：放在 codexCursor 附近
const cursorAnchor = 'let codexCursor = 0;';
if (!raw.includes(cursorAnchor)) throw new Error('MISS codexCursor decl');
raw = raw.replace(
  cursorAnchor,
  [cursorAnchor, '// 成就光标权威在 main.ts（渲染器只持本帧副本）', 'let achievementCursor = 0;'].join('\n'),
);

// 2) activatePanel 的 achievement 分支：打开时夹回有效行
const branchAnchor = "  if (id === 'achievement') {";
if (!raw.includes(branchAnchor)) throw new Error('MISS activatePanel achievement branch');
// 找到该分支内部第一行，插入 clamp
raw = raw.replace(
  branchAnchor,
  [
    branchAnchor,
    '    // 条目数会随版本变（现在是 20），打开时按总数夹一次 —— 存档里没有光标，',
    '    // 但长按/越界仍可能把光标留在数组外，夹一次比在渲染里判稳。',
    '    achievementCursor = moveAchievementCursor(achievementCursor, 0, ACHIEVEMENT_TOTAL);',
    '    renderer.setAchievementCursor(achievementCursor);',
  ].join('\n'),
);

// 3) 调试钩子：achievementCursor
const hookAnchor = '    achievementFacts: () => sessionAchievementFacts(session),';
if (!raw.includes(hookAnchor)) throw new Error('MISS achievementFacts hook');
raw = raw.replace(
  hookAnchor,
  [hookAnchor, '    get achievementCursor() {', '      return achievementCursor;', '    },'].join('\n'),
);
const typeAnchor = '      achievementFacts(): {';
if (!raw.includes(typeAnchor)) throw new Error('MISS achievementFacts type');
raw = raw.replace(
  typeAnchor,
  ['      /** 成就光标（探针断言「方向键真的动了光标」） */', '      readonly achievementCursor: number;', typeAnchor].join('\n'),
);

if (raw.length < before) throw new Error('长度断言失败 main 光标');
if (crlf) raw = raw.replace(/\n/g, nl);
fs.writeFileSync(`F:/dsh-work/zhuoxian/tools/_bak/main.ts.${Date.now()}.bak`, fs.readFileSync('F:/dsh-work/zhuoxian/src/main.ts'));
fs.writeFileSync('F:/dsh-work/zhuoxian/src/main.ts', raw);
console.log(`main.ts cursor: ${before} -> ${raw.length}`);
