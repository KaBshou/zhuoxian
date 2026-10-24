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
import { prestigeReady } from '../core/session';
import { BAG_CAPACITY, characterPower, equipmentSummary, itemPower, slotForItem } from '../core/inventory';
import { powerDeltaText, powerRatioText, rarityRankText } from '../core/power-rank';
import { SLOT_NAME, type SlotId } from '../data/slots';
import { RARITY_NAME, type Rarity } from '../data/rarity';
import { CURRENCIES, type CurrencyId } from '../data/currency';
import { TERM, formatRealm } from '../data/glossary';
import { MAX_FLOOR, MAIN_FLOOR_END, depthRarityBonus } from '../data/monsters';
import { TOTAL_STEPS, xpForStep } from '../core/progression';
import { affordableSinks } from '../data/marks';
import { drawPaperdoll, paperdollHeight } from './paperdoll';
import { CODEX_TOTAL, codexProgress } from '../core/codex';
import { achievementSummary } from '../core/achievement';
import { ACHIEVEMENT_TOTAL } from '../data/achievements';

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

/**
 * HUD 布局（D176）：顶栏 38px 只放血条，下面分两列 ——
 *   左列：法宝（装备）—— 用户明确要求「装备可以直接在主界面看到」，不再藏在 E 面板里；
 *   右列：状态 / 囊中 / 背包。
 * 面板都从 `HUD_TOP` 开始往下堆，按钮条占 y 42~64，所以起点取 74。
 */
export const TOP_STRIP_H = 38;
export const HUD_TOP = 74;
/**
 * 底栏占的高度（D177）。底栏是「第 N 波　M 层　击杀…　键位提示」那一行，
 * 基线原本写死在 `BATTLE_H - 14`。
 *
 * 抽成常量是为了让**别的东西知道它占了多少地方**：引导框（引路）原本
 * 也是从画面底部往上算的，两者直接叠在一起（线上截图实拍）。
 * 引导框现在按这个常量让位。
 */
export const FOOTER_H = 26;
export const HUD_PANEL_W = PANEL_W;
export const HUD_LEFT_X = PANEL_X_GAP;
export const HUD_RIGHT_X = 960 - PANEL_W - PANEL_X_GAP;
const PANEL_X_RIGHT = HUD_RIGHT_X;
const PANEL_X_LEFT = HUD_LEFT_X;

/**
 * 一行 HUD 数据。
 *
 * `bar` 存在时，这一行下方多画一条 4px 进度条（0~1）。
 * 为什么要进度条：挂机游戏的正反馈是「离下一个目标还有多远」，
 * 而「金丹·三重」是状态不是进度 —— 只有数字，玩家感受不到自己在推进。
 */
type Line = { label: string; value: string; color?: string; bar?: number };
const BAR_H = 4;
const BAR_GAP = 4;

/** 画一块面板，返回它的高度（调用方靠返回值堆叠，别写死坐标） */
function drawPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  lines: readonly Line[],
  title?: string,
): number {
  const head = title ? 16 : 0;
  const bars = lines.filter((l) => typeof l.bar === 'number').length;
  const h = 10 + head + lines.length * ROW_H + bars * (BAR_H + BAR_GAP) + 4;
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
    if (typeof line.bar === 'number') {
      const ratio = Number.isFinite(line.bar) ? Math.max(0, Math.min(1, line.bar)) : 0;
      const bx = x + 12;
      const bw = PANEL_W - 24;
      // 底槽用极暗实色：静音/暗色背景下也要能看出「这条有长度」
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(bx, ly - 4, bw, BAR_H);
      if (ratio > 0) {
        ctx.fillStyle = C.teal;
        ctx.fillRect(bx, ly - 4, Math.max(1, Math.round(bw * ratio)), BAR_H);
      }
      ly += BAR_H + BAR_GAP;
    }
  }
  ctx.textAlign = 'left';
  return h;
}

/** 右上角状态面板：境界 / 战力 / 层数 / 波次 / 击杀。返回高度 */
/**
 * 轮回提示的文案（纯函数，单测直接钉「什么时候该显示、显示什么」）。
 *
 * 为什么单独抽出来：满级是 4 小时之后才到的状态，用截图和探针验一次要挂机很久；
 * 抽成纯函数就能在单测里把「满级 / 死亡冷却 / 已轮回若干次」三种状态一次钉死。
 */
export function prestigeHintText(s: GameSession): string | null {
  if (!prestigeReady(s)) return null;
  return s.cycle > 0 ? `第 ${s.cycle} 周目圆满 · 按 N 再入` : '渡劫圆满 · 按 N 入轮回';
}

/** 当前台阶的修为进度（0~1）。满级返回 1；脏值返回 0。 */
export function realmProgressRatio(step: number, xp: number): number {
  if (!Number.isFinite(step) || !Number.isFinite(xp)) return 0;
  if (step >= TOTAL_STEPS - 1) return 1;
  const need = xpForStep(step);
  if (!Number.isFinite(need) || need <= 0) return 0;
  const cur = Math.max(0, xp);
  return Math.max(0, Math.min(1, cur / need));
}

/** 修为进度文案：`金丹·三重 42%`（满级写「圆满」）。 */
export function realmProgressText(step: number, xp: number): string {
  const ratio = realmProgressRatio(step, xp);
  if (step >= TOTAL_STEPS - 1) return `${formatRealm(step)} · 圆满`;
  return `${formatRealm(step)} · ${Math.floor(ratio * 100)}%`;
}

export function drawStatusPanel(
  ctx: CanvasRenderingContext2D,
  s: GameSession,
  topOffset = 44,
): number {
  const maxed = s.character.step >= TOTAL_STEPS - 1;
  const marks = Math.max(0, Math.floor(s.character.marks ?? 0));
  // 境界 / 战力 / 层数 / 波次 已经在顶栏（drawTopStripInfo、D176），这里不再重复：
  // 同一组数字画两遍，玩家会以为两个数不一样。
  const lines: Line[] = [
    // 修为进度放第一行：它是玩家每一分钟都在看的那条线
    {
      label: TERM.xp ?? '修为',
      value: realmProgressText(s.character.step, s.character.xp),
      color: maxed ? C.gold : C.teal,
      bar: realmProgressRatio(s.character.step, s.character.xp),
    },
    { label: '击杀', value: `${s.battle.kills}（死 ${s.floorDeaths}）`, color: C.dim },
  ];
  // 收集（D195）：图鉴与成就各自有面板，但没有一个地方告诉玩家「它们存在、现在几成」。
  // 挂机游戏里「还差几个」比「有几个」更能驱动，所以两个分母都写出来。
  {
    const codexGot = s.codex ? codexProgress(s.codex).total.got : 0;
    const achGot = s.achievements ? achievementSummary(s.achievements).got : 0;
    lines.push({
      label: '收集',
      value: `图鉴 ${codexGot}/${CODEX_TOTAL}　成就 ${achGot}/${ACHIEVEMENT_TOTAL}`,
      color: codexGot > 0 || achGot > 0 ? C.teal : C.dim,
    });
  }

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
  // 轮回（D180）：满级那一刻「按 N」是本项目唯一不可撤销的操作，玩家必须看得见它可用。
  // 只在真的可入时提示；死亡冷却中不显示（那时按 N 会被拒，提示了反而像 bug）。
  const prestigeHint = prestigeHintText(s);
  if (prestigeHint !== null) {
    lines.push({ label: '轮回', value: prestigeHint, color: C.gold });
  }
  return drawPanel(ctx, PANEL_X_RIGHT, topOffset, lines);
}

/**
 * 装备一览（D178）：改成**格子式纸娃娃**，10 个部位常驻。
 *
 * 原来这里是 10 行文字（`法器  铁剑 · 凡品`），三个问题：
 * 空位也占一行、品阶只能靠字色扫、**点不开**（看到「道袍 · 灵品 2纹」却看不到灵纹）。
 * 格子把这三件事一起解决：空位是灰框、品阶是边框色、点一格打开详情对比。
 *
 * 返回高度（0 = 没画）。
 */
export function drawEquipmentPanel(
  ctx: CanvasRenderingContext2D,
  s: GameSession,
  topOffset = 44,
  focusedSlot: SlotId | null = null,
): number {
  return drawPaperdoll(ctx, s, PANEL_X_LEFT, topOffset, PANEL_W, focusedSlot);
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
  return drawPanel(ctx, PANEL_X_RIGHT, topOffset, lines, '囊中');
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
  const bagFull = s.bag.length >= BAG_CAPACITY;
  // 满了要写出来：挂机时背包满了会**静默丢弃最差的件**，不提示等于玩家不知道自己丢了什么（D198）
  return drawPanel(ctx, PANEL_X_RIGHT, topOffset, lines, bagFull ? `背包 ${s.bag.length}/${BAG_CAPACITY} · 满` : `背包 ${s.bag.length}/${BAG_CAPACITY}`);
}

/**
 * 把 HUD 排成两列（D176）。
 *
 * 左列：法宝（装备）—— 常驻，玩家一眼看到自己穿了什么、什么品阶、有没有传奇；
 * 右列：状态 / 囊中 / 背包。
 *
 * 用「每块返回高度 + 累加」而不是写死坐标：面板行数是变的（装备 1~9 行、
 * 背包 0~3 行），写死坐标一改行数就叠在一起，而且这种错在截图里很难看出来。
 */
export function drawHudStack(
  ctx: CanvasRenderingContext2D,
  s: GameSession,
  top = HUD_TOP,
  focusedSlot: SlotId | null = null,
): number {
  // 左列（法宝）从顶栏下沿开始 —— 按钮条只占右侧，左侧 42 起是空的，
  // 让装备尽量往上、尽量像"主界面的一部分"而不是"一个藏起来的面板"。
  const leftH = drawEquipmentPanel(ctx, s, TOP_STRIP_H + 4, focusedSlot);
  let ry = top;
  ry += drawStatusPanel(ctx, s, ry) + GAP;
  ry += drawPocketPanel(ctx, s, ry) + GAP;
  ry += drawBagPanel(ctx, s, ry) + GAP;
  return Math.max(leftH, ry - top);
}

/**
 * 顶栏右侧常驻两行：境界 · 战力 / 层数 · 波次（D176）。
 *
 * 为什么不放进右列面板：这几个数玩家每秒都要扫一眼（跟血条同级），
 * 塞进面板就要低头找；而顶栏右侧本来是空的（罡气条右端 632，之后一直空到 946）。
 *
 * **必须挤在 38px 高的顶栏里**（两行：基线 17 / 32）：按钮条从 y=42 开始，
 * 文字一旦画到 38 以下就会压到按钮上。
 *
 * 2026-10-23 线上事故（D177）：原来用 `cx - 78` 这种**写死偏移**给左半段留位，
 * 但「练气·一重」实测宽度 > 78px，于是境界与战力两串字**叠在一起**渲染成
 * `练气·一重战力156.65895`。改成 `topStripRows()` 先算宽度再定位（可单测），
 * 并且战力取整（挂机游戏没人需要小数点后 5 位，`156.65895` 还会撑爆行宽）。
 */
export interface TopStripItem {
  readonly text: string;
  readonly color: string;
  readonly align: 'left' | 'right';
}

export interface TopStripRow {
  readonly items: readonly TopStripItem[];
}

/** 估算一段文字的像素宽度（顶栏布局用；宁可高估，否则又会叠） */
export function estimateTextWidth(text: string, fontPx: number): number {
  let units = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    units += code < 0x2e80 ? 0.55 : 1;
  }
  return units * fontPx;
}

const STRIP_GAP = 10;

/**
 * 顶栏右侧两行的排布（纯函数，单测直接钉「两段文字不许重叠」）。
 *
 * 规则：一行里最后一项右对齐到 `right`，前面的项依次往左摆、中间留 `STRIP_GAP`。
 * 这样只要总宽不超预算就**永远不会叠**——叠是因为写了固定偏移，不是因为字太长。
 */
export function topStripRows(
  s: GameSession,
  right = 946,
  maxW = 300,
): readonly TopStripRow[] {
  const deep = s.floor > MAIN_FLOOR_END;
  const realm = formatRealm(s.character.step);
  // 战力取整：`characterPower` 返回浮点，直接贴进模板会出现 156.65895
  const power = `战力 ${Math.round(characterPower(s.character))}`;
  const floorText = `${deep ? '渊底 ' : ''}${s.floor} / ${deep ? MAX_FLOOR : MAIN_FLOOR_END} 层`;
  const waveText = `第 ${s.wave} 波`;

  // 两行都用同一个字号（12px）量宽度，避免一行量 12 一行画 11 造成的误差
  const wRealm = estimateTextWidth(realm, 12);
  const wPower = estimateTextWidth(power, 12);
  const wFloor = estimateTextWidth(floorText, 11);
  const wWave = estimateTextWidth(waveText, 11);

  // 第一行超预算时砍掉境界（战力比境界重要：玩家靠它判断换装有没有用）
  const row1: TopStripItem[] = [];
  if (wRealm + STRIP_GAP + wPower <= maxW) {
    row1.push({ text: realm, color: C.gold, align: 'left' });
  }
  row1.push({ text: power, color: C.teal, align: 'left' });

  const row2: TopStripItem[] = [];
  if (wFloor + STRIP_GAP + wWave <= maxW) {
    row2.push({ text: floorText, color: deep ? C.purple : C.text, align: 'left' });
  }
  row2.push({ text: waveText, color: C.dim, align: 'left' });

  return [{ items: row1 }, { items: row2 }];
}

export function drawTopStripInfo(ctx: CanvasRenderingContext2D, s: GameSession): void {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const right = 946;
  const rows = topStripRows(s, right);
  const ys = [17, 32];
  const sizes = [12, 11];

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row) continue;
    const fontPx = sizes[i] ?? 11;
    ctx.font = `${fontPx}px "Noto Sans SC", system-ui, sans-serif`;
    const widths = row.items.map((it) => estimateTextWidth(it.text, fontPx));
    const total = widths.reduce((a, b) => a + b, 0) + STRIP_GAP * Math.max(0, row.items.length - 1);
    let x = right - total;
    const y = ys[i] ?? 32;
    for (let k = 0; k < row.items.length; k += 1) {
      const it = row.items[k];
      if (!it) continue;
      ctx.fillStyle = it.color;
      ctx.fillText(it.text, x, y);
      x += (widths[k] ?? 0) + STRIP_GAP;
    }
  }
  ctx.restore();
}

/** HUD 占用的最大高度（两列取高的那列；渲染器留空间用） */
export function hudStackHeight(s: GameSession): number {
  const status = 10 + 5 * ROW_H + 4;
  const equip = paperdollHeight(PANEL_W);
  const pocket = 10 + 16 + 4 * ROW_H + 4;
  const bag = s.bag.length === 0 ? 0 : 10 + 16 + Math.min(3, s.bag.length) * ROW_H + 4;
  // 左列只有法宝一块；右列三块加间隔
  const right = status + pocket + bag + 2 * GAP;
  return Math.max(equip, right);
}

export const HUD_COLORS = { ...C, RARITY_COLOR };
