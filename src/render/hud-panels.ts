/**
 * HUD 面板 —— 画在战斗画面右上角的一列常驻小面板。
 *
 * 放置游戏玩家的决策点全在这里露出：战力涨没涨、掉的东西好不好、
 * 手上攒了几块石头、现在在第几层。第一版不做可点击的背包界面（P1 的 UI 层），
 * 但「不能点」不等于「看不见」——玩家至少要能看见自己在变强、以及自己在攒什么。
 *
 * 纪律：这里只读 session，绝不改。任何"捡起来"/"换装"的逻辑都必须
 * 走 inventory.ts 的纯函数，否则离线收益（无渲染）和在线不一致。
 */
import type { GameSession } from '../core/session';
import { characterPower, equipmentSummary, itemPower, slotForItem } from '../core/inventory';
import { powerDeltaText, powerRatioText, rarityRankText } from '../core/power-rank';
import { SLOT_NAME } from '../data/slots';
import { RARITY_NAME, type Rarity } from '../data/rarity';
import { CURRENCIES, type CurrencyId } from '../data/currency';
import { TERM, formatRealm } from '../data/glossary';
import { MAX_FLOOR, MAIN_FLOOR_END, depthRarityBonus } from '../data/monsters';
import { TOTAL_STEPS } from '../core/progression';
import { affordableSinks } from '../data/marks';

const C = {
  panel: 'rgba(11, 10, 12, 0.82)',
  edge: 'rgba(140, 165, 200, 0.18)',
  text: '#d8d3c4',
  dim: '#6d665c',
  gold: '#d4a13c',
  teal: '#4fd1c5',
  purple: '#6b3fa0',
};

/**
 * 品阶配色：和掉落光柱同一套色（`DROP_COLOR` 的实色版），
 * 让玩家「地上那道蓝光 = 面板里这行蓝字」直接对上，不用学两套色卡。
 */
const RARITY_COLOR: Record<Rarity, string> = {
  fan: '#c8d4e4',
  ling: '#508ff0',
  bao: '#f0d264',
  xian: '#f59637',
};

/** 通货 id → 术语名（currency.ts 只有 CURRENCIES 表，别自己再抄一份中文） */
const CURRENCY_NAME = Object.fromEntries(
  CURRENCIES.map((c) => [c.id, c.name]),
) as Record<CurrencyId, string>;

const PANEL_W = 210;
const PANEL_X_GAP = 14;
const ROW_H = 16;
const GAP = 8;

type Line = { label: string; value: string; color?: string };

/** 画一块面板，返回它的高度（调用方靠返回值堆叠，别写死坐标） */
function drawPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  lines: readonly Line[],
  title?: string,
): number {
  const head = title ? 16 : 0;
  const h = 10 + head + lines.length * ROW_H + 4;
  ctx.fillStyle = C.panel;
  ctx.fillRect(x, y, PANEL_W, h);
  ctx.strokeStyle = C.edge;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, PANEL_W - 1, h - 1);

  ctx.font = '12px "Noto Sans SC", sans-serif';
  let ly = y + 18;
  if (title) {
    ctx.textAlign = 'left';
    ctx.fillStyle = C.dim;
    ctx.fillText(title, x + 12, ly);
    ly += 14;
  }
  for (const line of lines) {
    ctx.textAlign = 'left';
    ctx.fillStyle = C.dim;
    ctx.fillText(line.label, x + 12, ly);
    ctx.textAlign = 'right';
    ctx.fillStyle = line.color ?? C.text;
    ctx.fillText(line.value, x + PANEL_W - 12, ly);
    ly += ROW_H;
  }
  ctx.textAlign = 'left';
  return h;
}

/** 右上角状态面板：境界 / 战力 / 层数 / 波次 / 击杀。返回高度 */
export function drawStatusPanel(
  ctx: CanvasRenderingContext2D,
  s: GameSession,
  topOffset = 44,
): number {
  const maxed = s.character.step >= TOTAL_STEPS - 1;
  const marks = Math.max(0, Math.floor(s.character.marks ?? 0));
  const lines: Line[] = [
    { label: TERM.realm, value: formatRealm(s.character.step), color: C.gold },
    { label: '战力', value: String(characterPower(s.character)), color: C.teal },
    // 层数后面标出无尽区：玩家必须一眼看出「27 之后还有内容」，
    // 否则满级那一刻他会以为游戏结束了（D36-A 的存在理由）。
    {
      label: '层数',
      value: s.floor > MAIN_FLOOR_END ? `${s.floor} / ${MAX_FLOOR} · 渊底` : `${s.floor} / ${MAIN_FLOOR_END}`,
      color: s.floor > MAIN_FLOOR_END ? C.purple : C.text,
    },
    { label: '波次', value: String(s.wave), color: C.text },
    { label: '击杀', value: `${s.battle.kills}（死 ${s.floorDeaths}）`, color: C.dim },
  ];
  // 渊痕只在满级后才有意义（它是满级后的唯一积累物，不产生战力）。
  // 露出「可换什么」比只显示数字有用：玩家看到 20 万就能换一次深层落脚点。
  if (maxed || marks > 0) {
    lines.push({
      label: '渊痕',
      value: `${marks.toLocaleString('en-US')}${affordableSinks(marks).length > 0 ? ' · 可换' : ''}`,
      color: marks > 0 ? C.gold : C.dim,
    });
  }
  // 无尽层的仙缘加成：让「越深越富」有可见凭据，不然它只是埋在设计文档里的一句话
  const depth = depthRarityBonus(s.floor);
  if (depth > 0) {
    lines.push({ label: '深缘', value: `+${Math.round(depth * 100)}% 仙缘`, color: C.teal });
  }
  return drawPanel(ctx, 960 - PANEL_W - PANEL_X_GAP, topOffset, lines);
}

/** 装备一览：部位 / 名字 / 品阶 / 灵纹条数。返回高度（0 = 没画） */
export function drawEquipmentPanel(
  ctx: CanvasRenderingContext2D,
  s: GameSession,
  topOffset = 44,
): number {
  const equipped = equipmentSummary(s.character);
  if (equipped.length === 0) return 0;
  const lines: Line[] = equipped.map((e) => ({
    label: SLOT_NAME[e.item.slot] ?? e.slot,
    value: `${e.item.name} · ${RARITY_NAME[e.item.rarity]}${e.item.affixes.length > 0 ? ` ${e.item.affixes.length}纹` : ''}${e.item.legendary ? ' · 传奇' : ''}`,
    color: RARITY_COLOR[e.item.rarity],
  }));
  return drawPanel(ctx, 960 - PANEL_W - PANEL_X_GAP, topOffset, lines, '法宝');
}

/** 通货口袋 + 玉简：玩家攒的东西必须看得见（不然打造是黑箱）。返回高度 */
export function drawPocketPanel(
  ctx: CanvasRenderingContext2D,
  s: GameSession,
  topOffset = 44,
): number {
  const order: CurrencyId[] = ['huang', 'mie', 'xi'];
  const gemCount = Object.values(s.gemPouch).reduce((a, b) => a + b, 0);
  const lines: Line[] = order.map((id) => ({
    label: CURRENCY_NAME[id],
    value: String(s.pocket[id] ?? 0),
    color: C.gold,
  }));
  lines.push({ label: TERM.supportStone, value: String(gemCount), color: C.purple });
  return drawPanel(ctx, 960 - PANEL_W - PANEL_X_GAP, topOffset, lines, '囊中');
}

/** 背包前 3 件（简单露出，不做成可点击界面）。返回高度（0 = 没画） */
export function drawBagPanel(
  ctx: CanvasRenderingContext2D,
  s: GameSession,
  topOffset = 44,
): number {
  const shown = s.bag.slice(0, 3);
  if (shown.length === 0) return 0;
  const equipped = equipmentSummary(s.character);
  /**
   * 两个数必须分开显示（D89 口径 1）：
   * - `1.03×` = itemPower ÷ 判据 C 的分母，**和验收用的是同一个数**；
   * - `身上 +12%` = 和身上同部位那件比，换装决策用。
   * 跨部位不可比（玉佩 p50 是戒指的 7.4 倍），所以这条只和「自己身上那件」比。
   */
  const lineOf = (item: (typeof shown)[number]): string => {
    const slot = slotForItem(s.character, item);
    const cur = slot ? equipped.find((e) => e.slot === slot) : undefined;
    const ratio = powerRatioText(item);
    const delta = powerDeltaText(item, cur?.item);
    const parts = [RARITY_NAME[item.rarity]];
    if (ratio) parts.push(ratio);
    if (delta) parts.push(delta === '空位' ? '空位' : `身上${delta}`);
    if (item.legendary) parts.push('传奇');
    return parts.join(' · ');
  };
  const lines: Line[] = shown.map((item) => ({
    label: SLOT_NAME[item.slot] ?? item.slot,
    value: lineOf(item),
    color: RARITY_COLOR[item.rarity],
  }));
  return drawPanel(ctx, 960 - PANEL_W - PANEL_X_GAP, topOffset, lines, `背包 ${s.bag.length}/40`);
}

/**
 * 把四块面板自顶向下排好。
 *
 * 用「每块返回高度 + 累加」而不是写死坐标：面板行数是变的（装备 1~9 行、
 * 背包 0~3 行），写死坐标一改行数就叠在一起，而且这种错在截图里很难看出来。
 */
export function drawHudStack(ctx: CanvasRenderingContext2D, s: GameSession, top = 44): number {
  let y = top;
  y += drawStatusPanel(ctx, s, y) + GAP;
  y += drawEquipmentPanel(ctx, s, y) + GAP;
  y += drawPocketPanel(ctx, s, y) + GAP;
  y += drawBagPanel(ctx, s, y) + GAP;
  return y - top;
}

/** 整列 HUD 的最大高度（渲染器留空间用） */
export function hudStackHeight(s: GameSession): number {
  const status = 10 + 5 * ROW_H + 4;
  const equipped = equipmentSummary(s.character).length;
  const equip = equipped === 0 ? 0 : 10 + 16 + equipped * ROW_H + 4;
  const pocket = 10 + 16 + 4 * ROW_H + 4;
  const bag = s.bag.length === 0 ? 0 : 10 + 16 + Math.min(3, s.bag.length) * ROW_H + 4;
  const panels = [status, equip, pocket, bag].filter((h) => h > 0).length;
  return status + equip + pocket + bag + Math.max(0, panels - 1) * GAP;
}

export const HUD_COLORS = { ...C, RARITY_COLOR };
