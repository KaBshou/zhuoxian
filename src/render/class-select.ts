import type { ClassDef, ClassId } from '../data/classes';
import { CLASSES } from '../data/classes';
import { STAT_META } from '../data/stats';

/**
 * 开局选道统（D1：6 职业，开局选一个，之后不能转职）。
 *
 * 为什么必须有个开局画面：需求文档 D1 拍板做 6 职业，但 `main.ts` 一直写死 `yujian`——
 * 等于另外 5 个道统在玩家眼里不存在。这是「系统做了但玩家看不见」的典型。
 *
 * 布局纪律：卡片位置只在这里算一次（`classCardAt`），渲染和点击/键盘高亮用同一份，
 * 不许渲染器自己写一套坐标（本项目踩过 HUD 与 session 波次口径不一致的坑）。
 */

export interface ClassCardRect {
  readonly classId: ClassId;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const CARD_W_MAX = 280;
const CARD_W_MIN = 200;
const CARD_H = 132;
const CARD_GAP_X = 22;
const CARD_GAP_Y = 18;
const COLS = 3;
/** 画布左右各留的安全边距（卡片不许贴边，也不许画到屏幕外） */
const SIDE_PAD = 24;

const C = {
  mask: 'rgba(5, 7, 11, 0.86)',
  panel: 'rgba(11, 10, 12, 0.94)',
  edge: 'rgba(140, 165, 200, 0.22)',
  picked: 'rgba(212, 161, 60, 0.95)',
  text: '#d8d3c4',
  dim: '#6d665c',
  gold: '#d4a13c',
  teal: '#4fd1c5',
} as const;

/** 六张卡片的绝对位置（相对于画布左上角） */
export function classCardRects(canvasW: number, canvasH: number): ClassCardRect[] {
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
}

/** 键盘移动：左右在行内走，上下跨行；越界回绕（手柄式，不卡边） */
export function moveClassIndex(index: number, dx: number, dy: number, count = CLASSES.length): number {
  if (count <= 0) return 0;
  // NaN / 负数先归一（NaN → 0），**归一后继续走位移逻辑**：
  // 早版在 NaN 分支直接 return 0，于是「非法下标 + 右移」停在第 0 张，手感像卡住。
  const cur = Number.isFinite(index) ? Math.max(0, Math.min(count - 1, Math.trunc(index))) : 0;
  if (dx !== 0) return (cur + dx + count) % count;
  if (dy !== 0) {
    const next = cur + dy * COLS;
    // 跨行时按「同列」走，越界回绕到同列的另一端
    return ((next % count) + count) % count;
  }
  return cur;
}

/** 数字键 1..6 直接选（玩家第一次进来最想干的事） */
export function indexFromDigit(code: string, count = CLASSES.length): number | null {
  const m = /^Digit([1-9])$/.exec(code);
  if (!m) return null;
  const n = Number(m[1]) - 1;
  return n >= 0 && n < count ? n : null;
}

function primaryLabel(def: ClassDef): string {
  return STAT_META[def.primary as keyof typeof STAT_META]?.name ?? def.primary;
}

function drawCard(
  ctx: CanvasRenderingContext2D,
  rect: ClassCardRect,
  def: ClassDef,
  picked: boolean,
  timeSec: number,
): void {
  void timeSec;
  ctx.fillStyle = C.panel;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.strokeStyle = picked ? C.picked : C.edge;
  ctx.lineWidth = picked ? 2 : 1;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);

  const pad = 14;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  // 序号（数字键提示）+ 名字
  ctx.font = 'bold 12px "Noto Sans SC", system-ui, sans-serif';
  ctx.fillStyle = picked ? C.gold : C.dim;
  ctx.fillText(`[${CLASSES.indexOf(def) + 1}]`, rect.x + pad, rect.y + pad);

  ctx.font = 'bold 18px "Noto Sans SC", system-ui, sans-serif';
  ctx.fillStyle = picked ? C.gold : C.text;
  ctx.fillText(def.name, rect.x + pad + 32, rect.y + pad - 3);

  // tagline：一句话记住这个道统干什么
  ctx.font = '12px "Noto Sans SC", system-ui, sans-serif';
  ctx.fillStyle = C.teal;
  ctx.fillText(def.tagline, rect.x + pad, rect.y + pad + 26);

  // 主属性 + 起手神通标签
  ctx.fillStyle = C.dim;
  ctx.fillText(`主修 ${primaryLabel(def)}`, rect.x + pad, rect.y + pad + 48);
  ctx.fillText(`道性 ${def.skillTags.join(' · ')}`, rect.x + pad, rect.y + pad + 66);

  // 浊气觉醒名（本作唯一的「升华」）
  ctx.fillStyle = C.dim;
  ctx.fillText(`浊气觉醒 ${def.ascendancy.name}`, rect.x + pad, rect.y + pad + 84);
}

export interface ClassSelectResult {
  readonly picked: number;
  readonly cards: number;
}

export function drawClassSelect(
  ctx: CanvasRenderingContext2D,
  index: number,
  timeSec = 0,
): ClassSelectResult {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;

  ctx.fillStyle = C.mask;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = 'bold 26px "Noto Sans SC", system-ui, sans-serif';
  ctx.fillStyle = C.text;
  ctx.fillText('浊 仙', W / 2, 34);
  ctx.font = '13px "Noto Sans SC", system-ui, sans-serif';
  ctx.fillStyle = C.dim;
  ctx.fillText('择一道统，入九幽魔渊（←→↑↓ 选择，Enter 确认，数字键直选）', W / 2, 72);

  // 世界观（REQ §2「讲一下世界观」）：只放两句，放在玩家一定会停留的第一屏。
  // 为什么不塞进教程条：教程是「一句一条、不阻塞、按事实推进」，把设定写进去会拖垮节奏；
  // 而选道统这一屏玩家本来就要读六个道统的 tagline，顺手读完两句设定的成本最低。
  ctx.font = '12px "Noto Sans SC", system-ui, sans-serif';
  ctx.fillStyle = C.dim;
  ctx.fillText('三千年前，大能渡劫失败，劈开了九幽魔渊；浊气自此上涌，人间灵气尽浊。', W / 2, 97);
  ctx.fillText('你灵根已废，却唯独能把浊气炼成修为 —— 此谓「浊脉」。越强，越脏。', W / 2, 115);

  const rects = classCardRects(W, H);
  rects.forEach((rect, i) => {
    const def = CLASSES[i];
    drawCard(ctx, rect, def, i === index, timeSec);
  });

  // 底部：选中项的完整描述（卡片放不下的那句「为什么选它」）
  const def = CLASSES[Math.max(0, Math.min(CLASSES.length - 1, index))];
  ctx.textAlign = 'center';
  ctx.font = '12px "Noto Sans SC", system-ui, sans-serif';
  ctx.fillStyle = C.dim;
  const desc = def.desc.length > 66 ? def.desc.slice(0, 66) + '…' : def.desc;
  ctx.fillText(desc, W / 2, H - 46);

  return { picked: index, cards: rects.length };
}
