/**
 * 成就状态机（纯函数）：只存「已达成哪些 id」，进度全靠事实现算。
 *
 * 为什么只存 id（与图鉴 `core/codex.ts` 同一条存档铁律）：
 * 名字/描述/阈值/奖励都在 `data/achievements.ts`。若把 name/target 也存进档，
 * 将来重标阈值时老档会带着「当时的目标」和「现在的进度」两套口径 ——
 * idle-grim 的 `xpNext` 就是这么坏的（M18 改曲线后老档永不生效）。
 */

import {
  ACHIEVEMENT_DEFS,
  ACHIEVEMENT_REWARD_TOTAL,
  ACHIEVEMENT_TOTAL,
  type AchievementDef,
  type AchievementFacts,
} from '../data/achievements';

export interface AchievementState {
  /** 已达成的成就 id（顺序不保证；渲染时按数据表顺序取） */
  readonly unlocked: readonly string[];
}

export interface AchievementEntry {
  readonly id: string;
  readonly name: string;
  readonly desc: string;
  /** 当前进度（已夹到 [0, target]） */
  readonly progress: number;
  readonly target: number;
  readonly unlocked: boolean;
  readonly reward: number;
}

export interface AchievementSummary {
  readonly got: number;
  readonly total: number;
  readonly percent: number;
  readonly rewardsEarned: number;
  readonly rewardsTotal: number;
}

const IDS = new Set(ACHIEVEMENT_DEFS.map((a) => a.id));

export function createAchievements(): AchievementState {
  return { unlocked: [] };
}

/**
 * 洗一份存档里的成就（存档是玩家能改的：未知 id / 重复 / 非字符串一律安静丢掉）。
 *
 * 返回顺序按数据表固定 —— 这样「已达成列表」的 JSON 输出也是确定的，
 * 探针与存档 diff 不会因为插入顺序抖动。
 */
export function sanitizeAchievements(raw: unknown): AchievementState {
  const list = (raw as { unlocked?: unknown } | null | undefined)?.unlocked;
  if (!Array.isArray(list)) return createAchievements();
  const seen = new Set<string>();
  for (const id of list) {
    if (typeof id === 'string' && IDS.has(id)) seen.add(id);
  }
  return {
    unlocked: ACHIEVEMENT_DEFS.filter((a) => seen.has(a.id)).map((a) => a.id),
  };
}

export function hasAchievement(state: AchievementState, id: string): boolean {
  return state.unlocked.includes(id);
}

/** 全部条目（固定顺序，未达成的也在里面 —— 面板要显示「差多少」） */
export function achievementEntries(state: AchievementState, facts: AchievementFacts): readonly AchievementEntry[] {
  const got = new Set(state.unlocked);
  return ACHIEVEMENT_DEFS.map((def) => {
    const raw = def.progress(facts);
    const progress = Number.isFinite(raw) ? Math.max(0, Math.min(Math.floor(raw), def.target)) : 0;
    return {
      id: def.id,
      name: def.name,
      desc: def.desc,
      progress,
      target: def.target,
      unlocked: got.has(def.id),
      reward: def.reward,
    };
  });
}

/** 本次事实下**新达成**的成就（不含已达成），按数据表顺序 */
export function newlyUnlocked(state: AchievementState, facts: AchievementFacts): readonly AchievementDef[] {
  const got = new Set(state.unlocked);
  return ACHIEVEMENT_DEFS.filter((def) => {
    if (got.has(def.id)) return false;
    const p = def.progress(facts);
    return Number.isFinite(p) && p >= def.target;
  });
}

/**
 * 结算一次：返回新状态 + 本次新达成的条目。
 *
 * 没有新达成时**返回原对象引用**（热路径每秒都在调，不能每次都造新数组）。
 */
export function unlockAchievements(
  state: AchievementState,
  facts: AchievementFacts,
): { readonly state: AchievementState; readonly unlocked: readonly AchievementDef[] } {
  const fresh = newlyUnlocked(state, facts);
  if (fresh.length === 0) return { state, unlocked: [] };
  return {
    state: { unlocked: [...state.unlocked, ...fresh.map((d) => d.id)] },
    unlocked: fresh,
  };
}

export function achievementSummary(state: AchievementState): AchievementSummary {
  const got = state.unlocked.length;
  const rewardsEarned = ACHIEVEMENT_DEFS.reduce((sum, a) => sum + (state.unlocked.includes(a.id) ? a.reward : 0), 0);
  return {
    got,
    total: ACHIEVEMENT_TOTAL,
    percent: ACHIEVEMENT_TOTAL === 0 ? 0 : Math.floor((got / ACHIEVEMENT_TOTAL) * 100),
    rewardsEarned,
    rewardsTotal: ACHIEVEMENT_REWARD_TOTAL,
  };
}

/** 新达成时播报用的一句话（面板/日志/浮字共用，别各写一遍） */
export function achievementUnlockText(def: AchievementDef): string {
  return `成就 · ${def.name}　+${def.reward} 渊痕`;
}

/** 光标移动：夹取不环绕；非有限数归 0 且不吃这次位移（与图鉴同规则） */
export function moveAchievementCursor(current: number, dy: number, count: number = ACHIEVEMENT_TOTAL): number {
  if (!Number.isFinite(current) || !Number.isFinite(dy)) return 0;
  // count 也是外部输入（测试/探针会传脏值）。Math.floor(NaN) 仍是 NaN，
  // 会一路穿到返回值 → 面板光标变 NaN、`min/max` 全部失效。先挡住。
  if (!Number.isFinite(count)) return 0;
  const n = Math.max(0, Math.floor(count));
  if (n === 0) return 0;
  const base = Math.max(0, Math.min(Math.floor(current), n - 1));
  return Math.max(0, Math.min(base + Math.floor(dy), n - 1));
}

export function achievementProgressText(summary: AchievementSummary): string {
  return `${summary.got} / ${summary.total}（${summary.percent}%）`;
}
