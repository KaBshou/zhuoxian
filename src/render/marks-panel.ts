/**
 * 渊痕面板（按 M 开）—— 满级后唯一积累物的「价目表」。
 *
 * 为什么必须有这个面板：
 *   HUD 那行只写「渊痕 1 250 000 · 可换」，键位 1/2/3 也确实能买，但**玩家看不见能换什么、多少钱、还差多少**。
 *   这个项目已经踩过同一条：装备灵纹、周天图天赋、玉简装配、图鉴 —— 每一个都是「系统做了但看不见」，
 *   而看不见的系统等于不存在。渊痕尤其危险：它是满级后唯一还在涨的数字，如果玩家不知道它能干什么，
 *   满级那一刻游戏就结束了。
 *
 * 纪律：
 * - 只读，不花钱（花钱仍然只走 `core/marks-runtime.ts` 的 spendMarks，键位 1/2/3）；
 * - 价格与名字全部来自 `data/marks.ts`，这里**不许写死任何数字**；
 * - 「还差多久」用 `MARKS_PER_MINUTE` 反推，而不是另写一个经验常亮数 ——
 *   速率一变（D81 就重锚过一次），这句提示必须跟着变，否则就是又一句会静默失真的文案。
 */
import {
  MARKS_COST,
  MARKS_PER_MINUTE,
  MARK_SINK_NAME,
  type MarkSink,
} from '../data/marks';
import {
  EMPTY_FRAGMENTS,
  FRAGMENT_TERM,
  fragmentSummaryText,
  type FragmentElement,
  type FragmentState,
} from '../data/fragments';

const W = 520;
const PAD = 16;
const HEAD_H = 26;
// D150：26 → 34。D137 给每档加了一行 11px 的 `SINK_HINT`（「一次性永久：解锁锁层挂机」这类），
// 26px 行高里标题基线在 `ly`、提示基线在 `ly + 11` ⇒ 两者字形下沿/上沿正好相切（实测重叠 0px 但视觉粘连）。
// ceshi 的观察对：面板**没有**因此长高，是「行内两行字」；但字挤在一起等于把提示写成了噪点。
// 改成 34px（标题基线 ly、提示基线 ly + 14），面板总高 +24px 仍远低于 540。
const ROW_H = 34;
const FRAG_ROW_H = 22;
const FOOT_H = 22;

const C = {
  bg: 'rgba(11, 10, 12, 0.92)',
  edge: 'rgba(212, 161, 60, 0.45)',
  gold: '#d4a13c',
  goldSoft: 'rgba(240, 214, 140, 0.95)',
  text: '#d8d3c4',
  dim: '#6d665c',
  ok: '#7ddca8',
  no: '#a8666a',
};

/** 每档的一句话说明（D137 起「定渊」语义变了：不再是跳层，而是解锁锁层挂机） */
const SINK_HINT: Readonly<Record<MarkSink, string>> = {
  rerollCurrency: '买洗灵石 ×1（打造材料）',
  setStartFloor: '一次性永久：解锁锁层挂机（按 L 在本层反复刷）',
  divineReforge: '把最强的一件的灵纹拔到淬炼上限',
};

const SINKS: readonly MarkSink[] = ['rerollCurrency', 'setStartFloor', 'divineReforge'];
/** 面板上的键位：与 `main.ts` 的 sinkByKey 一致（1/2/3） */
const SINK_KEY: Readonly<Record<MarkSink, string>> = {
  rerollCurrency: '1',
  setStartFloor: '2',
  divineReforge: '3',
};

/** 1234567 → `123.5万`；保留一位小数，够玩家判断量级 */
export function formatMarks(n: number): string {
  const v = Number.isFinite(n) ? Math.max(0, n) : 0;
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(2)}亿`;
  if (v >= 10_000) return `${(v / 10_000).toFixed(1)}万`;
  return String(Math.floor(v));
}

/** 还差多少分钟才买得起（按 MARKS_PER_MINUTE）。买得起返回 0；速率为 0 时返回 null（不显示） */
export function minutesUntil(marks: number, cost: number): number | null {
  if (!(MARKS_PER_MINUTE > 0)) return null;
  const gap = Math.max(0, cost - Math.max(0, Number.isFinite(marks) ? marks : 0));
  if (gap <= 0) return 0;
  return Math.ceil(gap / MARKS_PER_MINUTE);
}

/** 一行状态文案：`可换` / `还差 12.0万 ≈ 8 分钟` */
export function sinkStatusText(marks: number, sink: MarkSink): string {
  const cost = MARKS_COST[sink];
  const free = Math.max(0, Number.isFinite(marks) ? marks : 0);
  if (free >= cost) return '可换';
  const mins = minutesUntil(free, cost);
  const gap = formatMarks(cost - free);
  return mins === null ? `还差 ${gap}` : `还差 ${gap} ≈ ${mins} 分钟`;
}

export const MARKS_PANEL_W = W;

export function marksPanelHeight(): number {
  return HEAD_H + SINKS.length * ROW_H + FRAG_ROW_H + FOOT_H + PAD * 2;
}

/** 面板底部的五行碎片一行（D104）：碎片余额 + 当前定向 */
export interface FragmentPanelInfo {
  readonly fragments: FragmentState;
  readonly aim: FragmentElement | null;
}

/**
 * 画渊痕面板。返回面板矩形（探针据此取样，不要自己猜坐标）。
 *
 * 碎片那行（D104）放在这里而不是新开面板：两者都是「长线积累物」，
 * 玩家想花渊痕的时候正好也在想「要不要定向」——一块界面处理两类余额，
 * 少一个键位、少一条探针、少一处需要同步的互斥逻辑。
 */
export function drawMarksPanel(
  ctx: CanvasRenderingContext2D,
  marks: number,
  canvasW: number,
  canvasH: number,
  info?: FragmentPanelInfo,
): { x: number; y: number; w: number; h: number } {
  const h = marksPanelHeight();
  const x = Math.round((canvasW - W) / 2);
  const y = Math.round((canvasH - h) / 2);

  ctx.fillStyle = 'rgba(5, 7, 11, 0.6)';
  ctx.fillRect(0, 0, canvasW, canvasH);

  ctx.fillStyle = C.bg;
  ctx.fillRect(x, y, W, h);
  ctx.strokeStyle = C.edge;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, W - 1, h - 1);
  // 左侧金色竖线：和引导条/图鉴同一套「这是面板」的语言
  ctx.fillStyle = C.gold;
  ctx.fillRect(x, y, 3, h);

  ctx.textAlign = 'left';
  ctx.font = '13px "Noto Sans SC", sans-serif';
  ctx.fillStyle = C.gold;
  ctx.fillText(`渊痕 · ${formatMarks(marks)}`, x + PAD, y + 20);
  ctx.textAlign = 'right';
  ctx.font = '11px "Noto Sans SC", sans-serif';
  ctx.fillStyle = C.dim;
  ctx.fillText(`约 ${formatMarks(MARKS_PER_MINUTE)}/分`, x + W - PAD, y + 20);

  let ly = y + HEAD_H + PAD;
  ctx.textAlign = 'left';
  for (const sink of SINKS) {
    const cost = MARKS_COST[sink];
    const can = Math.max(0, Number.isFinite(marks) ? marks : 0) >= cost;
    ctx.font = '12px "Noto Sans SC", sans-serif';
    ctx.fillStyle = can ? C.ok : C.dim;
    ctx.fillText(`[${SINK_KEY[sink]}]`, x + PAD, ly);
    ctx.fillStyle = can ? C.text : '#8a8272';
    ctx.fillText(MARK_SINK_NAME[sink], x + PAD + 26, ly);

    ctx.textAlign = 'right';
    ctx.fillStyle = can ? C.goldSoft : '#7a7266';
    ctx.fillText(`价 ${formatMarks(cost)}`, x + W - PAD - 96, ly);
    ctx.fillStyle = can ? C.ok : C.no;
    ctx.fillText(sinkStatusText(marks, sink), x + W - PAD, ly);
    ctx.textAlign = 'left';
    ctx.font = '11px "Noto Sans SC", sans-serif';
    ctx.fillStyle = C.dim;
    ctx.fillText(SINK_HINT[sink], x + PAD + 26, ly + 14);
    ly += ROW_H;
  }

  // ── 五行碎片（D104）：余额 + 当前定向 ──
  const frag = info?.fragments ?? EMPTY_FRAGMENTS;
  const aim = info?.aim ?? null;
  ctx.font = '12px "Noto Sans SC", sans-serif';
  ctx.fillStyle = C.text;
  ctx.fillText(`碎片　${fragmentSummaryText(frag)}`, x + PAD, ly + 2);
  ctx.textAlign = 'right';
  ctx.font = '11px "Noto Sans SC", sans-serif';
  ctx.fillStyle = aim ? C.goldSoft : C.dim;
  ctx.fillText(aim ? `定向 ${FRAGMENT_TERM[aim]} 行 · F 切换` : '未定向 · F 切换', x + W - PAD, ly + 2);
  ctx.textAlign = 'left';

  ctx.font = '11px "Noto Sans SC", sans-serif';
  ctx.fillStyle = C.dim;
  ctx.fillText('渊痕不产生无限战力（有界强化）　·　M 关闭', x + PAD, y + h - PAD + 4);

  return { x, y, w: W, h };
}
