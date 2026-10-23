// 一次性补丁：把「存档面板」接进渲染器（第二轮：panelOpen 改用 switch 内唯一锚点）。
// 教训 3：`return this.showMarksPanel;` 在文件里出现两次（getter + panelOpen），单行锚点必 AMBIGUOUS。
//         switch 里的 case 分支才是唯一的。
import fs from 'node:fs';

const p = 'src/render/battle-renderer.ts';
const Q = String.fromCharCode(39);
let c = fs.readFileSync(p, 'utf8');
const before = c.length;

function rep(old, neu, tag) {
  if (!c.includes(old)) throw new Error(`MISS ${tag}`);
  if (c.split(old).length - 1 !== 1) throw new Error(`AMBIGUOUS ${tag}`);
  c = c.replace(old, neu);
}
const q = (s) => Q + s + Q;

// 1) import
rep(
  `import { drawMarksPanel } from ${q('./marks-panel')};`,
  `import { drawMarksPanel } from ${q('./marks-panel')};\n` +
    `import { drawSavePanel, type SavePanelPaint, type SavePanelPhase } from ${q('./save-panel')};`,
  'import',
);

// 2) 字段
rep(
  '  private showMarksPanel = false;',
  [
    '  private showMarksPanel = false;',
    '  /** 存档面板的状态（null = 关着）。文案与阶段都由 main.ts 给，渲染器不自己编事实。 */',
    '  private savePaint: (SavePanelPaint & { readonly phase: SavePanelPhase }) | null = null;',
  ].join('\n'),
  'field',
);

// 3) toggle / getter
rep(
  [
    '  toggleMarksPanel(): boolean {',
    '    this.showMarksPanel = !this.showMarksPanel;',
    '    return this.showMarksPanel;',
    '  }',
  ].join('\n'),
  [
    '  toggleMarksPanel(): boolean {',
    '    this.showMarksPanel = !this.showMarksPanel;',
    '    return this.showMarksPanel;',
    '  }',
    '',
    '  /** 存档面板没有「切换」语义：打开时由 main.ts 给初始 paint，关闭时置 null。 */',
    '  setSavePanel(paint: (SavePanelPaint & { readonly phase: SavePanelPhase }) | null): void {',
    '    this.savePaint = paint;',
    '  }',
    '',
    '  get savePanelVisible(): boolean {',
    '    return this.savePaint !== null;',
    '  }',
  ].join('\n'),
  'toggle',
);

// 4) panelOpen：锚 case 分支（唯一）
rep(
  `      case ${q('achievement')}:\n        return this.showAchievements;\n    }`,
  `      case ${q('achievement')}:\n        return this.showAchievements;\n      case ${q('save')}:\n        return this.savePaint !== null;\n    }`,
  'panelOpen',
);

// 5) closeAllPanels
rep('    this.showMarksPanel = false;', '    this.showMarksPanel = false;\n    this.savePaint = null;', 'close');

// 6) activeButtons
rep(
  `    if (this.showMarksPanel) on.push(${q('marks')});`,
  `    if (this.showMarksPanel) on.push(${q('marks')});\n    if (this.savePaint !== null) on.push(${q('save')});`,
  'active',
);

// 7) render
rep(
  '    drawHudButtons(this.ctx, BATTLE_W, { text: C.text, dim: C.dim, edge: C.barEdge, frame: C.gold }, this.activeButtons());',
  [
    '    if (this.savePaint !== null) {',
    '      drawSavePanel(this.ctx, BATTLE_W, BATTLE_H, this.savePaint.phase, this.savePaint);',
    '    }',
    '    drawHudButtons(this.ctx, BATTLE_W, { text: C.text, dim: C.dim, edge: C.barEdge, frame: C.gold }, this.activeButtons());',
  ].join('\n'),
  'render',
);

if (c.length < before) throw new Error('SHRINK 结果比原文短，拒绝写盘');
fs.writeFileSync(p, c, 'utf8');
console.log(`patched battle-renderer.ts (${before} -> ${c.length} chars)`);
