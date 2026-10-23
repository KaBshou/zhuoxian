/**
 * 秘境图（层选择面板，D185）。
 *
 * 为什么要有这件事：
 *   D36-B 早就做了「回刷」（`setFloor` + `floorSelectableMax`），但玩家的入口只有
 *   `←` `→` 两个键 —— 按一次挪一层，从第 76 层回第 3 层要按 73 次。
 *   结果就是「能回刷」等于「实际没人回刷」，而 BALANCE 里「层 21 是最优农点」这类
 *   结论全靠回刷。**有能力的系统没有入口，等于没做**（和装备看不见、音效没入口同族）。
 *
 * 面板只负责「画 + 命中」，不改任何状态；跳层走 `session.setFloor()`（它自己会拒绝越界）。
 */
import { MAX_FLOOR, MAIN_FLOOR_END, BOSS_EVERY_FLOORS, hasBossFloor } from '../data/monsters';
import { floorSelectableMax } from '../core/session';
import type { GameSession } from '../core/session';

export const FLOOR_MAP_COLS = 10;
export const FLOOR_CELL_W = 46;
export const FLOOR_CELL_H = 32;
export const FLOOR_CELL_GAP = 6;
export const FLOOR_MAP_PAD = 16;
export const FLOOR_MAP_HEAD = 46;
export const FLOOR_MAP_FOOT = 30;

export interface FloorCell {
  readonly floor: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export type FloorCellState = 'cleared' | 'current' | 'reachable' | 'locked';

export const FLOOR_STATE_NAME: Readonly<Record<FloorCellState, string>> = {
  cleared: '已通关',
  current: '当前',
  reachable: '可前往',
  locked: '未抵达',
};

export function floorMapWidth(): number {
  return FLOOR_MAP_COLS * FLOOR_CELL_W + (FLOOR_MAP_COLS - 1) * FLOOR_CELL_GAP + FLOOR_MAP_PAD * 2;
}

export function floorMapHeight(): number {
  const rows = Math.ceil((MAX_FLOOR + 1) / FLOOR_MAP_COLS);
  return FLOOR_MAP_HEAD + rows * FLOOR_CELL_H + (rows - 1) * FLOOR_CELL_GAP + FLOOR_MAP_FOOT;
}

/**
 * 76 格（层 1~76）的矩形，纯函数。
 *
 * 层号从 1 起，格子从 0 排 —— 这里用 `i = floor - 1` 换算一次就够，
 * 不要在调用处再各算一遍（写死坐标是上一次 HUD 重叠事故的根源）。
 */
export function floorMapLayout(originX: number, originY: number): readonly FloorCell[] {
  const cells: FloorCell[] = [];
  for (let floor = 1; floor <= MAX_FLOOR; floor += 1) {
    const i = floor - 1;
    const col = i % FLOOR_MAP_COLS;
    const row = Math.floor(i / FLOOR_MAP_COLS);
    cells.push({
      floor,
      x: originX + FLOOR_MAP_PAD + col * (FLOOR_CELL_W + FLOOR_CELL_GAP),
      y: originY + FLOOR_MAP_HEAD + row * (FLOOR_CELL_H + FLOOR_CELL_GAP),
      w: FLOOR_CELL_W,
      h: FLOOR_CELL_H,
    });
  }
  return cells;
}

export function floorCellState(floor: number, s: GameSession): FloorCellState {
  if (floor === s.floor) return 'current';
  if ((s.firstClearedFloors ?? []).includes(floor)) return 'cleared';
  const max = floorSelectableMax(s);
  if (floor >= 1 && floor <= max) return 'reachable';
  return 'locked';
}

/** 命中：闭区间（手指/鼠标差 1px 也要点得中，和 HUD 按钮同口径） */
export function hitTestFloorMap(px: number, py: number, originX: number, originY: number): number | null {
  for (const c of floorMapLayout(originX, originY)) {
    if (px >= c.x && px <= c.x + c.w && py >= c.y && py <= c.y + c.h) return c.floor;
  }
  return null;
}

/** 顶部队阶说明：主线 1~27，无尽 28~76 每 5 层一个镇守 */
export const FLOOR_MAP_LEGEND = [
  `主线 1~${MAIN_FLOOR_END}（层 ${BOSS_EVERY_FLOORS} 的倍数有镇守）`,
  `无尽 ${MAIN_FLOOR_END + 1}~${MAX_FLOOR}（每 ${BOSS_EVERY_FLOORS} 层一个镇守）`,
] as const;

export function floorTagText(floor: number): string {
  if (hasBossFloor(floor)) return '镇守';
  return '';
}

const C = {
  veil: 'rgba(5,7,11,0.72)',
  panel: 'rgba(11,10,12,0.92)',
  edge: 'rgba(140,165,200,0.22)',
  gold: '#d4a13c',
  goldSoft: 'rgba(212,161,60,0.35)',
  text: '#d8d3c4',
  dim: '#6d665c',
  teal: '#4fd1c5',
  tealSoft: 'rgba(79,209,197,0.18)',
  red: '#8c3a2e',
  cellReachable: 'rgba(32,34,44,0.9)',
  cellLocked: 'rgba(14,14,18,0.75)',
} as const;

export interface FloorMapPaint {
  readonly focusedFloor: number | null;
}

/**
 * 画秘境图。返回面板矩形（探针靠它定位，不抄坐标）。
 *
 * 设计取舍：76 格里**已通关**与**可前往**必须一眼分得开 —— 玩家来这里的目的只有一个：
 * 找「我要回哪一层刷」。所以当前层金框、已通关青色、可前往灰白、未抵达近黑。
 */
export function drawFloorMap(
  ctx: CanvasRenderingContext2D,
  s: GameSession,
  canvasW: number,
  canvasH: number,
  focusedFloor: number | null = null,
): { x: number; y: number; w: number; h: number } {
  const w = floorMapWidth();
  const h = floorMapHeight();
  const x = Math.round((canvasW - w) / 2);
  const y = Math.round((canvasH - h) / 2);

  ctx.fillStyle = C.veil;
  ctx.fillRect(0, 0, canvasW, canvasH);
  ctx.fillStyle = C.panel;
  ctx.fillRect(x, y, w, h);
  // 左缘 3px 金条：面板的「结构像素」，探针靠它判断面板真的画出来了（比数金色文字可靠）
  ctx.fillStyle = C.gold;
  ctx.fillRect(x, y + 8, 3, h - 16);
  ctx.strokeStyle = C.edge;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.gold;
  ctx.font = 'bold 15px "Noto Sans SC", system-ui, sans-serif';
  ctx.fillText('秘境图', x + FLOOR_MAP_PAD, y + 24);

  ctx.fillStyle = C.dim;
  ctx.font = '11px "Noto Sans SC", system-ui, sans-serif';
  ctx.fillText(FLOOR_MAP_LEGEND[0], x + FLOOR_MAP_PAD, y + 40);
  ctx.textAlign = 'right';
  ctx.fillText(
    `第 ${s.floor} 层 · 最深 ${floorSelectableMax(s)} 层 · 共 ${MAX_FLOOR} 层`,
    x + w - FLOOR_MAP_PAD,
    y + 24,
  );
  ctx.textAlign = 'left';

  const max = floorSelectableMax(s);
  for (const c of floorMapLayout(x, y)) {
    const state = floorCellState(c.floor, s);
    const focused = focusedFloor === c.floor;
    const boss = hasBossFloor(c.floor);

    ctx.fillStyle =
      state === 'locked' ? C.cellLocked : state === 'cleared' ? C.tealSoft : C.cellReachable;
    ctx.fillRect(c.x, c.y, c.w, c.h);

    if (state === 'current') {
      ctx.strokeStyle = C.gold;
      ctx.lineWidth = 2;
    } else if (focused) {
      ctx.strokeStyle = C.goldSoft;
      ctx.lineWidth = 2;
    } else {
      ctx.strokeStyle = C.edge;
      ctx.lineWidth = 1;
    }
    ctx.strokeRect(c.x + 0.5, c.y + 0.5, c.w - 1, c.h - 1);

    ctx.fillStyle =
      state === 'locked' ? C.dim : state === 'current' ? C.gold : state === 'cleared' ? C.teal : C.text;
    ctx.font = `${state === 'current' ? 'bold ' : ''}12px "Noto Sans SC", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(String(c.floor), c.x + c.w / 2, c.y + c.h / 2 + 4);

    // 镇守层在格子右下角点一个小红点；未抵达的不点（别剧透没走到的内容）
    if (boss && state !== 'locked') {
      ctx.fillStyle = C.red;
      ctx.fillRect(c.x + c.w - 7, c.y + c.h - 6, 3, 3);
    }
  }
  ctx.textAlign = 'left';

  ctx.fillStyle = C.dim;
  ctx.font = '10px "Noto Sans SC", system-ui, sans-serif';
  ctx.fillText(
    `金框 = 当前 · 青 = 已通关 · 灰 = 可前往 · 红点 = 镇守 · 可前往共 ${max} 层`,
    x + FLOOR_MAP_PAD,
    y + h - 10,
  );
  ctx.fillStyle = C.gold;
  ctx.textAlign = 'right';
  ctx.fillText('点击任意格前往 · P / Esc 关闭', x + w - FLOOR_MAP_PAD, y + h - 10);
  ctx.textAlign = 'left';

  return { x, y, w, h };
}
