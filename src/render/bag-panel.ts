/**
 * 背包面板（按 B 开）—— 40 格网格 + 选中一件看词条与「换上会怎样」。
 *
 * 为什么必须有：自动换装（`inventory.pickup`）会替玩家做决定，但玩家看不见它换了什么、
 * 也不知道背包里还有什么。现在的 HUD 背包块只列前 4 行文字，等于「背包里躺着的 36 件
 * 不存在」—— 对一个「刷装备凑词条」的游戏来说，这层信息是核心奖励本身。
 *
 * 纪律：
 * 1) 只读 session。这里的数字全部来自 `item.base` / `item.affixes` 原始实例与 `power-rank`
 *    的纯函数，**不许在这里做求和**（求和会让「灭灵石随机删一条」这类操作变得不可解释）。
 * 2) 布局唯一出处是 `bagPanelGeometry` / `bagGridLayout`，绘制与命中测试都调它
 *    （写死坐标的布局改一次就串一次，D177 踩过）。
 */
import type { GameSession } from '../core/session';
import type { Item } from '../core/item';
import { itemPower, equipmentSummary } from '../core/inventory';
import { powerRatioText, rarityRankText, powerDeltaText } from '../core/power-rank';
import { SLOT_NAME } from '../data/slots';
import { RARITY_NAME, type Rarity } from '../data/rarity';
import { STAT_META, formatModifier } from '../data/stats';
import { legendaryOf } from '../core/item';

export const BAG_COLS = 8;
export const BAG_ROWS = 5;
export const BAG_CELLS = BAG_COLS * BAG_ROWS; // 40 = BAG_CAPACITY
export const BAG_CELL_W = 64;
export const BAG_CELL_H = 38;
export const BAG_GAP = 6;
export const BAG_PAD = 16;
export const BAG_HEAD = 44;
export const BAG_FOOT = 28;
export const BAG_DETAIL_W = 224;
export const BAG_DETAIL_GAP = 14;

const gridW = BAG_COLS * BAG_CELL_W + (BAG_COLS - 1) * BAG_GAP;
const gridH = BAG_ROWS * BAG_CELL_H + (BAG_ROWS - 1) * BAG_GAP;

export const BAG_PANEL_W = BAG_PAD + gridW + BAG_DETAIL_GAP + BAG_DETAIL_W + BAG_PAD;
export const BAG_PANEL_H = BAG_HEAD + gridH + BAG_FOOT;

const C = {
  overlay: 'rgba(5, 7, 11, 0.72)',
  panel: 'rgba(11, 10, 12, 0.92)',
  edge: 'rgba(140, 165, 200, 0.22)',
  frame: 'rgba(232, 200, 122, 0.85)',
  cellFill: 'rgba(20, 20, 26, 0.9)',
  cellEmpty: 'rgba(14, 14, 18, 0.75)',
  cellEdge: 'rgba(70, 64, 56, 0.55)',
  text: '#d8d3c4',
  dim: '#6d665c',
  gold: '#d4a13c',
};

const RARITY_COLOR: Record<Rarity, string> = {
  fan: '#c8d4e4',
  ling: '#508ff0',
  bao: '#f0d264',
  xian: '#f59637',
};

export interface BagCell {
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface BagPanelGeometry {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly gridX: number;
  readonly gridY: number;
  readonly detailX: number;
  readonly detailY: number;
}

export type BagCellState = 'filled' | 'empty';

/** 网格 40 格（行优先）。空位也算格子 —— 网格要稳，不能「有东西才占位」。 */
export function bagGridLayout(originX: number, originY: number): readonly BagCell[] {
  const out: BagCell[] = [];
  for (let i = 0; i < BAG_CELLS; i += 1) {
    const col = i % BAG_COLS;
    const row = Math.floor(i / BAG_COLS);
    out.push({
      index: i,
      x: Math.round(originX + col * (BAG_CELL_W + BAG_GAP)),
      y: Math.round(originY + row * (BAG_CELL_H + BAG_GAP)),
      w: BAG_CELL_W,
      h: BAG_CELL_H,
    });
  }
  return out;
}

/** 面板在画布正中；网格在左，详情在右。布局的唯一出处。 */
export function bagPanelGeometry(canvasW: number, canvasH: number): BagPanelGeometry {
  const w = BAG_PANEL_W;
  const h = BAG_PANEL_H;
  const x = Math.round((canvasW - w) / 2);
  const y = Math.round((canvasH - h) / 2);
  const gridX = x + BAG_PAD;
  const gridY = y + BAG_HEAD;
  return {
    x,
    y,
    w,
    h,
    gridX,
    gridY,
    detailX: gridX + gridW + BAG_DETAIL_GAP,
    detailY: gridY,
  };
}

export function bagCellState(index: number, bag: readonly Item[]): BagCellState {
  const item = bag[index];
  return item ? 'filled' : 'empty';
}

/** 命中网格（闭区间 —— 触屏点击有亚像素抖动，差 1px 判空会显得时灵时不灵）。 */
export function hitTestBagGrid(
  px: number,
  py: number,
  geo: BagPanelGeometry,
): number | null {
  const cells = bagGridLayout(geo.gridX, geo.gridY);
  for (const c of cells) {
    if (px >= c.x && px < c.x + c.w && py >= c.y && py < c.y + c.h) return c.index;
  }
  return null;
}

/** 非有限数一律夹到 0，避免 NaN 光标把整块高亮画丢。 */
export function clampBagIndex(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  const i = Math.floor(value);
  if (i < 0) return 0;
  if (i >= BAG_CELLS) return BAG_CELLS - 1;
  return i;
}

export function bagCellText(item: Item | null | undefined): {
  readonly name: string;
  readonly sub: string;
  readonly color: string;
  readonly empty: boolean;
} {
  if (!item) return { name: '', sub: '', color: C.cellEdge, empty: true };
  const sub = `${RARITY_NAME[item.rarity]} · ${item.affixes.length}纹`;
  return { name: item.name, sub, color: RARITY_COLOR[item.rarity], empty: false };
}

/** 选中件的「换上会怎样」—— 与判据 C 同口径（比值）加一个换装决策用的百分比。 */
export function bagCompareLines(item: Item, equipped: Item | null | undefined): readonly string[] {
  return [
    `战力比 ${powerRatioText(item)}　${rarityRankText(item)}`,
    `换装对比 ${powerDeltaText(item, equipped)}`,
  ];
}

function detailLines(item: Item, equipped: Item | null | undefined): readonly string[] {
  const lines: string[] = [];
  for (const b of item.base) {
    const meta = STAT_META[b.stat];
    lines.push(`${meta ? meta.name : b.stat} ${formatModifier(b.stat, b.op, b.value)}`);
  }
  for (const a of item.affixes) {
    const meta = STAT_META[a.stat];
    lines.push(`${a.name} · ${meta ? meta.name : a.stat} ${formatModifier(a.stat, a.op, a.value)}`);
  }
  if (lines.length === 0) lines.push('（无词条）');
  const legend = legendaryOf(item);
  if (legend) lines.push(`传奇 · ${legend.name}：${legend.desc}`);
  return lines;
}

export function drawBagPanel(
  ctx: CanvasRenderingContext2D,
  s: GameSession,
  canvasW: number,
  canvasH: number,
  focused: number | null = null,
): BagPanelGeometry {
  const geo = bagPanelGeometry(canvasW, canvasH);
  const bag = s.bag;

  ctx.fillStyle = C.overlay;
  ctx.fillRect(0, 0, canvasW, canvasH);
  ctx.fillStyle = C.panel;
  ctx.fillRect(geo.x, geo.y, geo.w, geo.h);
  ctx.strokeStyle = C.edge;
  ctx.lineWidth = 1;
  ctx.strokeRect(geo.x + 0.5, geo.y + 0.5, geo.w - 1, geo.h - 1);
  // 左缘 3px 金条 = 面板结构像素（探针靠它判「面板真的画出来了」，不靠整体亮度）
  ctx.fillStyle = C.gold;
  ctx.fillRect(geo.x, geo.y, 3, geo.h);

  ctx.textAlign = 'left';
  ctx.font = 'bold 14px "Noto Sans SC", sans-serif';
  ctx.fillStyle = C.gold;
  ctx.fillText('背包', geo.x + 14, geo.y + 26);
  ctx.font = '12px "Noto Sans SC", sans-serif';
  ctx.fillStyle = C.text;
  const cap = BAG_CELLS;
  ctx.fillText(`${bag.length} / ${cap}`, geo.x + 62, geo.y + 26);

  const cells = bagGridLayout(geo.gridX, geo.gridY);
  const focus = focused === null ? null : clampBagIndex(focused);
  for (const cell of cells) {
    const item = bag[cell.index] ?? null;
    const info = bagCellText(item);
    ctx.fillStyle = info.empty ? C.cellEmpty : C.cellFill;
    ctx.fillRect(cell.x, cell.y, cell.w, cell.h);
    ctx.strokeStyle = info.empty ? C.cellEdge : info.color;
    ctx.globalAlpha = info.empty ? 0.5 : 0.6;
    ctx.lineWidth = 1;
    ctx.strokeRect(cell.x + 0.5, cell.y + 0.5, cell.w - 1, cell.h - 1);
    ctx.globalAlpha = 1;
    if (focus !== null && cell.index === focus) {
      ctx.strokeStyle = C.frame;
      ctx.lineWidth = 2;
      ctx.strokeRect(cell.x + 1, cell.y + 1, cell.w - 2, cell.h - 2);
      ctx.lineWidth = 1;
    }
    if (info.empty) continue;
    ctx.font = '11px "Noto Sans SC", sans-serif';
    ctx.fillStyle = info.color;
    const nm = info.name.length > 5 ? `${info.name.slice(0, 5)}…` : info.name;
    ctx.fillText(nm, cell.x + 6, cell.y + 16);
    ctx.fillStyle = C.dim;
    ctx.font = '10px "Noto Sans SC", sans-serif';
    ctx.fillText(info.sub, cell.x + 6, cell.y + 30);
  }

  // 右侧详情
  const focusedItem = focus !== null ? bag[focus] : undefined;
  ctx.textAlign = 'left';
  if (focusedItem) {
    ctx.font = 'bold 13px "Noto Sans SC", sans-serif';
    ctx.fillStyle = RARITY_COLOR[focusedItem.rarity];
    ctx.fillText(`${focusedItem.name} · ${RARITY_NAME[focusedItem.rarity]}`, geo.detailX, geo.detailY + 14);
    ctx.font = '11px "Noto Sans SC", sans-serif';
    ctx.fillStyle = C.dim;
    ctx.fillText(
      `${SLOT_NAME[focusedItem.slot] ?? focusedItem.slot} · 灵蕴 ${focusedItem.ilvl} · 战力 ${Math.round(itemPower(focusedItem))}`,
      geo.detailX,
      geo.detailY + 32,
    );

    const sameSlot = equipmentSummary(s.character).find((e) => e.item.slot === focusedItem.slot);
    let y = geo.detailY + 52;
    for (const line of detailLines(focusedItem, sameSlot ? sameSlot.item : null)) {
      ctx.fillStyle = C.text;
      ctx.fillText(line, geo.detailX, y);
      y += 16;
    }
    y += 6;
    for (const line of bagCompareLines(focusedItem, sameSlot ? sameSlot.item : null)) {
      ctx.fillStyle = y > geo.detailY + 140 ? C.dim : C.gold;
      ctx.fillText(line, geo.detailX, y);
      y += 16;
    }
  } else {
    ctx.font = '12px "Noto Sans SC", sans-serif';
    ctx.fillStyle = C.dim;
    ctx.fillText('点一格看法宝', geo.detailX, geo.detailY + 16);
    ctx.fillText('（自动换装会把更好的直接穿上）', geo.detailX, geo.detailY + 34);
  }

  ctx.font = '11px "Noto Sans SC", sans-serif';
  ctx.fillStyle = C.dim;
  ctx.fillText('点格子看详情　·　空格 穿上　·　X 丢弃　·　B / Esc 关闭', geo.x + 14, geo.y + geo.h - 9);
  return geo;
}
