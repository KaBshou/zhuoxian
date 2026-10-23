// 一次性补丁：损伤详解面板（渲染器 + 键盘开关）
import fs from 'node:fs';

const ROOT = 'F:/dsh-work/zhuoxian';
const files = {};
function load(rel) {
  const p = `${ROOT}/${rel}`;
  const c = fs.readFileSync(p, 'utf8');
  files[rel] = { p, orig: c, cur: c };
  fs.writeFileSync(`${ROOT}/tools/_bak/${rel.replace(/\//g, '_')}.${Date.now()}.bak`, c, 'utf8');
}
function repl(rel, old, neu, tag) {
  const f = files[rel];
  const n = f.cur.split(old).length - 1;
  if (n !== 1) throw new Error(`MISS(${n}) ${rel}: ${tag}`);
  f.cur = f.cur.replace(old, neu);
  console.log('ok:', rel, tag);
}
function flush(rel) {
  const f = files[rel];
  if (f.cur.length < f.orig.length * 0.98) throw new Error(`拒绝写盘 ${rel}`);
  fs.writeFileSync(f.p, f.cur, 'utf8');
  console.log('flush', rel, f.cur.length, 'B');
}

// ── renderer ─────────────────────────────────────────────
load('src/render/battle-renderer.ts');
repl('src/render/battle-renderer.ts',
  `  /** 当前地板是按哪一阶画的，换阶才重建 */
  private floorTier = -1;`,
  `  /** 当前地板是按哪一阶画的，换阶才重建 */
  private floorTier = -1;
  /** 是否显示「损伤详解」面板（按 D 切换） */
  private showBreakdown = false;

  /** 切换损伤详解面板，返回切换后的状态 */
  toggleBreakdown(): boolean {
    this.showBreakdown = !this.showBreakdown;
    return this.showBreakdown;
  }

  get breakdownVisible(): boolean {
    return this.showBreakdown;
  }`,
  'toggle-field',
);
repl('src/render/battle-renderer.ts',
  `  private drawLog(s: GameSession): void {`,
  `  /**
   * 损伤详解：把 computeDamage 留下的一步步摊开给玩家看。
   *
   * 为什么值得做（GDD 4.7）：它同时是三样东西 ——
   * 玩家的计算器（"我该堆破绽还是堆伤害"能被算出来）、
   * 我们的调试工具（面板和实战数字永远同源，不会有第二套公式）、
   * 最好的新手引导（比任何文字教程都直观）。
   */
  private drawBreakdown(s: GameSession): void {
    const bd = s.battle.lastBreakdown;
    if (!bd) return;
    const ctx = this.ctx;
    const lines = bd.steps.slice(-6);
    const W = 300;
    const H = 40 + lines.length * 15;
    const X = BATTLE_W - W - 14;
    const Y = 54;

    ctx.fillStyle = 'rgba(11,10,12,0.86)';
    ctx.fillRect(X, Y, W, H);
    ctx.strokeStyle = 'rgba(140,165,200,0.22)';
    ctx.lineWidth = 1;
    ctx.strokeRect(X + 0.5, Y + 0.5, W - 1, H - 1);

    ctx.textAlign = 'left';
    ctx.font = '11px "Noto Sans SC", system-ui, sans-serif';
    ctx.fillStyle = C.dim;
    ctx.fillText('损伤详解（D 关闭）', X + 10, Y + 16);
    ctx.fillStyle = C.text;
    ctx.fillText(bd.label, X + 10, Y + 32);

    let y = Y + 48;
    for (const st of lines) {
      ctx.fillStyle = C.dim;
      ctx.fillText(st.label, X + 10, y);
      ctx.fillStyle = C.text;
      ctx.textAlign = 'right';
      ctx.fillText(\`\${st.before.toFixed(1)} → \${st.after.toFixed(1)}\`, X + W - 10, y);
      ctx.textAlign = 'left';
      y += 15;
    }

    ctx.textAlign = 'right';
    ctx.fillStyle = bd.isCrit ? C.gold ?? '#d4a13c' : C.playerEdge;
    ctx.fillText(\`最终 \${bd.amount}\${bd.isCrit ? '（破绽）' : ''}\`, X + W - 10, Y + H - 8);
    ctx.textAlign = 'left';
  }

  private drawLog(s: GameSession): void {`,
  'draw-breakdown',
);
flush('src/render/battle-renderer.ts');
console.log('phase renderer done');
