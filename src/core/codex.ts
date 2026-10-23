/**
 * 图鉴（收集）—— 纯状态机，不碰渲染 / DOM / 时钟。
 *
 * 为什么要有它（D87 的账）：满级前 ~5h + 段④ 6.2h + 渊痕 3h ≈ 14h，离 GDD 的 24h 还差 ~9h。
 * 补内容的正确做法者是「让已有的东西被记录下来」，而不是再加一套战斗系统 ——
 * 玩家已经打了 15 种浊物、掉过 9 条传奇，但**没有任何地方能看见「我收集到哪了」**。
 *
 * 纪律：
 * - 存档只存 **id 数组**，不存名字/描述/进度百分比（能算出来的一律不入档）。
 * - 读档一律过 `sanitizeCodex`：未知 id 丢掉、重复去掉、顺序按数据表归一。
 *   存档是玩家能改的，脏值不许把面板打崩，也不许让进度超过 100%。
 * - `recordMonsterKill` / `recordLegendary` 在**已收录时返回同一个对象**：
 *   击杀是热路径（每分钟十几次），每次击杀都复制一遍数组没必要。
 */

import { ALL_MONSTERS, getMonster, type MonsterDef } from '../data/monsters';
import { ALL_LEGENDARY_DEFS, DEEP_LEGENDARY_DEFS, getLegendary, type LegendaryDef } from '../data/legendary';
import { ELEMENT_TERM } from '../data/glossary';

export type CodexKind = 'monster' | 'legendary' | 'variant';

export interface CodexState {
  /** 已收录的浊物 id（按 ALL_MONSTERS 顺序） */
  readonly monsters: readonly string[];
  /** 已收录的传奇 id（按 LEGENDARY_DEFS 顺序） */
  readonly legendaries: readonly string[];
  /** 已见过的特殊形态（D160：目前只有 variant = 异变体；独立一行，因为「见过异变体」本身是刻度） */
  readonly variants: readonly string[];
}

const MONSTER_IDS: readonly string[] = ALL_MONSTERS.map((m) => m.id);
const LEGENDARY_IDS: readonly string[] = ALL_LEGENDARY_DEFS.map((l) => l.id);
const MONSTER_SET: ReadonlySet<string> = new Set(MONSTER_IDS);
const LEGENDARY_SET: ReadonlySet<string> = new Set(LEGENDARY_IDS);
const VARIANT_IDS: readonly string[] = ['variant'];
const VARIANT_SET: ReadonlySet<string> = new Set(VARIANT_IDS);

export const CODEX_MONSTER_TOTAL = MONSTER_IDS.length;
export const CODEX_LEGENDARY_TOTAL = LEGENDARY_IDS.length;
export const CODEX_VARIANT_TOTAL = VARIANT_IDS.length;
export const CODEX_TOTAL = CODEX_MONSTER_TOTAL + CODEX_LEGENDARY_TOTAL + CODEX_VARIANT_TOTAL;

export function createCodex(): CodexState {
  return { monsters: [], legendaries: [], variants: [] };
}

/** 把任意来源（存档、调试钩子）的输入洗成合法状态。不抛异常，脏值一律安静丢弃。 */
export function sanitizeCodex(raw: unknown): CodexState {
  const pick = (input: unknown, order: readonly string[], allow: ReadonlySet<string>): string[] => {
    if (!Array.isArray(input)) return [];
    const hit = new Set<string>();
    for (const x of input) {
      if (typeof x === 'string' && allow.has(x)) hit.add(x);
    }
    // 按数据表顺序归一：存档 diff 稳定，面板顺序也不会因为「谁先被杀」而抖动
    return order.filter((id) => hit.has(id));
  };
  const src = (raw ?? {}) as { monsters?: unknown; legendaries?: unknown; variants?: unknown };
  return {
    monsters: pick(src.monsters, MONSTER_IDS, MONSTER_SET),
    legendaries: pick(src.legendaries, LEGENDARY_IDS, LEGENDARY_SET),
    variants: pick(src.variants, VARIANT_IDS, VARIANT_SET),
  };
}

/**
 * 收录一只浊物。没变化时返回原对象（热路径不复制）。
 *
 * D170：`variant` 为真时**同时**解锁「异变体」那一行 —— 这是玩家路径上的唯一入口。
 * 之前只靠 dev 钩子 `recordVariant`，等于「图鉴里有一格玩家永远填不上」（死词条第 8 例，
 * 且形状是「只有测试在消费」：它通过了所有测试，因为测试也走钩子）。
 */
export function recordMonsterKill(codex: CodexState, monsterId: string, variant = false): CodexState {
  const known = MONSTER_SET.has(monsterId);
  const wantMonster = known && !codex.monsters.includes(monsterId);
  const wantVariant = variant === true && codex.variants.length === 0;
  if (!wantMonster && !wantVariant) return codex;
  return {
    monsters: wantMonster
      ? MONSTER_IDS.filter((id) => id === monsterId || codex.monsters.includes(id))
      : codex.monsters,
    legendaries: codex.legendaries,
    variants: wantVariant ? VARIANT_IDS : codex.variants,
  };
}

/** 收录一条传奇（拿到带传奇效果的法宝时调）。 */
export function recordLegendary(codex: CodexState, legendaryId: string): CodexState {
  if (!LEGENDARY_SET.has(legendaryId)) return codex;
  if (codex.legendaries.includes(legendaryId)) return codex;
  return {
    monsters: codex.monsters,
    legendaries: LEGENDARY_IDS.filter((id) => id === legendaryId || codex.legendaries.includes(id)),
    variants: codex.variants,
  };
}

/** 收录「异变体」本身（第一次见到就记，不计数 —— 计数是成就的活） */
export function recordVariant(codex: CodexState): CodexState {
  if (codex.variants.length > 0) return codex;
  return { monsters: codex.monsters, legendaries: codex.legendaries, variants: ['variant'] };
}

export function hasVariant(codex: CodexState): boolean {
  return codex.variants.length > 0;
}

export function hasMonster(codex: CodexState, id: string): boolean {
  return codex.monsters.includes(id);
}

export function hasLegendary(codex: CodexState, id: string): boolean {
  return codex.legendaries.includes(id);
}

export interface CodexSectionProgress {
  readonly got: number;
  readonly total: number;
}

export interface CodexProgress {
  readonly monsters: CodexSectionProgress;
  readonly legendaries: CodexSectionProgress;
  readonly variants: CodexSectionProgress;
  readonly total: CodexSectionProgress;
  /** 0~100 的整数，**向下取整**：99.6% 不许显示成 100% */
  readonly percent: number;
}

export function codexProgress(codex: CodexState): CodexProgress {
  const got = codex.monsters.length + codex.legendaries.length + codex.variants.length;
  return {
    monsters: { got: codex.monsters.length, total: CODEX_MONSTER_TOTAL },
    legendaries: { got: codex.legendaries.length, total: CODEX_LEGENDARY_TOTAL },
    variants: { got: codex.variants.length, total: CODEX_VARIANT_TOTAL },
    total: { got, total: CODEX_TOTAL },
    percent: CODEX_TOTAL ? Math.floor((got / CODEX_TOTAL) * 100) : 0,
  };
}

export interface CodexEntry {
  readonly kind: CodexKind;
  readonly id: string;
  readonly name: string;
  /** 已收录：具体数值/描述；未收录：只给一句「还没见过」，不剧透数值 */
  readonly detail: string;
  readonly unlocked: boolean;
}

function monsterDetail(def: MonsterDef): string {
  const head = def.boss ? '镇守 · ' : '';
  return (
    `${head}${def.tier} 阶 · ${ELEMENT_TERM[def.element]}行 · ` +
    `气血 ×${def.hpMul.toFixed(2)} · 攻伐 ×${def.dmgMul.toFixed(2)} · 护体 ${def.armor}`
  );
}

/**
 * 固定顺序的 24 行（15 浊物 + 9 传奇）。
 *
 * 顺序必须**只由数据表决定**，不能由「解锁先后」决定：
 * 否则同一个存档在自己机器上和朋友机器上行号不同，说「图鉴第 3 行」就指不清。
 */
export function codexEntries(codex: CodexState): CodexEntry[] {
  const out: CodexEntry[] = [];
  for (const id of MONSTER_IDS) {
    const def = getMonster(id);
    if (!def) continue;
    const unlocked = hasMonster(codex, id);
    out.push({ kind: 'monster', id, name: def.name, detail: unlocked ? monsterDetail(def) : '尚未遭遇', unlocked });
  }
  // D160：异变体独立成行（第 31 行）——玩家要知道「有这东西存在」，但不给「见过 N 次」的计数
  out.push({
    kind: 'variant',
    id: 'variant',
    name: '异变体',
    detail: hasVariant(codex)
      ? '深层异变 · 额外 1 条同类妖纹 · 掉落数量 +10%'
      : '尚未遭遇',
    unlocked: hasVariant(codex),
  });
  // D167：深层传奇的 detail 必须两句 ——「层 ≥40 才可掉」+「与基础传奇同时可掉（不是替换）」。
  // 第二句是必须的：不写，玩家会以为层 40 之后只出这 3 条 —— 那正是 D162 修掉的误解。
  const DEEP_SET: ReadonlySet<string> = new Set(DEEP_LEGENDARY_DEFS.map((d) => d.id));
  for (const id of LEGENDARY_IDS) {
    const def = getLegendary(id);
    if (!def) continue;
    const unlocked = hasLegendary(codex, id);
    const body = (def as LegendaryDef).desc;
    const detail = DEEP_SET.has(id)
      ? `${body}　｜　层 ≥40 才可掉；与基础传奇同时可掉（不是替换）`
      : body;
    out.push({ kind: 'legendary', id, name: def.name, detail: unlocked ? detail : '尚未获得', unlocked });
  }
  return out;
}

/** 光标移动：夹取，不环绕（24 行不算长，环绕只会让人按过头） */
export function moveCodexCursor(current: number, dy: number, count: number = CODEX_TOTAL): number {
  // 与成就光标同一条：count 是外部输入，Math.floor(NaN) 仍是 NaN，
  // 会让返回值变 NaN（面板光标画不出来、min/max 全失效）。
  if (!Number.isFinite(count)) return 0;
  const n = Math.max(1, Math.floor(count));
  // 脏光标（NaN/Infinity）直接归 0，而且**不吃这次位移** ——
  // 否则「光标坏了」会被一次按键变成 1，看起来像正常移动，更难查。
  if (!Number.isFinite(current)) return 0;
  const base = Math.floor(current);
  const step = Number.isFinite(dy) ? Math.floor(dy) : 0;
  return Math.min(n - 1, Math.max(0, base + step));
}

/** 收录时的浮动提示文案（「新发现」只在这一刻出现，翻图鉴时不重复播报） */
export function codexUnlockText(kind: CodexKind, name: string): string {
  if (kind === 'monster') return `图鉴：遭遇 ${name}`;
  if (kind === 'variant') return '图鉴：遭遇异变体';
  return `图鉴：获得传奇 ${name}`;
}
