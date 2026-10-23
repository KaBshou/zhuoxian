// 一次性补丁：把损伤详解接进 render 顺序 + 键盘 D 开关
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

load('src/render/battle-renderer.ts');
repl('src/render/battle-renderer.ts',
  `    this.drawLog(s);
    this.drawHudPanels(s);`,
  `    this.drawLog(s);
    this.drawHudPanels(s);
    if (this.showBreakdown) this.drawBreakdown(s);`,
  'render-call',
);
flush('src/render/battle-renderer.ts');

load('src/main.ts');
repl('src/main.ts',
  `window.addEventListener('keydown', (e) => {
  if (e.code !== 'ArrowLeft' && e.code !== 'ArrowRight') return;`,
  `window.addEventListener('keydown', (e) => {
  // D = 损伤详解面板（"我这一下为什么只打出这么点"的答案）
  if (e.code === 'KeyD') {
    const on = renderer.toggleBreakdown();
    session.log.push({
      text: on ? '打开损伤详解（再按 D 关闭）' : '关闭损伤详解',
      color: '#6d665c',
      age: 0,
    });
    return;
  }
  if (e.code !== 'ArrowLeft' && e.code !== 'ArrowRight') return;`,
  'key-d',
);
repl('src/main.ts',
  `      /** 当前可选层上限 */
      floorSelectableMax(): number;`,
  `      /** 当前可选层上限 */
      floorSelectableMax(): number;
      /** 切换损伤详解面板（探针验收用） */
      toggleBreakdown(): boolean;`,
  'hook-type-d',
);
repl('src/main.ts',
  `    floorSelectableMax: () => floorSelectableMax(session),`,
  `    floorSelectableMax: () => floorSelectableMax(session),
    toggleBreakdown: () => renderer.toggleBreakdown(),`,
  'hook-impl-d',
);
flush('src/main.ts');
console.log('done');
