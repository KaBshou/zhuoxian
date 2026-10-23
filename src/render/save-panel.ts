/**
 * 存档面板（按 S 开）—— 导出 / 导入存档。
 *
 * 为什么要有它：存档在 `localStorage`，而 `localStorage` 按域名隔离。换网址、换设备、清缓存、
 * 用无痕窗口、浏览器自动回收存储 —— 任何一种都会让玩家「打开一看是新的」，而且不报错。
 * 对 24 小时内容量的挂机游戏，这是最伤的一种失败：他不是被打死，而是被清档。
 *
 * 纪律：
 * - 面板只显示状态，**导出/导入的真实动作在 `main.ts`**（要碰 DOM 文件 API）；
 * - 按钮矩形由 `savePanelButtons()` 一处算，绘制与点击都用它 —— 两边各算一遍必然错位；
 * - 导入是**破坏性操作**（覆盖当前进度），必须两步：先选文件 → 显示摘要 → 再点确认。
 *   一步就覆盖的界面，玩家手滑一次就没了。
 */

const W = 560;
const PAD = 18;
const TITLE_H = 30;
const BODY_H = 74;
const BTN_H = 36;
const BTN_GAP = 12;
const STATUS_H = 46;
const FOOT_H = 22;

const C = {
  bg: 'rgba(11, 10, 12, 0.94)',
  edge: 'rgba(212, 161, 60, 0.45)',
  gold: '#d4a13c',
  text: '#d8d3c4',
  dim: '#6d665c',
  warn: '#e0a24a',
  ok: '#7ddca8',
  btnBg: 'rgba(32, 28, 24, 0.95)',
  btnBgHot: 'rgba(64, 50, 26, 0.95)',
  btnEdge: 'rgba(212, 161, 60, 0.55)',
};

export type SavePanelPhase = 'idle' | 'confirm';
export type SavePanelAction = 'export' | 'import' | 'confirm' | 'cancel';

export interface SavePanelButton {
  readonly id: SavePanelAction;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export const SAVE_PANEL_W = W;

export function savePanelHeight(phase: SavePanelPhase = 'idle'): number {
  // 确认态多一行摘要 ⇒ 状态区多 20px
  const status = phase === 'confirm' ? STATUS_H + 20 : STATUS_H;
  return PAD + TITLE_H + BODY_H + BTN_H + BTN_GAP + status + FOOT_H;
}

/** 按钮布局唯一出处：绘制与命中测试都调它。 */
export function savePanelButtons(canvasW: number, canvasH: number, phase: SavePanelPhase = 'idle'): readonly SavePanelButton[] {
  const h = savePanelHeight(phase);
  const top = Math.round((canvasH - h) / 2);
  const btnY = top + PAD + TITLE_H + BODY_H;
  const inner = W - PAD * 2;
  const btnW = Math.floor((inner - BTN_GAP) / 2);
  const left = Math.round((canvasW - W) / 2) + PAD;
  const right = left + btnW + BTN_GAP;

  if (phase === 'confirm') {
    return [
      { id: 'confirm', label: '确认导入（覆盖当前进度）', x: left, y: btnY, w: btnW, h: BTN_H },
      { id: 'cancel', label: '取消', x: right, y: btnY, w: btnW, h: BTN_H },
    ];
  }
  return [
    { id: 'export', label: '导出存档（下载文件）', x: left, y: btnY, w: btnW, h: BTN_H },
    { id: 'import', label: '导入存档（选文件）', x: right, y: btnY, w: btnW, h: BTN_H },
  ];
}

export function hitTestSavePanel(
  px: number,
  py: number,
  canvasW: number,
  canvasH: number,
  phase: SavePanelPhase = 'idle',
): SavePanelAction | null {
  for (const b of savePanelButtons(canvasW, canvasH, phase)) {
    // 闭区间：手机上点击有亚像素抖动，差 1px 判空会让按钮"时灵时不灵"
    if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return b.id;
  }
  return null;
}

export interface SavePanelPaint {
  readonly lines: readonly string[];
  readonly status: string;
  readonly statusTone?: 'ok' | 'warn' | 'dim';
}

export function drawSavePanel(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  phase: SavePanelPhase,
  paint: SavePanelPaint,
  hovered: SavePanelAction | null = null,
): { x: number; y: number; w: number; h: number } {
  const h = savePanelHeight(phase);
  const x = Math.round((canvasW - W) / 2);
  const y = Math.round((canvasH - h) / 2);

  // 全屏遮罩：让底下的战斗画面退后，注意力留在面板上
  ctx.fillStyle = 'rgba(5, 7, 11, 0.72)';
  ctx.fillRect(0, 0, canvasW, canvasH);

  ctx.fillStyle = C.bg;
  ctx.fillRect(x, y, W, h);
  ctx.strokeStyle = C.edge;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, W - 1, h - 1);

  // 标题 + 左侧 3px 金条（探针靠这条"结构像素"判断面板真的画出来了）
  ctx.fillStyle = C.gold;
  ctx.fillRect(x, y, 3, h);
  ctx.font = 'bold 15px "Noto Sans SC", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.gold;
  ctx.fillText('存档', x + PAD, y + PAD + 16);

  // 正文说明
  ctx.font = '12px "Noto Sans SC", system-ui, sans-serif';
  let by = y + PAD + TITLE_H + 14;
  for (const line of paint.lines) {
    ctx.fillStyle = C.text;
    ctx.fillText(line, x + PAD, by);
    by += 20;
  }

  // 按钮
  for (const b of savePanelButtons(canvasW, canvasH, phase)) {
    ctx.fillStyle = hovered === b.id ? C.btnBgHot : C.btnBg;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = C.btnEdge;
    ctx.lineWidth = 1;
    ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    ctx.fillStyle = b.id === 'confirm' ? C.warn : C.gold;
    ctx.font = '12px "Noto Sans SC", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 4);
  }
  ctx.textAlign = 'left';

  // 状态区
  const statusTop = y + PAD + TITLE_H + BODY_H + BTN_H + BTN_GAP + 16;
  ctx.font = '12px "Noto Sans SC", system-ui, sans-serif';
  const tone = paint.statusTone ?? 'dim';
  ctx.fillStyle = tone === 'ok' ? C.ok : tone === 'warn' ? C.warn : C.dim;
  if (paint.status) ctx.fillText(paint.status, x + PAD, statusTop);

  // 底部提示
  ctx.font = '11px "Noto Sans SC", system-ui, sans-serif';
  ctx.fillStyle = C.dim;
  ctx.fillText('S / Esc 关闭　·　导出后把文件收好，换设备靠它', x + PAD, y + h - 8);

  return { x, y, w: W, h };
}
