/**
 * 成就面板（J）—— 与图鉴同一套排版纪律：两列固定行数、不滚动、光标行描金。
 *
 * 只画、不算账：进度来自 `data/achievements.ts` 的 `progress(facts)`，
 * 事实来自 `sessionAchievementFacts()`，本文件不允许自己再算一遍（两套口径必漂移）。
 */

import {
  achievementProgressText,
  achievementEntries,
  achievementSummary,
  type AchievementEntry,
  type AchievementState,
} from '../core/achievement';
import { ACHIEVEMENT_TOTAL, type AchievementFacts } from '../data/achievements';

export interface AchievementPanelResult {
  readonly rows: readonly AchievementEntry[];
  readonly got: number;
  readonly total: number;
  readonly cursor: number;
}

const C = {
  panel: 'rgba(11, 10, 12, 0.92)',
  edge: 'rgba(212, 161, 60, 0.45)',
  gold: '#d4a13c',
  text: '#d8d3c4',
  dim: '#6d665c',
  locked: 'rgba(120, 112, 100, 0.9)',
  lockedNum: 'rgba(140, 132, 118, 0.85)',
  goldSoft: 'rgba(212, 161, 60, 0.75)',
  frameSoft: 'rgba(140, 126, 96, 0.22)',
  track: 'rgba(255, 255, 255, 0.08)',
  bar: '#4fd1c5',
};

const W = 760;
const PAD = 18;
const TITLE_H = 26;
const ROW_H = 22;
/** 未达成行的进度条（D208）：数字回答"多少"，条回答"多近" —— 两者都要 */
const BAR_H = 3;
const FOOT_H = 22;
/** 「最接近」那一行占的高度（有才画，没达成项时留白也不难看） */
const NEAR_H = 16;
const COLS = 2;
export const ACHIEVEMENT_PANEL_SIZE = {
  w: W,
  // 每列行数由数据表算，不写死 —— 27 条 / 2 列 = 14 行，
  // 写死 10 会让 achievementPanelHeight() 少报 88px（"装得进 540"的测试就没在保护真实高度）。
  rowsPerCol: Math.max(1, Math.ceil(ACHIEVEMENT_TOTAL / COLS)),
};

export function achievementPanelHeight(): number {
  return PAD * 2 + TITLE_H + ACHIEVEMENT_PANEL_SIZE.rowsPerCol * ROW_H + FOOT_H + NEAR_H;
}

/** 数字压成 5k / 1.1万 这种（成就的 target 大，写全数字会把行挤爆） */
export function shortCount(n: number): string {
  const v = Number.isFinite(n) ? Math.floor(n) : 0;
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  if (abs >= 10000) {
    const w = abs / 10000;
    return `${sign}${w >= 10 ? Math.round(w) : w.toFixed(1).replace(/\.0$/, '')}万`;
  }
  if (abs >= 1000) {
    const k = abs / 1000;
    return `${sign}${k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')}k`;
  }
  return String(v);
}

/**
 * 最接近达成的一条（未达成里进度比最高的那条）。
 *
 * 面板列了 27 条，玩家一眼看不出"下一个会解锁的是哪条" ——
 * 而"下一步该干什么"是这类长线系统唯一需要的指引（D208）。
 * 已全部达成 / 空表 → null。
 */
export function nearestAchievement(rows: readonly AchievementEntry[]): AchievementEntry | null {
  let best: AchievementEntry | null = null;
  let bestRatio = -1;
  for (const row of rows) {
    if (row.unlocked) continue;
    const target = row.target > 0 ? row.target : 1;
    const ratio = row.progress / target;
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = row;
    }
  }
  return best;
}

export function drawAchievementPanel(
  ctx: CanvasRenderingContext2D,
  state: AchievementState,
  facts: AchievementFacts,
  canvasW: number,
  canvasH: number,
  cursor = -1,
): AchievementPanelResult {
  const rows = achievementEntries(state, facts);
  const summary = achievementSummary(state);
  const rowsPerCol = Math.max(1, Math.ceil(rows.length / COLS));
  const h = PAD * 2 + TITLE_H + rowsPerCol * ROW_H + FOOT_H + NEAR_H;
  const x = Math.round((canvasW - W) / 2);
  const y = Math.round((canvasH - h) / 2);
  const colW = Math.floor((W - PAD * 2) / COLS);

  ctx.fillStyle = C.panel;
  ctx.fillRect(x, y, W, h);
  ctx.strokeStyle = C.edge;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, W - 1, h - 1);
  // 左缘金条：面板的结构像素（探针按它判「面板真的开了」，见 D91.2）
  ctx.fillStyle = C.gold;
  ctx.fillRect(x, y, 3, h);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '13px "Noto Sans SC", system-ui, sans-serif';
  ctx.fillStyle = C.gold;
  ctx.fillText('成就', x + PAD, y + PAD + 9);
  ctx.textAlign = 'right';
  ctx.fillStyle = C.text;
  ctx.font = '12px "Noto Sans SC", system-ui, sans-serif';
  ctx.fillText(achievementProgressText(summary), x + W - PAD, y + PAD + 9);

  const top = y + PAD + TITLE_H;
  rows.forEach((row, i) => {
    const col = Math.floor(i / rowsPerCol);
    const line = i % rowsPerCol;
    const rx = x + PAD + col * colW;
    const ry = top + line * ROW_H;
    if (i === cursor) {
      ctx.fillStyle = C.frameSoft;
      ctx.fillRect(rx - 4, ry, colW - 6, ROW_H);
      ctx.strokeStyle = C.edge;
      ctx.lineWidth = 1;
      ctx.strokeRect(rx - 3.5, ry + 0.5, colW - 7, ROW_H - 1);
    }
    const done = row.unlocked;
    ctx.textAlign = 'left';
    ctx.font = '12px "Noto Sans SC", system-ui, sans-serif';
    ctx.fillStyle = done ? C.gold : C.locked;
    const mark = done ? '✓ ' : '· ';
    ctx.fillText(`${mark}${row.name}`, rx, ry + 12);
    // 右侧：达成后写奖励，未达成写「现在/目标」
    ctx.textAlign = 'right';
    ctx.fillStyle = done ? C.goldSoft : C.lockedNum;
    const tail = done ? `+${shortCount(row.reward)}` : `${shortCount(row.progress)}/${shortCount(row.target)}`;
    ctx.fillText(tail, rx + colW - 12, ry + 12);
    // 未达成：在文字下方补一条细进度条（底槽 + 填充）。
    // 不用百分比文字：27 行都写百分比会把右侧那列挤满，条是"扫一眼"的答案。
    if (!done) {
      const bw = colW - 26;
      const bx = rx;
      const by = ry + 16;
      ctx.fillStyle = C.track;
      ctx.fillRect(bx, by, bw, BAR_H);
      const ratio = row.target > 0 ? Math.max(0, Math.min(1, row.progress / row.target)) : 0;
      if (ratio > 0) {
        ctx.fillStyle = C.bar;
        ctx.fillRect(bx, by, Math.max(1, Math.round(bw * ratio)), BAR_H);
      }
    }
  });

  const near = nearestAchievement(rows);
  ctx.textAlign = 'left';
  ctx.font = '11px "Noto Sans SC", system-ui, sans-serif';
  if (near) {
    ctx.fillStyle = C.goldSoft;
    const gap = Math.max(0, near.target - near.progress);
    ctx.fillText(`最接近：${near.name}（还差 ${shortCount(gap)}）`, x + PAD, y + h - 24);
  }
  ctx.fillStyle = C.dim;
  ctx.fillText('● 达成即发渊痕（一次性，不影响战力）　·　↑↓ 翻看　·　J 关闭', x + PAD, y + h - 8);

  return { rows, got: summary.got, total: summary.total, cursor };
}
