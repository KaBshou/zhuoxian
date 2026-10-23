// 一次性：修 class-select 两处真问题（测试抓出来的）
// ① 800x600 视口下卡片总宽 3*280+2*22=904 > 800，左侧卡片跑到 x=-42（画到屏幕外）
//    → 布局必须按视口宽度缩放/收窄，不能写死 280。改为按可用宽度算列宽（夹在 200..280）。
// ② moveClassIndex(NaN, 1, 0) 返回 0 而不是 1：NaN 先被归一成 0，再 +1 才对，但代码在 NaN 分支直接 return 0
//    → 归一化后继续走位移逻辑。
import fs from 'node:fs';

const P = 'F:/dsh-work/zhuoxian/src/render/class-select.ts';
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
  `const CARD_W = 280;
const CARD_H = 132;
const CARD_GAP_X = 22;
const CARD_GAP_Y = 18;
const COLS = 3;`,
  `const CARD_W_MAX = 280;
const CARD_W_MIN = 200;
const CARD_H = 132;
const CARD_GAP_X = 22;
const CARD_GAP_Y = 18;
const COLS = 3;
/** 画布左右各留的安全边距（卡片不许贴边，也不许画到屏幕外） */
const SIDE_PAD = 24;`,
  'sizes',
);

repl(
  `export function classCardRects(canvasW: number, canvasH: number): ClassCardRect[] {
  const rows = Math.ceil(CLASSES.length / COLS);
  const totalW = COLS * CARD_W + (COLS - 1) * CARD_GAP_X;
  const totalH = rows * CARD_H + (rows - 1) * CARD_GAP_Y;
  const left = Math.round((canvasW - totalW) / 2);
  // 顶部留出标题（36px）与底部提示（28px）
  const top = Math.round((canvasH - totalH) / 2) + 10;
  return CLASSES.map((def, i) => ({
    classId: def.id,
    x: left + (i % COLS) * (CARD_W + CARD_GAP_X),
    y: top + Math.floor(i / COLS) * (CARD_H + CARD_GAP_Y),
    w: CARD_W,
    h: CARD_H,
  }));
}`,
  `export function classCardRects(canvasW: number, canvasH: number): ClassCardRect[] {
  const rows = Math.ceil(CLASSES.length / COLS);
  // 列宽按「视口减边距」反算，再夹到 [200, 280]：
  // 写死 280 时 800 宽视口下会有卡片画到 x=-42（屏幕外），而画布是固定 960 缩放的，
  // 所以布局必须适配「逻辑画布」而不是假设它够宽。
  const availW = Math.max(0, canvasW - SIDE_PAD * 2 - (COLS - 1) * CARD_GAP_X);
  const cardW = Math.max(CARD_W_MIN, Math.min(CARD_W_MAX, Math.floor(availW / COLS)));
  const totalW = COLS * cardW + (COLS - 1) * CARD_GAP_X;
  const totalH = rows * CARD_H + (rows - 1) * CARD_GAP_Y;
  const left = Math.round((canvasW - totalW) / 2);
  // 顶部留出标题（36px）与底部提示（28px）
  const top = Math.round((canvasH - totalH) / 2) + 10;
  return CLASSES.map((def, i) => ({
    classId: def.id,
    x: left + (i % COLS) * (cardW + CARD_GAP_X),
    y: top + Math.floor(i / COLS) * (CARD_H + CARD_GAP_Y),
    w: cardW,
    h: CARD_H,
  }));
}`,
  'layout',
);

repl(
  `export function moveClassIndex(index: number, dx: number, dy: number, count = CLASSES.length): number {
  if (!Number.isFinite(index) || count <= 0) return 0;
  const cur = Math.max(0, Math.min(count - 1, Math.trunc(index)));
  if (dx !== 0) return (cur + dx + count) % count;`,
  `export function moveClassIndex(index: number, dx: number, dy: number, count = CLASSES.length): number {
  if (count <= 0) return 0;
  // NaN / 负数先归一（NaN → 0），**归一后继续走位移逻辑**：
  // 早版在 NaN 分支直接 return 0，于是「非法下标 + 右移」停在第 0 张，手感像卡住。
  const cur = Number.isFinite(index) ? Math.max(0, Math.min(count - 1, Math.trunc(index))) : 0;
  if (dx !== 0) return (cur + dx + count) % count;`,
  'move-nan',
);

if (c.length < before * 0.95) throw new Error('结果比原文短，拒绝写盘');
fs.writeFileSync(P, c, 'utf8');
console.log('written', before, '->', c.length);
