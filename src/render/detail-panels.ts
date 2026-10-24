/**
 * 法宝详情面板（按 E 开）—— 把每件装备上的灵纹一条条摊开。
 *
 * 为什么必须有：本作的核心是「词缀组合出 build」，但如果玩家只能看到
 * 「道袍 · 灵品 2纹」，那 60 条灵纹等于不存在——他不知道自己在凑什么，
 * 也不知道换下这件会失去什么。这是本作最贵的一层信息（60 条灵纹的数值
 * 全是拿 sim 标定出来的），看不见就是白做。
 *
 * 纪律：只读 session。这里的数字全部来自 item.base / item.affixes 原始实例，
 * 不许在这里做求和（求和会让「灭灵石随机删一条」这类操作变得不可解释）。
 */
import type { GameSession } from '../core/session';
import type { Item } from '../core/item';
import type { AffixInstance } from '../core/item';
import { equipmentSummary, itemPower } from '../core/inventory';
import { powerRatioText, rarityRankText } from '../core/power-rank';
import { SLOT_NAME, type SlotId } from '../data/slots';
import { RARITY_NAME, type Rarity } from '../data/rarity';
import { STAT_META, formatModifier } from '../data/stats';
import { legendaryOf } from '../core/item';
import { characterStats } from '../core/character';
import { TERM } from '../data/glossary';

const RARITY_COLOR: Record<Rarity, string> = {
  fan: '#c8d4e4',
  ling: '#508ff0',
  bao: '#f0d264',
  xian: '#f59637',
};

const CARD_W = 244;
const CARD_H = 148;
const CARD_GAP = 10;
const COLS = 3;
const ROWS = 3;
const LINE_H = 14;

/** 一条灵纹在面板上的样子：词条名 + 数值（按 op 决定量纲，见 formatModifier） */
function affixLine(a: AffixInstance): string {
  const meta = STAT_META[a.stat];
  const name = meta ? meta.name : a.stat;
  return `${a.name} · ${name} ${formatModifier(a.stat, a.op, a.value)}`;
}

function drawCard(
  ctx: CanvasRenderingContext2D,
  item: Item,
  x: number,
  y: number,
): void {
  ctx.fillStyle = 'rgba(11, 10, 12, 0.88)';
  ctx.fillRect(x, y, CARD_W, CARD_H);
  ctx.strokeStyle = RARITY_COLOR[item.rarity];
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, CARD_W - 1, CARD_H - 1);
  ctx.globalAlpha = 1;

  // 标题：部位 + 名字 + 品阶
  ctx.textAlign = 'left';
  ctx.font = '12px "Noto Sans SC", sans-serif';
  ctx.fillStyle = '#6d665c';
  ctx.fillText(SLOT_NAME[item.slot] ?? item.slot, x + 10, y + 16);
  ctx.fillStyle = RARITY_COLOR[item.rarity];
  ctx.fillText(`${item.name} · ${RARITY_NAME[item.rarity]}`, x + 10, y + 31);

  // 右上角两个数（D89 口径 1/2）：
  //   上行 `1.03×` = itemPower ÷ 判据 C 的分母（和验收同一个数）；
  //   下行 `前 30%` = 同部位同品阶内的分位（由 gen-slot-base.mjs 一并产出的 p10/p50/p90 反推）。
  ctx.textAlign = 'right';
  const ratio = powerRatioText(item);
  if (ratio) {
    ctx.fillStyle = '#d4a13c';
    ctx.fillText(ratio, x + CARD_W - 10, y + 16);
  }
  const rank = rarityRankText(item);
  const pctPart = rank.includes('·') ? rank.split('·')[1].trim() : '';
  if (pctPart) {
    ctx.fillStyle = '#8a8272';
    ctx.fillText(pctPart, x + CARD_W - 10, y + 31);
  }
  ctx.textAlign = 'left';

  // 主属性（基底给的，和灵纹分开列，玩家才知道哪部分不会掉）
  let ly = y + 47;
  ctx.fillStyle = '#9c9484';
  for (const b of item.base) {
    const meta = STAT_META[b.stat];
    const label = meta ? meta.name : b.stat;
    ctx.fillText(`基底 ${label} ${formatModifier(b.stat, b.op, b.value)}`, x + 10, ly);
    ly += LINE_H;
  }

  // 灵纹逐条列（最多 4 条，正好放得下）
  ctx.fillStyle = '#d8d3c4';
  for (const a of item.affixes.slice(0, 4)) {
    ctx.fillText(affixLine(a), x + 10, ly);
    ly += LINE_H;
  }
  if (item.affixes.length === 0) {
    ctx.fillStyle = '#5a544c';
    ctx.fillText('（无灵纹）', x + 10, ly);
    ly += LINE_H;
  }

  // 传奇效果（仙品专属）。**和灵纹分开画、颜色也不同**，因为它是
  // 唯一一条「通货洗不掉、只能换装备才能换掉」的词条，玩家必须能一眼分辨。
  const legend = legendaryOf(item);
  if (legend) {
    ly += 2;
    ctx.fillStyle = '#f59637';
    ctx.fillText('传奇 · ' + legend.name, x + 10, ly);
    ly += LINE_H;
    ctx.font = '11px "Noto Sans SC", sans-serif';
    ctx.fillStyle = '#c9a06a';
    for (const line of wrapByWidth(legend.desc, 20)) {
      ctx.fillText(line, x + 10, ly);
      ly += 12;
    }
    ctx.font = '12px "Noto Sans SC", sans-serif';
    // D89 口径 3：itemPower 不读传奇效果（它只权重 base+affixes），
    // 所以带传奇的件基数偏低是正常的 —— 必须明说，否则右上角那个 × 会骗人
    // （历史上出现过 90~95% 的仙品「战力」不如宝品，玩家会以为是 bug）。
    ctx.font = '11px "Noto Sans SC", sans-serif';
    ctx.fillStyle = '#6d665c';
    ctx.fillText('（传奇效果不计入战力）', x + 10, ly);
    ly += 12;
    ctx.font = '12px "Noto Sans SC", sans-serif';
  }
}

/**
 * 按半角宽度折行（全角算 2）。和教程条的 wrap 同一条规则：
 * 不用 ctx.measureText —— 那个在单测里没有 canvas 就炸。
 */
function wrapByWidth(text: string, maxUnits: number): string[] {
  const out: string[] = [];
  let cur = '';
  let w = 0;
  for (const ch of text) {
    const cw = ch.charCodeAt(0) > 0x2e80 ? 2 : 1;
    if (w + cw > maxUnits && cur.length > 0) {
      out.push(cur);
      cur = '';
      w = 0;
    }
    cur += ch;
    w += cw;
  }
  if (cur.length > 0) out.push(cur);
  return out.length > 0 ? out : [text];
}

/**
 * 画整个详情面板。返回是否画了（没有装备就不画）。
 *
 * `focused` 是从纸娃娃点进来的那一格（D178）：画一圈金框 + 标「当前」，
 * 否则 10 张卡片长得一样，玩家点完不知道自己在看哪件。
 */
export function drawEquipmentDetail(
  ctx: CanvasRenderingContext2D,
  s: GameSession,
  focused: SlotId | null = null,
): boolean {
  const equipped = equipmentSummary(s.character);
  if (equipped.length === 0) return false;

  const totalW = COLS * CARD_W + (COLS - 1) * CARD_GAP;
  const totalH = ROWS * CARD_H + (ROWS - 1) * CARD_GAP;
  const baseX = Math.round((960 - totalW) / 2);
  const baseY = Math.round((540 - totalH) / 2) - 10;

  // 全屏压暗：详情是"暂停看数据"的时刻，底下的战斗不该抢注意力
  ctx.fillStyle = 'rgba(5, 7, 11, 0.72)';
  ctx.fillRect(0, 0, 960, 540);

  ctx.textAlign = 'left';
  ctx.font = '13px "Noto Sans SC", sans-serif';
  ctx.fillStyle = '#d4a13c';
  ctx.fillText(`${TERM.item}详情`, baseX, baseY - 10);

  equipped.slice(0, COLS * ROWS).forEach((e, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const cx = baseX + col * (CARD_W + CARD_GAP);
    const cy = baseY + row * (CARD_H + CARD_GAP);
    drawCard(ctx, e.item, cx, cy);
    // 从纸娃娃点进来的那一件：金框 + 「当前」角标
    if (focused !== null && e.slot === focused) {
      ctx.strokeStyle = 'rgba(240, 214, 140, 0.95)';
      ctx.lineWidth = 2;
      ctx.strokeRect(cx + 1, cy + 1, CARD_W - 2, CARD_H - 2);
      ctx.lineWidth = 1;
      ctx.textAlign = 'left';
      ctx.font = '11px "Noto Sans SC", sans-serif';
      ctx.fillStyle = '#f0d68c';
      ctx.fillText('当前', cx + 8, cy + CARD_H - 8);
    }
  });

  ctx.textAlign = 'left';
  ctx.font = '12px "Noto Sans SC", sans-serif';
  // D206：角色属性汇总。
  //
  // 详情面板以前只列 10 件装备的灵纹 —— 玩家想算「我现在多少伤害/破绽/抗性」只能自己
  // 拿纸加；而这是个 build 游戏，看不见的属性等于不存在的属性。
  // 数据直接取 `characterStats`（与战斗同一份，不另算一遍），只做四舍五入显示。
  const st = characterStats(s.character);
  const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;
  const attrY = baseY + totalH + 16;
  ctx.fillStyle = '#9a9184';
  ctx.fillText(
    `气血 ${Math.round(st.life)} · 护体 ${Math.round(st.armor)} · 罡气 ${Math.round(st.shield)} · 真元 ${Math.round(st.mana)} · 出手 ${st.attackSpeed.toFixed(2)}/秒`,
    baseX,
    attrY,
  );
  ctx.fillText(
    `伤害 ${Math.round(st.damage * 100) / 100} · 破绽 ${pct(st.critChance)} 伤害 ×${st.critMulti.toFixed(2)} · 抗性 金 ${pct(st.resMetal)} 火 ${pct(st.resFire)} 水 ${pct(st.resWater)} · 仙缘 +${pct(st.lootRarity)} 机缘 +${pct(st.lootQuantity)}`,
    baseX,
    attrY + 15,
  );
  // 关闭提示挪到标题行右侧：底部两行属性已经占到 532，再往下会画到画面外。
  ctx.textAlign = 'right';
  ctx.fillStyle = '#6d665c';
  ctx.fillText('按 E 关闭', 960 - 14, baseY - 10);
  return true;
}
