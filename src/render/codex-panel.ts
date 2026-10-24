// 图鉴面板（按 K 打开）—— 这次轮到「我收集到哪了」被看见。
//
// 存在理由（D87）：游戏里有 15 种浊物、9 条传奇，玩家杀了上千只、掉过几十件，
// 但**没有任何地方能看见收集进度**。没有记录，收集这件事在玩家心里就不存在。
//
// 纪律：
// - 面板只画 `core/codex.ts` 给出的行，不自己判断"算不算收集到"（单一真相）。
// - 顺序只由数据表决定（codexEntries 固定顺序），不按解锁先后 —— 否则同一个存档
//   在不同机器上行号不同，说"图鉴第 3 行"就指不清。
// - 未收录的条目**照名显示、数值不剧透**（detail 是「尚未遭遇 / 尚未获得」）：
//   藏名字等于让玩家不知道还有什么，那就没有"想集齐"的动机。
import { codexEntries, codexProgress, type CodexEntry, type CodexState } from '../core/codex';

const C = {
  panel: 'rgba(11, 10, 12, 0.92)',
  edge: 'rgba(140, 165, 200, 0.22)',
  text: '#d8d3c4',
  dim: '#6d665c',
  gold: '#d4a13c',
  teal: '#4fd1c5',
  frame: 'rgba(240, 214, 140, 0.9)',
  frameSoft: 'rgba(240, 214, 140, 0.32)',
  locked: 'rgba(120, 112, 100, 0.85)',
};

const W = 760;
const PAD = 18;
const ROW_H = 17;
const COL_GAP = 26;
const COL_W = Math.floor((W - PAD * 2 - COL_GAP) / 2);
/** detail 的起始偏移与可用宽度（D202：detail 变长了，必须能折/截） */
const DETAIL_X = 96;
const DETAIL_FONT = 11;
const DETAIL_MAX_W = COL_W - DETAIL_X - 6;

/** 全角按 1、半角按 0.55 个字宽估算（宁可高估，高估只是多截一个字符） */
function estimateWidth(text: string, fontPx: number): number {
  let units = 0;
  for (const ch of text) units += ch.charCodeAt(0) > 0x2e80 ? 1 : 0.55;
  return units * fontPx;
}

/**
 * 把 detail 截到可用宽度内（D202）。
 *
 * 图鉴的 detail 从「尚未遭遇」变成了「尚未遭遇（3 阶 · 第 19–76 层）」—— 它比原来长了一倍。
 * 面板是固定宽度的两列，溢出就会画进右边那一列，看起来像「这只怪叫『第 19–7…』」。
 * 与其缩小字号（11px 已经很小），不如截断并保留省略号：玩家至少知道「后面还有话」。
 */
export function fitDetailText(text: string, maxPx: number = DETAIL_MAX_W): string {
  if (estimateWidth(text, DETAIL_FONT) <= maxPx) return text;
  const chars = [...text];
  while (chars.length > 1 && estimateWidth(chars.join('') + '…', DETAIL_FONT) > maxPx) chars.pop();
  return chars.join('') + '…';
}
/** 一列放几行：浊物 15 条、传奇 9 条，两列都放得下（取 15 的上限） */
const ROWS_PER_COL = 15;

const ELEMENT_COLOR: Record<string, string> = {
  metal: '#c9a24a',
  wood: '#4a7f50',
  water: '#3a72b8',
  fire: '#c25a48',
  earth: '#8a6520',
};

export interface CodexPanelResult {
  /** 一共画了多少行（探针/测试据此判断"面板真的画了东西"） */
  readonly rows: number;
  /** 已收录条数 */
  readonly got: number;
  readonly total: number;
  /** 光标停在第几行（-1 = 面板没开） */
  readonly cursor: number;
}

function entryColor(e: CodexEntry): string {
  if (!e.unlocked) return C.locked;
  return e.kind === 'legendary' ? C.gold : C.text;
}

/**
 * 画图鉴。`cursor` 是 `codexEntries` 的绝对行号（0..23），负值表示不画光标。
 *
 * 面板尺寸固定、内容固定（24 行），所以没有滚动：24 行 × 17px = 408px，
 * 加上标题和底部提示仍低于 540 的战场高度。等条目翻倍再考虑分页。
 */
export function drawCodexPanel(
  ctx: CanvasRenderingContext2D,
  codex: CodexState,
  canvasW: number,
  canvasH: number,
  cursor = -1,
): CodexPanelResult {
  const entries = codexEntries(codex);
  const monsters = entries.filter((e) => e.kind === 'monster');
  const legendaries = entries.filter((e) => e.kind === 'legendary');
  const rows = Math.max(monsters.length, legendaries.length);
  const h = PAD * 2 + 34 + rows * ROW_H + 26;
  const x = Math.round((canvasW - W) / 2);
  const y = Math.round((canvasH - h) / 2);

  ctx.save();
  ctx.fillStyle = C.panel;
  ctx.fillRect(x, y, W, h);
  ctx.strokeStyle = C.edge;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, W - 1, h - 1);

  const prog = codexProgress(codex);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = 'bold 17px "Microsoft YaHei", "PingFang SC", sans-serif';
  ctx.fillStyle = C.gold;
  ctx.fillText('图鉴', x + PAD, y + PAD);
  ctx.font = '12px "Microsoft YaHei", "PingFang SC", sans-serif';
  ctx.fillStyle = C.dim;
  ctx.fillText(
    `浊物 ${prog.monsters.got}/${prog.monsters.total}　传奇 ${prog.legendaries.got}/${prog.legendaries.total}　总进度 ${prog.percent}%`,
    x + PAD + 52,
    y + PAD + 4,
  );

  const top = y + PAD + 30;
  const drawCol = (title: string, list: readonly CodexEntry[], colX: number, baseIndex: number): void => {
    ctx.font = 'bold 12px "Microsoft YaHei", "PingFang SC", sans-serif';
    ctx.fillStyle = C.teal;
    ctx.fillText(title, colX, top - 2);
    ctx.font = '12px "Microsoft YaHei", "PingFang SC", sans-serif';
    list.forEach((e, i) => {
      const rowY = top + 16 + i * ROW_H;
      const index = baseIndex + i;
      if (index === cursor) {
        ctx.fillStyle = C.frameSoft;
        ctx.fillRect(colX - 4, rowY - 2, COL_W, ROW_H - 1);
        ctx.strokeStyle = C.frame;
        ctx.lineWidth = 1;
        ctx.strokeRect(colX - 3.5, rowY - 1.5, COL_W - 1, ROW_H - 2);
      }
      const nameColor = entryColor(e);
      ctx.fillStyle = nameColor;
      ctx.fillText(`${e.unlocked ? '·' : '？'} ${e.name}`, colX, rowY);
      // 数值/描述只在收录后显示：未收录时写「尚未遭遇」，不剧透气血攻伐
      ctx.fillStyle = e.unlocked ? C.dim : 'rgba(109, 102, 92, 0.55)';
      ctx.font = '11px "Microsoft YaHei", "PingFang SC", sans-serif';
      ctx.fillText(fitDetailText(e.detail), colX + DETAIL_X, rowY + 1);
      ctx.font = '12px "Microsoft YaHei", "PingFang SC", sans-serif';
    });
  };

  drawCol('浊物', monsters, x + PAD, 0);
  drawCol('传奇', legendaries, x + PAD + COL_W + COL_GAP, monsters.length);

  ctx.font = '11px "Microsoft YaHei", "PingFang SC", sans-serif';
  ctx.fillStyle = C.gold;
  ctx.fillText('↑↓ 翻看　·　K 关闭', x + PAD, y + h - PAD - 10);
  ctx.restore();

  return { rows: entries.length, got: prog.total.got, total: prog.total.total, cursor };
}

/** 面板高度（测试用：判断会不会画出画布外） */
export function codexPanelHeight(codex: CodexState): number {
  const rows = Math.max(
    codexEntries(codex).filter((e) => e.kind === 'monster').length,
    codexEntries(codex).filter((e) => e.kind === 'legendary').length,
  );
  return PAD * 2 + 34 + rows * ROW_H + 26;
}

export const CODEX_PANEL_SIZE = { w: W, rowsPerCol: ROWS_PER_COL, rowH: ROW_H } as const;

/** 元素色（详情面板/图鉴将来复用；没有对应色返回 undefined） */
export function codexElementColor(element: string): string | undefined {
  return ELEMENT_COLOR[element];
}
