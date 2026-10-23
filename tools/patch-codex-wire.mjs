// D87 图鉴接线：battle-renderer.ts（面板开关/光标/绘制）+ main.ts（K 键/方向键/调试钩子）
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';

function patch(file, pairs) {
  const raw = readFileSync(file, 'utf8');
  let c = raw;
  for (const [tag, oldText, newText] of pairs) {
    if (!c.includes(oldText)) throw new Error(`MISS ${file} :: ${tag}`);
    c = c.replace(oldText, newText);
  }
  if (c.length < raw.length * 0.9) throw new Error(`长度异常 ${file}: ${raw.length} → ${c.length}`);
  mkdirSync('tools/_bak', { recursive: true });
  copyFileSync(file, `tools/_bak/${file.replace(/[\\/]/g, '_')}.bak`);
  writeFileSync(file, c, 'utf8');
  console.log(`patched ${file}: ${raw.length} → ${c.length} chars`);
}

patch('src/render/battle-renderer.ts', [
  [
    'import drawCodexPanel',
    `import { drawSkillPanel } from './skill-panel';`,
    `import { drawSkillPanel } from './skill-panel';
import { drawCodexPanel } from './codex-panel';`,
  ],
  [
    '字段',
    `  private showSkill = false;
  /** 神通面板的光标（main.ts 是权威状态，这里只存一份给渲染用） */
  private skillCursor: SkillCursor | null = null;`,
    `  private showSkill = false;
  /** 图鉴（按 K，D87）。收集进度看不见 = 收集这件事在玩家心里不存在 */
  private showCodex = false;
  private codexCursor = 0;
  /** 神通面板的光标（main.ts 是权威状态，这里只存一份给渲染用） */
  private skillCursor: SkillCursor | null = null;`,
  ],
  [
    'toggle 方法',
    `  get talentVisible(): boolean {
    return this.showTalent;
  }`,
    `  get talentVisible(): boolean {
    return this.showTalent;
  }

  /** 图鉴开关（K）。返回切换后的状态，调用方据此写日志。 */
  toggleCodex(): boolean {
    this.showCodex = !this.showCodex;
    return this.showCodex;
  }

  /** 图鉴光标（main.ts 是权威状态，这里只存一份给渲染用） */
  setCodexCursor(index: number): void {
    this.codexCursor = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0;
  }

  get codexVisible(): boolean {
    return this.showCodex;
  }`,
  ],
  [
    '绘制',
    `    if (this.showSkill) drawSkillPanel(this.ctx, s, s.character, this.skillCursor);`,
    `    if (this.showSkill) drawSkillPanel(this.ctx, s, s.character, this.skillCursor);
    if (this.showCodex) drawCodexPanel(this.ctx, s.codex, BATTLE_W, BATTLE_H, this.codexCursor);`,
  ],
]);

patch('src/main.ts', [
  [
    'import codex 光标',
    `import { applyGemLoadout, cycleGemAt, gemAtSlot, moveSkillCursor, moveSlotCursor, orderedSkillRows, resetGemLoadout } from './core/gem-edit';`,
    `import { applyGemLoadout, cycleGemAt, gemAtSlot, moveSkillCursor, moveSlotCursor, orderedSkillRows, resetGemLoadout } from './core/gem-edit';
import { CODEX_TOTAL, codexProgress, moveCodexCursor } from './core/codex';`,
  ],
  [
    '光标状态',
    `let skillCursor = { skill: 0, slot: 0 };`,
    `let skillCursor = { skill: 0, slot: 0 };
/** 图鉴光标（绝对行号 0..CODEX_TOTAL-1）。独立于神通面板：两个面板不会同时开 */
let codexCursor = 0;`,
  ],
  [
    'K 键 + 方向键接管',
    `  // D = 损伤详解面板（"我这一下为什么只打出这么点"的答案）`,
    `  // K = 图鉴（"我收集到哪了"的答案，D87）。
  // 图鉴打开时接管 ↑↓（翻条目），否则方向键会顺手去回刷层 —— 和神通面板同一个冲突。
  if (renderer.codexVisible) {
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      e.preventDefault();
      codexCursor = moveCodexCursor(codexCursor, e.code === 'ArrowDown' ? 1 : -1, CODEX_TOTAL);
      renderer.setCodexCursor(codexCursor);
      return;
    }
    if (e.code === 'KeyK' || e.code === 'Escape') {
      e.preventDefault();
      renderer.toggleCodex();
      session.log.push({ text: '关闭图鉴', color: '#6d665c', age: 0 });
      return;
    }
  }
  if (e.code === 'KeyK') {
    const on = renderer.toggleCodex();
    if (on) {
      codexCursor = moveCodexCursor(codexCursor, 0, CODEX_TOTAL);
      renderer.setCodexCursor(codexCursor);
      const p = codexProgress(session.codex);
      session.log.push({
        text: \`打开图鉴（浊物 \${p.monsters.got}/\${p.monsters.total} · 传奇 \${p.legendaries.got}/\${p.legendaries.total}）\`,
        color: '#d4a13c',
        age: 0,
      });
    } else {
      session.log.push({ text: '关闭图鉴', color: '#6d665c', age: 0 });
    }
    return;
  }
  // D = 损伤详解面板（"我这一下为什么只打出这么点"的答案）`,
  ],
]);
