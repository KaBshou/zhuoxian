// ────────────────────────────────────────────────────────────
// 周天图 —— 运行时（点数账本、能不能点、点了给什么）
// ────────────────────────────────────────────────────────────
//
// 【纪律】
// - 存档只存「点了哪些节点 id」+「还剩多少点」；
//   点数收入（每重 +1 / 每层首通 +2）由调用方发放，这里只管支出。
//   「能从别的字段算出来的一律不入档」：点数收入不存，只存余额。
// - talentModifiers 是唯一把天赋变成 Modifier 的出口，
//   characterModifiers（character.ts）调用它 —— 全游戏仍然只有一个聚合函数。
// - 开关节点不产生 Modifier，运行时（battle/session）用 hasSwitch(ch, id) 查询。
import type { Modifier } from './modifier';
import { mod } from './modifier';
import type { CharacterState } from './character';
import { getTalent, TALENT_NODES, KNOWN_SWITCH_IDS } from '../data/talents';

/** 天赋点收入：每突破一重 +1 */
export const TALENT_POINTS_PER_STEP = 1;
/** 天赋点收入：每层首通 +2 */
export const TALENT_POINTS_PER_FLOOR_FIRST_CLEAR = 2;

/** 天赋点总收入的纯函数（不入档，余额 = 收入 - 已花） */
export function talentPointsEarned(step: number, firstClearedFloors: number): number {
  const s = Math.max(0, Math.min(80, Math.floor(step) || 0));
  const f = Math.max(0, Math.floor(firstClearedFloors) || 0);
  return s * TALENT_POINTS_PER_STEP + f * TALENT_POINTS_PER_FLOOR_FIRST_CLEAR;
}

/** 已点节点（从存档的 CharacterState 读；字段见 talentPoints 注释） */
export function spentIds(ch: CharacterState): readonly string[] {
  return ch.talentIds ?? [];
}

/** 已花的点数 */
export function talentPointsSpent(ch: CharacterState): number {
  let n = 0;
  for (const id of spentIds(ch)) {
    const t = getTalent(id);
    if (t) n += t.cost; // 存档里的未知 id 不计钱（防御老档/改表）
  }
  return n;
}

/** 当前可用点数 = 收入 - 已花 */
export function talentPointsAvailable(ch: CharacterState, firstClearedFloors: number): number {
  return Math.max(0, talentPointsEarned(ch.step, firstClearedFloors) - talentPointsSpent(ch));
}

/**
 * 能不能点这个节点：
 * 1. 节点存在且还没点
 * 2. 前置全部已点
 * 3. 有足够的可用点数
 */
export function canAllocate(ch: CharacterState, id: string, firstClearedFloors: number): { ok: boolean; reason: string } {
  const t = getTalent(id);
  if (!t) return { ok: false, reason: '没有这个节点' };
  if (spentIds(ch).includes(id)) return { ok: false, reason: '已经点过了' };
  for (const r of t.requires) {
    if (!spentIds(ch).includes(r)) return { ok: false, reason: '前置未点亮' };
  }
  if (talentPointsAvailable(ch, firstClearedFloors) < t.cost) return { ok: false, reason: '点数不足' };
  return { ok: true, reason: '' };
}

/** 点一个节点（不可变：返回新 CharacterState） */
export function allocateTalent(ch: CharacterState, id: string, firstClearedFloors: number): { character: CharacterState; ok: boolean; reason: string } {
  const check = canAllocate(ch, id, firstClearedFloors);
  if (!check.ok) return { character: ch, ok: false, reason: check.reason };
  return {
    character: { ...ch, talentIds: [...spentIds(ch), id] },
    ok: true,
    reason: '',
  };
}

/**
 * 天赋提供的全部 Modifier（source.kind='talent'，label='周天图'）。
 * characterModifiers 的调用点 —— 别处不许再拼天赋加成。
 */
export function talentModifiers(ch: CharacterState): Modifier[] {
  const out: Modifier[] = [];
  for (const id of spentIds(ch)) {
    const t = getTalent(id);
    if (t?.kind === 'stat' && t.mods) out.push(...t.mods);
  }
  return out;
}

/** 开关是否点亮（battle/session 查询；未知 id 一律 false） */
export function hasSwitch(ch: CharacterState, switchId: string): boolean {
  if (!KNOWN_SWITCH_IDS.includes(switchId)) return false;
  for (const id of spentIds(ch)) {
    const t = getTalent(id);
    if (t?.kind === 'switch' && t.switchId === switchId) return true;
  }
  return false;
}

/** 点亮的开关节点 id 列表（UI 显示用） */
export function activeSwitches(ch: CharacterState): string[] {
  const out: string[] = [];
  for (const id of spentIds(ch)) {
    const t = getTalent(id);
    if (t?.kind === 'switch' && t.switchId) out.push(t.switchId);
  }
  return out;
}

/** 便捷构造（测试/工具用）：带天赋字段的角色片段 */
export function withTalents(ch: CharacterState, talentIds: string[]): CharacterState {
  return { ...ch, talentIds: [...talentIds] };
}

// 说明：CharacterState.talentIds?: string[] 定义在 character.ts（可选字段，
// 老档没有也能读）。这里 import 仅为类型，避免循环依赖不放实现。
export const _TALENT_NODE_COUNT = TALENT_NODES.length;
export { mod };

// ────────────────────────────────────────────────────────────
// 开关节点 → 运行时覆盖值（唯一出处）
// ────────────────────────────────────────────────────────────
//
// 开关不走 Modifier（它们改的是系统常量，不是属性），所以战斗层
// 通过 createBattle 的可选参数拿到覆盖值；session 用同一份接管
// 波末回气与拾取延迟。数值依据：talents.ts 各开关节点的 desc。

/** 六个开关节点的运行时效果（D82：原来的 speed-demon 占位改成 resist-cap-plus） */
export interface TalentSwitchOverrides {
  /** turbid-boom-plus：爆发期伤害加成 0.5 → 0.75 */
  turbidBoomBonus?: number;
  /** turbid-extend：爆发时长 5s → 6s */
  corruptionDuration?: number;
  /** wave-regen-plus：波末回气 0.25 → 0.35 */
  waveEndRegen?: number;
  /** resist-cap-plus：五行抗性上限 0.75 → 0.80（D82：身法支线身份从「跑得快」改「抗得住」） */
  resistCapBonus?: number;
  /** fast-pickup：拾取延迟 0.9s → 0.45s */
  pickupDelay?: number;
}

export function switchOverridesFor(talentIds: readonly string[]): TalentSwitchOverrides {
  const o: TalentSwitchOverrides = {};
  if (talentIds.includes('turbid-boom-plus')) o.turbidBoomBonus = 0.75;
  if (talentIds.includes('turbid-extend')) o.corruptionDuration = 6;
  if (talentIds.includes('wave-regen-plus')) o.waveEndRegen = 0.35;
  if (talentIds.includes('fast-pickup')) o.pickupDelay = 0.45;
  if (talentIds.includes('resist-cap-plus')) o.resistCapBonus = 0.05;
  return o;
}
