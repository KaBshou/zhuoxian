/**
 * 一次性补丁：把「画布铺满窗口」接进 main.ts，并把所有把 canvas.width/height 当坐标空间的
 * 地方换成逻辑常量（后备缓冲会随屏幕变大，canvas.width 不再等于 960）。
 *
 * 跑完即弃。用法：node tools/patch-viewport.mjs
 */
import fs from 'node:fs';

const P = 'F:/dsh-work/zhuoxian/src/main.ts';
const CSS = 'F:/dsh-work/zhuoxian/src/render/class-select.ts';
const SKILL = 'F:/dsh-work/zhuoxian/src/render/skill-panel.ts';

function rep(text, old, neu, tag) {
  const hits = text.split(old).length - 1;
  if (hits === 0) throw new Error('MISS ' + tag);
  if (hits > 1) throw new Error('AMBIGUOUS(' + hits + ') ' + tag);
  return text.replace(old, neu);
}

function patchFile(file, edits, minLen, label) {
  const raw = fs.readFileSync(file, 'utf8');
  const crlf = raw.includes('\r\n');
  let c = raw.replace(/\r\n/g, '\n');
  for (const [old, neu, tag] of edits) c = rep(c, old, neu, tag);
  if (c.length < minLen) throw new Error(label + ' SHRINK ' + c.length);
  fs.writeFileSync(file, crlf ? c.replace(/\n/g, '\r\n') : c, 'utf8');
  console.log(label + ' OK ' + c.length + ' chars');
}

// ── main.ts ────────────────────────────────────────────────
let main = fs.readFileSync(P, 'utf8').replace(/\r\n/g, '\n');

main = rep(
  main,
  "import { savePanelButtons, type SavePanelAction, type SavePanelPhase } from './render/save-panel';",
  "import { savePanelButtons, type SavePanelAction, type SavePanelPhase } from './render/save-panel';\nimport { LOGICAL_H, LOGICAL_W, resizeCanvas } from './render/viewport';",
  'import viewport',
);

main = rep(
  main,
  `const canvas = document.getElementById('stage');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('找不到 #stage 画布，检查 index.html');
}
`,
  `const canvas = document.getElementById('stage');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('找不到 #stage 画布，检查 index.html');
}

/**
 * 画布铺满窗口（用户要的「适配整个网页」）。
 *
 * 逻辑分辨率仍是 960×540 —— 这个文件里所有布局与命中测试都按它写 —— 变的只是
 * **后备缓冲的像素数**：resizeCanvas 按「显示宽度 × devicePixelRatio ÷ 960」算出
 * 像素比，把后备缓冲放大并 setTransform，于是大屏上的字是真的按倍数
 * 渲染出来的，而不是把小位图拉大（拉大会糊）。
 *
 * 时机很讲究：必须等 CSS 布局过之后再算（getBoundingClientRect 才有宽度），
 * 所以排一帧；窗口缩放/分屏/换屏都会触发 resize，重算一次即可。
 */
let pixelRatio = 1;
const syncViewport = (): void => {
  pixelRatio = resizeCanvas(canvas);
};
requestAnimationFrame(syncViewport);
window.addEventListener('resize', syncViewport);
`,
  'viewport init',
);

// 所有「拿 canvas.width/height 当坐标空间」的地方 → 逻辑常量
const swaps = [
  ['const pt = toCanvasPoint(e.clientX, e.clientY, rect, canvas.width, canvas.height);',
    'const pt = toCanvasPoint(e.clientX, e.clientY, rect, LOGICAL_W, LOGICAL_H);'],
  ['const hit = classCardRects(canvas.width, canvas.height).find(',
    'const hit = classCardRects(LOGICAL_W, LOGICAL_H).find('],
  ['const hitSave = savePanelButtons(canvas.width, canvas.height, savePhase).find(',
    'const hitSave = savePanelButtons(LOGICAL_W, LOGICAL_H, savePhase).find('],
  ['const hudWhileSave = hitTestHudButtons(pt.x, pt.y, canvas.width);',
    'const hudWhileSave = hitTestHudButtons(pt.x, pt.y, LOGICAL_W);'],
  ['const btn = hitTestHudButtons(pt.x, pt.y, canvas.width);',
    'const btn = hitTestHudButtons(pt.x, pt.y, LOGICAL_W);'],
  ['hudButtons: () => layoutHudButtons(canvas.width, canvas.height).map((b) => ({',
    'hudButtons: () => layoutHudButtons(LOGICAL_W, LOGICAL_H).map((b) => ({'],
  ['saveButtons: () => savePanelButtons(canvas.width, canvas.height, savePhase).map((b) => ({',
    'saveButtons: () => savePanelButtons(LOGICAL_W, LOGICAL_H, savePhase).map((b) => ({'],
  ['classCards: () => classCardRects(canvas.width, canvas.height).map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h })),',
    'classCards: () => classCardRects(LOGICAL_W, LOGICAL_H).map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h })),'],
];
for (const [old, neu] of swaps) main = rep(main, old, neu, 'swap ' + old.slice(0, 40));

if (main.includes('canvas.width') || main.includes('canvas.height')) {
  throw new Error('还有 canvas.width/height 没换掉：' + main.split('\n').filter((l) => l.includes('canvas.width') || l.includes('canvas.height')).join(' | '));
}
if (main.length < 36000) throw new Error('main.ts SHRINK ' + main.length);
fs.writeFileSync(P, main, 'utf8');
console.log('main.ts OK ' + main.length + ' chars');

// ── 面板：ctx.canvas.width/height 是后备缓冲，不是坐标空间 ──
patchFile(
  CSS,
  [
    ["import {", "import { LOGICAL_H, LOGICAL_W } from './viewport';\nimport {", 'import viewport'],
    ['const W = ctx.canvas.width;', 'const W = LOGICAL_W;', 'W'],
    ['const H = ctx.canvas.height;', 'const H = LOGICAL_H;', 'H'],
  ],
  1000,
  'class-select.ts',
);

patchFile(
  SKILL,
  [
    ["import {", "import { LOGICAL_H, LOGICAL_W } from './viewport';\nimport {", 'import viewport'],
    ['const x = (ctx.canvas.width - W) / 2;', 'const x = (LOGICAL_W - W) / 2;', 'x'],
    ['const y = Math.max(20, (ctx.canvas.height - H) / 2);', 'const y = Math.max(20, (LOGICAL_H - H) / 2);', 'y'],
    ['ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);', 'ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);', 'fill'],
  ],
  1000,
  'skill-panel.ts',
);
