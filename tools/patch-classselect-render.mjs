// 一次性：BattleRenderer 增加「开局选道统」的渲染入口（入口层不许自己拿 canvas 画）
import fs from 'node:fs';

const P = 'F:/dsh-work/zhuoxian/src/render/battle-renderer.ts';
let c = fs.readFileSync(P, 'utf8');
const before = c.length;

function repl(a, b, tag) {
  if (!c.includes(a)) throw new Error('MISS: ' + tag);
  const n = c.split(a).length - 1;
  if (n !== 1) throw new Error(`AMBIGUOUS(${n}): ${tag}`);
  c = c.replace(a, b);
  console.log('OK:', tag);
}

repl(
  `import { drawSkillPanel } from './skill-panel';`,
  `import { drawSkillPanel } from './skill-panel';
import { drawClassSelect } from './class-select';`,
  'import',
);

repl(
  `  render(s: GameSession): void {`,
  `  /**
   * 画开局选道统画面。
   *
   * 为什么放在渲染器里而不是 main.ts：入口层不许自己持 canvas 上下文
   * （否则「谁在画」这件事会有两个答案，本项目踩过同类坑：HUD 与 session 的波次口径不一致）。
   */
  renderClassSelect(index: number, timeSec: number): void {
    this.ctx.fillStyle = C.void;
    this.ctx.fillRect(0, 0, BATTLE_W, BATTLE_H);
    drawClassSelect(this.ctx, index, timeSec);
  }

  render(s: GameSession): void {`,
  'method',
);

if (c.length < before * 0.95) throw new Error('结果比原文短，拒绝写盘');
fs.writeFileSync(P, c, 'utf8');
console.log('written', before, '->', c.length);
