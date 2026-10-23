// 一次性：把神通/玉简面板接进渲染器 + G 键
import fs from 'node:fs';

function edit(P, pairs) {
  let c = fs.readFileSync(P, 'utf8');
  const before = c.length;
  fs.writeFileSync(P + '.' + Date.now() + '.bak', c, 'utf8');
  for (const [oldText, newText, tag] of pairs) {
    if (!c.includes(oldText)) throw new Error('MISS(' + tag + ') in ' + P + '\n--- looked for ---\n' + oldText);
    const n = c.split(oldText).length - 1;
    if (n !== 1) throw new Error(`AMBIGUOUS(${n}): ${tag}`);
    c = c.replace(oldText, newText);
    console.log('OK:', tag);
  }
  if (c.length < before * 0.9) throw new Error('结果比原文短 10% 以上，拒绝写盘: ' + P);
  fs.writeFileSync(P, c, 'utf8');
  console.log('written', P, before, '->', c.length);
}

// ---------- battle-renderer.ts ----------
edit('F:/dsh-work/zhuoxian/src/render/battle-renderer.ts', [
  [
    `import { drawTalentPanel } from './talent-panel';`,
    `import { drawTalentPanel } from './talent-panel';
import { drawSkillPanel } from './skill-panel';`,
    'import-skill-panel',
  ],
  [
    `  private showTalent = false;`,
    `  private showTalent = false;
  private showSkill = false;`,
    'field-showSkill',
  ],
  [
    `  get talentVisible(): boolean {`,
    `  /** 神通/玉简面板开关（G）。返回切换后的状态，调用方据此写日志。 */
  toggleSkill(): boolean {
    this.showSkill = !this.showSkill;
    return this.showSkill;
  }

  get skillVisible(): boolean {
    return this.showSkill;
  }

  get talentVisible(): boolean {`,
    'toggle-skill',
  ],
  [
    `    if (this.showTalent) drawTalentPanel(this.ctx, s);`,
    `    if (this.showTalent) drawTalentPanel(this.ctx, s);
    if (this.showSkill) drawSkillPanel(this.ctx, s);`,
    'render-call',
  ],
]);

// ---------- main.ts ----------
edit('F:/dsh-work/zhuoxian/src/main.ts', [
  [
    `      // 周天图`,
    `      // 神通 / 玉简
      if (e.code === 'KeyG') {
        const open = renderer.toggleSkill();
        pushLog(session, open ? '神通面板：看到每条神通装了什么玉简' : '收起神通面板', '#6d665c');
        return;
      }
      // 周天图`,
    'key-G',
  ],
  [
    `　←→ 回刷　1/2/3 渊痕　E 法宝　D 详解`,
    `　←→ 回刷　1/2/3 渊痕　E 法宝　D 详解　T 周天　G 神通`,
    'footer-hint',
  ],
]);
