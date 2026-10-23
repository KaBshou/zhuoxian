// 一次性补丁：把 HUD 面板接进 battle-renderer。跑完即弃。
import fs from 'node:fs';

const p = 'src/render/battle-renderer.ts';
let c = fs.readFileSync(p, 'utf8');
let misses = [];

function repl(old, neu, tag) {
  if (!c.includes(old)) {
    misses.push(tag);
    return;
  }
  c = c.split(old).join(neu);
}

repl(
  "import type { Rarity } from '../data/rarity';",
  "import type { Rarity } from '../data/rarity';\nimport { drawStatusPanel, drawEquipmentPanel, drawBagPanel } from './hud-panels';",
  'imp',
);

repl(
  '    this.drawLog(s);',
  '    this.drawLog(s);\n    this.drawHudPanels(s);',
  'call',
);

repl(
  '  private drawLog(s: GameSession): void {',
  '  private drawHudPanels(s: GameSession): void {\n    drawStatusPanel(this.ctx, s);\n    drawEquipmentPanel(this.ctx, s);\n    drawBagPanel(this.ctx, s);\n  }\n\n  private drawLog(s: GameSession): void {',
  'method',
);

if (misses.length > 0) {
  console.error('MISS:', misses.join(', '));
  process.exit(1);
}
fs.writeFileSync(p, c, 'utf8');
console.log('OK');
