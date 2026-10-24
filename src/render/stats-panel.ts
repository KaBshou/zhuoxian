import { ACHIEVEMENT_TOTAL } from '../data/achievements';
import { CODEX_TOTAL } from '../core/codex';
import { achievementSummary } from '../core/achievement';
import { equipmentSummary, itemPower } from '../core/inventory';
import { TOTAL_STEPS, STAGES_PER_REALM, xpForStep } from '../core/progression';
import { formatRealm } from '../data/glossary';
import { MAX_FLOOR, tierOfFloor, floorOfTier } from '../data/monsters';
import { BOSS_EVERY } from '../core/session';
import type { GameSession } from '../core/session';

/**
 * D200 统计面板：把「已经发生的事」摆出来。
 *
 * 挂机刷宝游戏里数字本身就是内容 —— 玩家会想知道「我杀了多少」「我玩了多久」
 * 「一共拿到多少渊痕」。这些数据全都已经在 `GameSession` 里，只是没有一处显示。
 *
 * 纪律（与本项目既有约定一致）：
 * - **只读**：绝不改 `session`，也绝不消耗 rng（D199 立的规矩：纯显示量必须可复现）。
 * - **分母来自数据表**（`CODEX_TOTAL` / `ACHIEVEMENT_TOTAL` / `MAX_FLOOR` / `TOTAL_STEPS`），
 *   不写死数字 —— 帮助面板栽过一次（D196）。
 * - **没有的数据不编**：游玩时长只统计本进程内的时间（`playedSeconds`），
 *   不做「估算总游玩时长」这种假装精确的事。
 */

const C = {
  shadow: 'rgba(5,7,11,0.72)',
  panel: 'rgba(11,10,12,0.94)',
  edge: 'rgba(140,165,200,0.22)',
  gold: 'rgba(212,161,60,0.85)',
  title: '#d8d3c4',
  section: '#c9a86a',
  label: '#8a8272',
  value: '#e8e2d4',
  dim: '#6d665c',
};

export const STATS_PANEL_W = 620;
const PAD = 18;
const TITLE_H = 34;
const ROW_H = 19;
const SECTION_GAP = 10;

export interface StatRow {
  readonly label: string;
  readonly value: string;
  readonly tone?: 'value' | 'dim' | 'gold';
}

export interface StatSection {
  readonly title: string;
  readonly rows: readonly StatRow[];
}

/** 把秒数写成「1 小时 23 分」；少于 1 分钟写秒。 */
export function durationText(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0 秒';
  const s = Math.floor(seconds);
  if (s < 60) return `${s} 秒`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} 分 ${s % 60} 秒`;
  const h = Math.floor(m / 60);
  return `${h} 小时 ${m % 60} 分`;
}

/** 每小时的渊痕产出（本局速率，来自 playedSeconds；不足 1 分钟返 0 免得爆表）。 */
export function marksPerHour(s: GameSession): number {
  const sec = s.playedSeconds ?? 0;
  if (!Number.isFinite(sec) || sec < 60) return 0;
  const total = s.character.marks ?? 0;
  return Math.round((total * 3600) / sec);
}

/** 距离满级还差多少修为（满级返 0）。 */
export function xpToMax(s: GameSession): number {
  const step = s.character.step;
  if (!Number.isFinite(step) || step >= TOTAL_STEPS - 1) return 0;
  let need = 0;
  for (let i = Math.max(0, Math.floor(step)); i < TOTAL_STEPS - 1; i += 1) {
    need += xpForStep(i) - (i === Math.floor(step) ? s.character.xp : 0);
  }
  return Math.max(0, Math.round(need));
}

/**
 * 三组数据。分组的理由：玩家问的是三个不同问题 ——
 * 「这一把怎么样」「我一共干了多少」「我还差什么」。
 */
export function statsSections(s: GameSession): readonly StatSection[] {
  const ch = s.character;
  const step = Number.isFinite(ch.step) ? ch.step : 0;
  const realm = Math.floor(step / STAGES_PER_REALM) + 1;
  const codex = s.codex;
  const codexGot = (codex?.monsters.length ?? 0) + (codex?.legendaries.length ?? 0) + (codex?.variants.length ?? 0);
  const ach = achievementSummary(s.achievements);
  const equipped = equipmentSummary(ch);
  const bestPower = equipped.length === 0 ? 0 : Math.max(...equipped.map((e) => itemPower(e.item)));
  const toMax = xpToMax(s);

  return [
    {
      title: '本局',
      rows: [
        { label: '境界', value: `${formatRealm(step)}（第 ${realm} / ${Math.ceil(TOTAL_STEPS / STAGES_PER_REALM)} 境）` },
        { label: '台阶', value: `${Math.min(step + 1, TOTAL_STEPS)} / ${TOTAL_STEPS} 重` },
        { label: '距满级', value: toMax === 0 ? '已满级' : `${toMax.toLocaleString('en-US')} 修为`, tone: toMax === 0 ? 'gold' : 'value' },
        { label: '所在', value: `第 ${s.floor} 层 · 第 ${s.wave} 波（每 ${BOSS_EVERY} 波镇守）` },
        { label: '本层击杀', value: `${s.floorKills} 只` },
        { label: '游玩时长', value: durationText(s.playedSeconds) },
        { label: '渊痕/小时', value: (s.character.marks ?? 0) > 0 ? `${marksPerHour(s).toLocaleString('en-US')}（本局均值）` : '满级后才有' },
      ],
    },
    {
      title: '累计',
      rows: [
        { label: '击杀浊物', value: `${s.kills.toLocaleString('en-US')} 只` },
        { label: '死亡', value: `${s.deaths} 次` },
        { label: '脱困（连死退层）', value: `${s.escapeValveCount ?? 0} 次` },
        { label: '掷骰掉落', value: `${s.dropsFound.toLocaleString('en-US')} 次` },
        { label: '累计仙品', value: `${s.xianFound ?? 0} 件` },
        { label: '周目', value: s.cycle > 0 ? `第 ${s.cycle} 周目（气血 ×${Math.pow(1.35, s.cycle).toFixed(2)}）` : '初临' },
        { label: '最深抵达', value: `第 ${s.maxFloorReached} / ${MAX_FLOOR} 层` },
        { label: '已通关层', value: `${s.firstClearedFloors.length} 层 · 当前${tierOfFloor(s.floor) === 1 ? '一' : tierOfFloor(s.floor) === 2 ? '二' : '三'}阶（第 ${floorOfTier(tierOfFloor(s.floor))} 层起）` },
        { label: '囊中', value: `黄阶 ${s.pocket.huang}　灭灵 ${s.pocket.mie}　洗灵 ${s.pocket.xi}　玉简 ${s.gemPouch}` },
      ],
    },
    {
      title: '收集',
      rows: [
        { label: '图鉴', value: `${codexGot} / ${CODEX_TOTAL} 行` },
        {
          label: '　浊物',
          value: `${codex?.monsters.length ?? 0} / 18`,
          tone: 'dim',
        },
        { label: '　传奇', value: `${codex?.legendaries.length ?? 0} / 12`, tone: 'dim' },
        { label: '　异变体', value: (codex?.variants.length ?? 0) > 0 ? '已收录' : '未遭遇', tone: 'dim' },
        { label: '成就', value: `${ach.got} / ${ACHIEVEMENT_TOTAL} 条` },
        { label: '最强法宝', value: bestPower > 0 ? `战力 ${Math.round(bestPower)}` : '无' },
        { label: '已穿部位', value: `${equipped.length} / 10` },
      ],
    },
  ];
}

/** 面板高度：三段标题 + 各段行 + 段间距 + 标题 + 上下 pad。 */
export function statsPanelHeight(s: GameSession): number {
  const sections = statsSections(s);
  const rows = sections.reduce((n, sec) => n + 1 + sec.rows.length, 0);
  return TITLE_H + PAD + rows * ROW_H + sections.length * SECTION_GAP + PAD;
}

export function statsPanelGeometry(canvasW: number, canvasH: number, s: GameSession): { x: number; y: number; w: number; h: number } {
  const h = Math.min(canvasH - 24, statsPanelHeight(s));
  const w = Math.min(canvasW - 24, STATS_PANEL_W);
  return { x: Math.round((canvasW - w) / 2), y: Math.round((canvasH - h) / 2), w, h };
}

export function drawStatsPanel(
  ctx: CanvasRenderingContext2D,
  s: GameSession,
  canvasW: number,
  canvasH: number,
): { x: number; y: number; w: number; h: number } {
  const geo = statsPanelGeometry(canvasW, canvasH, s);
  const sections = statsSections(s);

  ctx.fillStyle = C.shadow;
  ctx.fillRect(0, 0, canvasW, canvasH);

  ctx.fillStyle = C.panel;
  ctx.fillRect(geo.x, geo.y, geo.w, geo.h);
  ctx.strokeStyle = C.edge;
  ctx.lineWidth = 1;
  ctx.strokeRect(geo.x + 0.5, geo.y + 0.5, geo.w - 1, geo.h - 1);

  // 左缘金条：结构像素，探针靠它判「面板画出来了」（D190 的教训：0.45 太暗数不到）
  ctx.fillStyle = C.gold;
  ctx.fillRect(geo.x, geo.y, 3, geo.h);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.title;
  ctx.font = '15px "Noto Sans SC","Microsoft YaHei",sans-serif';
  ctx.fillText('统计', geo.x + PAD, geo.y + 24);

  let y = geo.y + TITLE_H + PAD;
  for (const sec of sections) {
    ctx.fillStyle = C.section;
    ctx.font = '12px "Noto Sans SC","Microsoft YaHei",sans-serif';
    ctx.fillText(sec.title, geo.x + PAD, y + 12);
    y += ROW_H;

    for (const row of sec.rows) {
      ctx.fillStyle = C.label;
      ctx.font = '12px "Noto Sans SC","Microsoft YaHei",sans-serif';
      ctx.fillText(row.label, geo.x + PAD, y + 13);
      ctx.fillStyle = row.tone === 'gold' ? C.section : row.tone === 'dim' ? C.dim : C.value;
      ctx.fillText(row.value, geo.x + PAD + 132, y + 13);
      y += ROW_H;
    }
    y += SECTION_GAP;
  }

  ctx.fillStyle = C.dim;
  ctx.font = '11px "Noto Sans SC","Microsoft YaHei",sans-serif';
  ctx.fillText('Y / Esc 关闭　·　时长只算本次运行（不做假装精确的累计估算）', geo.x + PAD, geo.y + geo.h - PAD);
  return geo;
}
