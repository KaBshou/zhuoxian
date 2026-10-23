/**
 * 周天图面板（天赋树）—— 按 T 开关。
 *
 * 为什么必须有这一层：天赋 54 个节点已经在 core 里跑了一个多星期，
 * 但玩家在画面上完全看不见 —— 那和"没有天赋系统"对玩家是同一件事。
 * 同一个原则之前用在灵纹（法宝详情面板）和渊痕（HUD 那行）上。
 *
 * 纪律：只读 session，绝不改。分配走 `talents-runtime.ts` 的纯函数。
 */
import type { GameSession } from '../core/session';
import { TALENT_NODES, getTalent } from '../data/talents';
import type { TalentNode } from '../data/talent-def';
import {
  canAllocate,
  spentIds,
  talentPointsAvailable,
  talentPointsSpent,
} from '../core/talents-runtime';

const C = {
  panel: 'rgba(11, 10, 12, 0.9)',
  edge: 'rgba(140, 165, 200, 0.22)',
  text: '#d8d3c4',
  dim: '#6d665c',
  gold: '#d4a13c',
  teal: '#4fd1c5',
  purple: '#6b3fa0',
  off: 'rgba(70, 64, 56, 0.55)',
};

/** 线路显示顺序与中文名（主干先，支线后 —— 玩家先看保底再看取舍） */
const LINES: readonly { prefix: string; label: string; branch: boolean }[] = [
  { prefix: 't-life', label: '气血', branch: false },
  { prefix: 't-dmg', label: '攻伐', branch: false },
  { prefix: 't-armor', label: '护体', branch: false },
  { prefix: 't-mana', label: '真元', branch: false },
  { prefix: 't-xp', label: '机缘', branch: false },
  { prefix: 't-loot', label: '拾取', branch: false },
  { prefix: 'b-sword', label: '剑修', branch: true },
  { prefix: 'b-turtle', label: '龟息', branch: true },
  { prefix: 'b-turbid', label: '浊脉', branch: true },
  { prefix: 'b-foot', label: '身法', branch: true },
  { prefix: 'b-gold', label: '财脉', branch: true },
];

/** 按 id 前缀把节点归到线上（节点 id 形如 t-life-1 / b-sword-3） */
function nodesOfLine(prefix: string): TalentNode[] {
  return TALENT_NODES.filter((n) => n.id.startsWith(prefix + '-')).sort((a, b) => a.id.localeCompare(b.id));
}

const CELL = 26;
const CELL_GAP = 6;
const ROW_H = 30;
const PANEL_W = 640;

export interface TalentPanelResult {
  readonly drawn: boolean;
}

/**
 * 画周天图。返回是否画了（false = 数据为空，调用方不用管）。
 * 面板铺在画面正中，遮住战斗区域 —— 它是"暂停看一眼"的界面，不是常驻 HUD。
 */
export function drawTalentPanel(ctx: CanvasRenderingContext2D, s: GameSession): TalentPanelResult {
  if (TALENT_NODES.length === 0) return { drawn: false };

  const spent = new Set(spentIds(s.character));
  const avail = talentPointsAvailable(s.character, s.firstClearedFloors.length);
  const used = talentPointsSpent(s.character);

  const rows = LINES.length;
  const panelH = 78 + rows * ROW_H + 24;
  const x = (960 - PANEL_W) / 2;
  const y = Math.max(24, (540 - panelH) / 2);

  // 遮罩：面板下面的一切都按"暂停"读
  ctx.fillStyle = 'rgba(5, 7, 11, 0.72)';
  ctx.fillRect(0, 0, 960, 540);

  ctx.fillStyle = C.panel;
  ctx.fillRect(x, y, PANEL_W, panelH);
  ctx.strokeStyle = C.edge;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, PANEL_W - 1, panelH - 1);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 14px "Noto Sans SC", system-ui, sans-serif';
  ctx.fillStyle = C.text;
  ctx.fillText('周天图（按 T 关闭）', x + 16, y + 22);

  ctx.font = '12px "Noto Sans SC", system-ui, sans-serif';
  ctx.fillStyle = avail > 0 ? C.gold : C.dim;
  ctx.fillText(`已点 ${used} 点　可用 ${avail} 点`, x + 16, y + 44);

  ctx.fillStyle = C.dim;
  ctx.font = '11px "Noto Sans SC", system-ui, sans-serif';
  ctx.fillText('实心=已点　青框=可点　灰=前置未点', x + 250, y + 44);

  let ry = y + 66;
  for (const line of LINES) {
    const nodes = nodesOfLine(line.prefix);
    if (nodes.length === 0) continue;

    ctx.textAlign = 'left';
    ctx.font = '12px "Noto Sans SC", system-ui, sans-serif';
    ctx.fillStyle = line.branch ? C.purple : C.text;
    ctx.fillText(line.label, x + 16, ry + CELL / 2 + 1);

    let cx = x + 76;
    for (const node of nodes) {
      const isSpent = spent.has(node.id);
      const can = canAllocate(s.character, node.id, s.firstClearedFloors.length).ok;

      // 格子：已点是仙金实心，可点是青色描边，都不是则是暗块
      if (isSpent) {
        ctx.fillStyle = node.kind === 'switch' ? C.purple : C.gold;
        ctx.fillRect(cx, ry, CELL, CELL);
        // 开关节点打个点，和数值节点区分开（它是"玩法开关"不是数值）
        if (node.kind === 'switch') {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
          ctx.fillRect(cx + CELL / 2 - 2, ry + CELL / 2 - 2, 4, 4);
        }
      } else {
        ctx.fillStyle = C.off;
        ctx.fillRect(cx, ry, CELL, CELL);
        ctx.strokeStyle = can ? C.teal : 'rgba(140, 165, 200, 0.18)';
        ctx.lineWidth = can ? 1.5 : 1;
        ctx.strokeRect(cx + 0.5, ry + 0.5, CELL - 1, CELL - 1);
      }

      // 格子里写节点名前两个字，鼠标没 hover 也能认出来
      ctx.textAlign = 'center';
      ctx.font = '11px "Noto Sans SC", system-ui, sans-serif';
      ctx.fillStyle = isSpent ? 'rgba(10, 8, 6, 0.9)' : can ? C.teal : C.dim;
      ctx.fillText(node.name.slice(0, 1), cx + CELL / 2, ry + CELL / 2 + 1);

      cx += CELL + CELL_GAP;
    }

    // 线路末尾一行小结：点数 / 是否已通关键节点
    const total = nodes.reduce((a, n) => a + n.cost, 0);
    const got = nodes.filter((n) => spent.has(n.id)).reduce((a, n) => a + n.cost, 0);
    ctx.textAlign = 'right';
    ctx.font = '11px "Noto Sans SC", system-ui, sans-serif';
    ctx.fillStyle = got > 0 ? C.text : C.dim;
    ctx.fillText(`${got}/${total}`, x + PANEL_W - 16, ry + CELL / 2 + 1);

    ry += ROW_H;
  }

  // 底部一行：下一个可点节点的详细说明（玩家最需要的那句"点了会怎样"）
  const nextNode = TALENT_NODES.find((n) => !spent.has(n.id) && canAllocate(s.character, n.id, s.firstClearedFloors.length).ok);
  ctx.textAlign = 'left';
  ctx.font = '11px "Noto Sans SC", system-ui, sans-serif';
  if (nextNode) {
    ctx.fillStyle = C.teal;
    ctx.fillText(`下一个可点：${nextNode.name} —— ${nextNode.desc}`, x + 16, ry + 8);
  } else if (avail > 0) {
    ctx.fillStyle = C.dim;
    ctx.fillText('有可用点数，但前置节点还没点（按顺序点完一条线才能进下一条）', x + 16, ry + 8);
  } else {
    ctx.fillStyle = C.dim;
    ctx.fillText('暂时没有可用点数：每提升一重境界 +1 点，每层首次通关再 +2 点', x + 16, ry + 8);
  }

  // 让「这条线为什么值得点」有出口：把已点最多的支线名报出来
  let bestLine = '';
  let bestCount = 0;
  for (const line of LINES.filter((l) => l.branch)) {
    const cnt = nodesOfLine(line.prefix).filter((n) => spent.has(n.id)).length;
    if (cnt > bestCount) {
      bestCount = cnt;
      bestLine = line.label;
    }
  }
  if (bestLine) {
    ctx.textAlign = 'right';
    ctx.fillStyle = C.purple;
    ctx.fillText(`主修：${bestLine}`, x + PANEL_W - 16, ry + 8);
  }

  ctx.textBaseline = 'alphabetic';
  return { drawn: true };
}

/** 给测试/探针用：某条线有几个节点（防止 LINES 表和 TALENT_NODES 脱节） */
export function talentLineCounts(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const line of LINES) out[line.label] = nodesOfLine(line.prefix).length;
  return out;
}

/** 未归入任何线路的节点 id（数据加错线时测试会喊） */
export function orphanTalentIds(): string[] {
  return TALENT_NODES.filter((n) => !LINES.some((l) => n.id.startsWith(l.prefix + '-'))).map((n) => n.id);
}

export { getTalent };
