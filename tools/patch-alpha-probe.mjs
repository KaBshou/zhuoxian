// 一次性补丁：修两个真渲染 bug + 接 D39 分通道
// bug1: drawLog 循环里改 globalAlpha 后没恢复 → 后面画的 HUD/详解/详情全是半透明
// bug2: drawEquipmentDetail 没 save/restore，全屏遮罩的 alpha 会漏给后续绘制
// D39: lootQuantity 只放大通货/玉简；lootRarity 以 0.5 折进 rarityBonus（在 rollMonsterDrop 内部）
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

// ── bug1: drawLog 之后恢复 alpha ─────────────────────────
load('src/render/battle-renderer.ts');
const logStart = files['src/render/battle-renderer.ts'].cur.indexOf('private drawLog');
if (logStart < 0) throw new Error('找不到 drawLog');
console.log('drawLog 片段：\n' + files['src/render/battle-renderer.ts'].cur.slice(logStart, logStart + 1200));
flush('src/render/battle-renderer.ts');
