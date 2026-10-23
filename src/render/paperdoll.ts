/**
 * 纸娃娃（法宝格）—— 主界面左列的 10 个法宝位，格子式排布（D178）。
 *
 * 为什么从「文字行」改成「格子」：
 * 用户原话「ui可以参考 idle-grim，装备可以直接在主界面看到」。原来的左列是
 * 10 行文字（`法器  铁剑 · 凡品`），问题有三个：
 *   1. 一件装备占一行，10 件就是 10 行，挤到屏幕一半，而**空位也在占行**；
 *   2. 品阶只能靠文字颜色区分，扫视时看不出「我哪几个部位还是空的」；
 *   3. 不能点 —— 玩家看到「道袍 · 灵品 2纹」却点不开，等于看不见灵纹。
 *
 * 格子解决这三件事：空位是一格灰框（一眼看出缺口）、品阶是边框色
 * （和地上掉落光柱同一套色，不用学第二套）、点一格就打开详情。
 *
 * 纪律：
 *   - 几何计算（`paperdollLayout`）与绘制分离，**布局是唯一出处**，
 *     命中测试和绘制都调它 —— 写死两份坐标迟早对不上（D177 顶栏事故同源）；
 *   - 只读 session，绝不改任何东西（捡装/换装只走 inventory.ts 的纯函数）。
 */
import type { GameSession } from '../core/session';
import type { Item } from '../core/item';
import type { SlotId } from '../data/slots';
import { SLOT_IDS } from '../data/slots';
import { RARITY_NAME, type Rarity } from '../data/rarity';
import { equipmentSummary } from '../core/inventory';

/** 品阶配色：与掉落光柱（DROP_COLOR 实色版）、HUD 背包行同一套 */
export const PAPERDOLL_RARITY_COLOR: Readonly<Record<Rarity, string>> = {
  fan: '#c8d4e4',
  ling: '#508ff0',
  bao: '#f0d264',
  xian: '#f59637',
};

/**
 * 格子里的短名。`SLOT_NAME` 是给详情面板用的全名（「本命法宝」「踏云靴」），
 * 塞进 96px 宽的格子会被截断，所以这里另给一套短名。
 * **不是重复定义**：同一个概念的两种长度，全名只有一处（slots.ts），
 * 短名只用于格子，改全名不会影响格子。
 */
const SLOT_TAG: Readonly<Record<SlotId, string>> = {
  sword: '法器',
  relic: '本命',
  crown: '冠',
  robe: '道袍',
  bracer: '护腕',
  boots: '靴',
  belt: '腰带',
  ring1: '戒指',
  ring2: '戒指',
  pendant: '玉佩',
};

export const PAPERDOLL_COLS = 2;
export const PAPERDOLL_CELL_H = 34;
export const PAPERDOLL_GAP = 5;
export const PAPERDOLL_PAD = 10;
export const PAPERDOLL_HEAD = 20;

export interface PaperdollCell {
  readonly slot: SlotId;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * 10 个格子的矩形（纯函数）。
 *
 * 顺序用 `SLOT_IDS` 的原始顺序（法器/本命/冠/道袍/护腕/靴/腰带/戒1/戒2/玉佩），
 * 不按「左半身右半身」重排：玩家记住的是列表顺序，重排会让「我上次看的那个位置」
 * 变成别的部位。
 */
export function paperdollLayout(
  x: number,
  y: number,
  width: number,
  cellH = PAPERDOLL_CELL_H,
): readonly PaperdollCell[] {
  const inner = Math.max(0, width - PAPERDOLL_PAD * 2);
  const cellW = Math.max(1, Math.floor((inner - PAPERDOLL_GAP * (PAPERDOLL_COLS - 1)) / PAPERDOLL_COLS));
  // 取整会在右边剩下 0~1px。把这点余量对半分到左右，格子就视觉居中 ——
  // 否则右边永远比左边多 1px，放大后看起来像整块面板歪了。
  const used = cellW * PAPERDOLL_COLS + PAPERDOLL_GAP * (PAPERDOLL_COLS - 1);
  const slack = Math.max(0, Math.floor((inner - used) / 2));
  return SLOT_IDS.map((slot, i) => {
    const col = i % PAPERDOLL_COLS;
    const row = Math.floor(i / PAPERDOLL_COLS);
    return {
      slot,
      x: x + PAPERDOLL_PAD + slack + col * (cellW + PAPERDOLL_GAP),
      y: y + PAPERDOLL_HEAD + row * (cellH + PAPERDOLL_GAP),
      w: cellW,
      h: cellH,
    };
  });
}

/** 纸娃娃整体高度（含标题行与底部留白），给 HUD 堆叠用 */
export function paperdollHeight(width: number, cellH = PAPERDOLL_CELL_H): number {
  const cells = paperdollLayout(0, 0, width, cellH);
  const last = cells[cells.length - 1];
  if (!last) return PAPERDOLL_HEAD + PAPERDOLL_PAD;
  return last.y + last.h + PAPERDOLL_PAD;
}

/** 命中测试：点在哪一格（闭区间 —— 触摸有亚像素抖动，差 1px 判空会显得时灵时不灵） */
export function hitTestPaperdoll(
  px: number,
  py: number,
  x: number,
  y: number,
  width: number,
): SlotId | null {
  for (const c of paperdollLayout(x, y, width)) {
    if (px >= c.x && px <= c.x + c.w && py >= c.y && py <= c.y + c.h) return c.slot;
  }
  return null;
}

/** 一格上要显示的文字（纯函数，单测直接钉，不需要 canvas） */
export interface PaperdollCellText {
  readonly tag: string;
  readonly name: string;
  readonly sub: string;
  readonly empty: boolean;
  readonly color: string;
}

export function paperdollCellText(item: Item | null, slot: SlotId): PaperdollCellText {
  const tag = SLOT_TAG[slot];
  if (!item) {
    return { tag, name: '空', sub: '', empty: true, color: '#3a3a42' };
  }
  // 名字截断到 6 个字符：格子 96px、10px 字，超过就被裁掉一半更难认
  const name = item.name.length > 6 ? `${item.name.slice(0, 6)}…` : item.name;
  const bits = [RARITY_NAME[item.rarity]];
  if (item.affixes.length > 0) bits.push(`${item.affixes.length}纹`);
  if (item.legendary) bits.push('传奇');
  return {
    tag,
    name,
    sub: bits.join(' · '),
    empty: false,
    color: PAPERDOLL_RARITY_COLOR[item.rarity],
  };
}

const C = {
  panel: 'rgba(11, 10, 12, 0.82)',
  edge: 'rgba(140, 165, 200, 0.18)',
  cell: 'rgba(20, 20, 26, 0.9)',
  emptyCell: 'rgba(14, 14, 18, 0.75)',
  text: '#d8d3c4',
  dim: '#6d665c',
  gold: '#d4a13c',
  focus: 'rgba(240, 214, 140, 0.95)',
};

/**
 * 画纸娃娃，返回整体高度。
 *
 * `focused` 是当前打开详情的那一格（画金框）—— 玩家点了一格之后必须知道
 * 「我现在看的是哪一格」，否则 10 张卡片长得一样。
 */
export function drawPaperdoll(
  ctx: CanvasRenderingContext2D,
  s: GameSession,
  x: number,
  y: number,
  width: number,
  focused: SlotId | null = null,
): number {
  const equipped = equipmentSummary(s.character);
  const bySlot = new Map<SlotId, Item>();
  for (const e of equipped) bySlot.set(e.slot, e.item);

  const h = paperdollHeight(width);
  ctx.fillStyle = C.panel;
  ctx.fillRect(x, y, width, h);
  ctx.strokeStyle = C.edge;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, h - 1);

  ctx.textAlign = 'left';
  ctx.font = '12px "Noto Sans SC", sans-serif';
  ctx.fillStyle = C.dim;
  ctx.fillText('法宝', x + PAPERDOLL_PAD, y + 15);

  const filled = equipped.length;
  ctx.textAlign = 'right';
  ctx.fillStyle = filled >= SLOT_IDS.length ? C.gold : C.dim;
  ctx.fillText(`${filled}/${SLOT_IDS.length}`, x + width - PAPERDOLL_PAD, y + 15);
  ctx.textAlign = 'left';

  for (const c of paperdollLayout(x, y, width)) {
    const item = bySlot.get(c.slot) ?? null;
    const t = paperdollCellText(item, c.slot);

    ctx.fillStyle = t.empty ? C.emptyCell : C.cell;
    ctx.fillRect(c.x, c.y, c.w, c.h);

    // 边框 = 品阶色；空位用暗灰（"我这儿还是空的"要一眼看出来）
    ctx.strokeStyle = t.empty ? 'rgba(90, 84, 76, 0.5)' : t.color;
    ctx.globalAlpha = t.empty ? 1 : 0.75;
    ctx.lineWidth = 1;
    ctx.strokeRect(c.x + 0.5, c.y + 0.5, c.w - 1, c.h - 1);
    ctx.globalAlpha = 1;

    if (c.slot === focused) {
      ctx.strokeStyle = C.focus;
      ctx.lineWidth = 2;
      ctx.strokeRect(c.x + 1, c.y + 1, c.w - 2, c.h - 2);
      ctx.lineWidth = 1;
    }

    // 左上：部位短名（永远显示，空位也要知道这格是哪个部位）
    ctx.font = '10px "Noto Sans SC", sans-serif';
    ctx.fillStyle = t.empty ? '#4a4a52' : C.dim;
    ctx.fillText(t.tag, c.x + 6, c.y + 13);

    // 左下：装备名（空位写「空」）
    ctx.font = '11px "Noto Sans SC", sans-serif';
    ctx.fillStyle = t.empty ? '#3a3a42' : t.color;
    ctx.fillText(t.name, c.x + 6, c.y + 27);

    // 右下：品阶 · 纹数（空位不画，避免整格都是灰字）
    if (!t.empty && t.sub) {
      ctx.font = '9px "Noto Sans SC", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillStyle = C.dim;
      ctx.fillText(t.sub, c.x + c.w - 6, c.y + 13);
      ctx.textAlign = 'left';
    }
  }

  return h;
}
