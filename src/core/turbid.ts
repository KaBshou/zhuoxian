/**
 * 浊气系统 —— 本作的招牌机制，「越强越脏」的唯一载体。
 *
 * 设定：主角灵根被九幽浊丹烧毁，长出畸形「浊脉」，能炼浊气为修为。
 * 打得越久，浊气越重：**伤害越来越高，但回复越来越低**。
 * 满值触发「浊化」爆发，爆发结束进入「虚弱」。
 *
 * 为什么它必须是 P0：如果砍掉，本作就只是「流放之路换了修仙皮」，
 * 玩家一眼看得出。它同时也是一个**真正的决策点** —— 放置游戏最大的病是
 * 「玩家没有决策」，浊气给了他一个每分钟都要做的判断：**还能不能再打一会儿**。
 *
 * 设计纪律：
 * - 纯函数 + 一个极小的状态对象，这样离线收益可以按秒模拟 8 小时。
 * - 所有倍率都是「外部倍率」，通过 `DamageInput.externalMore` 进伤害管线，
 *   绝不在这里直接改属性 —— 否则面板显示和实战会不一致。
 */

/** 浊气满值 */
export const TURBID_MAX = 100;

/** 满浊时的伤害加成上限（+50%） */
export const TURBID_DAMAGE_BONUS = 0.5;
/** 满浊时的回复惩罚上限（-40%） */
export const TURBID_REGEN_PENALTY = 0.4;

/** 「浊化」爆发持续时间（秒） */
export const CORRUPTION_DURATION = 5;
/** 浊化期间的伤害倍率 */
export const CORRUPTION_DAMAGE_MUL = 2.0;
/** 浊化结束后「虚弱」持续时间（秒） */
export const WEAKNESS_DURATION = 4;
/** 虚弱期间受到的伤害倍率 */
export const WEAKNESS_TAKEN_MUL = 1.3;
/** 虚弱期间的伤害倍率 */
export const WEAKNESS_DAMAGE_MUL = 0.6;

/** 浊气阶段 */
export type TurbidPhase = 'calm' | 'corrupting' | 'weak';

export interface TurbidState {
  /** 0 ~ TURBID_MAX */
  value: number;
  phase: TurbidPhase;
  /** 当前阶段剩余秒数（calm 时为 0） */
  phaseLeft: number;
}

export function createTurbid(): TurbidState {
  return { value: 0, phase: 'calm', phaseLeft: 0 };
}

/** 浊气值 → 伤害倍率（1.0 ~ 1.5） */
export function turbidDamageMul(value: number, opts?: { damageBonus?: number }): number {
  const t = clamp01(value / TURBID_MAX);
  return 1 + t * (opts?.damageBonus ?? TURBID_DAMAGE_BONUS);
}

/** 浊气值 → 回复（治疗/回气）倍率（1.0 ~ 0.6） */
export function turbidRegenMul(value: number): number {
  const t = clamp01(value / TURBID_MAX);
  return 1 - t * TURBID_REGEN_PENALTY;
}

/**
 * 综合倍率：把「浊气值」和「当前阶段」合起来算。
 *
 * 这是**唯一**应该被塞进伤害管线的浊气倍率来源。
 * 面板显示「当前伤害 ×1.32」也用这个，所以玩家的计算器不会骗人。
 */
export function turbidMultiplier(
  state: TurbidState,
  opts?: { damageBonus?: number },
): number {
  const base = turbidDamageMul(state.value, opts);
  switch (state.phase) {
    case 'corrupting':
      return base * CORRUPTION_DAMAGE_MUL;
    case 'weak':
      return base * WEAKNESS_DAMAGE_MUL;
    default:
      return base;
  }
}

/** 玩家受到伤害时的倍率（浊化期间不减伤，虚弱期间被打得更疼） */
export function turbidTakenMultiplier(state: TurbidState): number {
  return state.phase === 'weak' ? WEAKNESS_TAKEN_MUL : 1;
}

/** 玩家回复时的倍率（浊气越高回得越少，虚弱期间额外再砍一半） */
export function turbidHealMultiplier(state: TurbidState): number {
  const base = turbidRegenMul(state.value);
  return state.phase === 'weak' ? base * 0.5 : base;
}

/**
 * 推进浊气状态机。
 *
 * @param state  当前状态（本函数会**修改并返回同一个对象**，调用方不要依赖不可变性）
 * @param dt     经过的秒数
 * @param gained 本次消除了多少浊气（击杀怪物获得；由战斗层算好后传入）
 */
export function tickTurbid(
  state: TurbidState,
  dt: number,
  gained = 0,
  opts?: { corruptionDuration?: number },
): TurbidState {
  if (!Number.isFinite(dt) || dt <= 0) return state;

  // 阶段倒计时优先
  if (state.phase !== 'calm') {
    state.phaseLeft -= dt;
    if (state.phaseLeft <= 0) {
      if (state.phase === 'corrupting') {
        // 浊化结束 → 虚弱，浊气清空
        state.phase = 'weak';
        state.phaseLeft = WEAKNESS_DURATION;
        state.value = 0;
      } else {
        state.phase = 'calm';
        state.phaseLeft = 0;
      }
    }
    return state;
  }

  // 平静期：先累加新浊气，**再**扣自然消散。
  //
  // 顺序不能反。反了会出现「刚好攒满 100 却不爆发」：
  // 先扣 decay（100 - 0.15 = 99.85）再判满值，永远差一点点，
  // 玩家看着满格浊气条却什么也没发生 —— 这是最让人怀疑"游戏坏了"的那种 bug。
  // 规矩：**玩家刚打出来的那一下，不能被背景过程吃掉**。
  const v = state.value + gained;
  if (v >= TURBID_MAX) {
    state.value = TURBID_MAX;
    state.phase = 'corrupting';
    state.phaseLeft = opts?.corruptionDuration ?? CORRUPTION_DURATION;
    return state;
  }

  const decay = 1.5 * dt;
  state.value = clampRange(v - decay, 0, TURBID_MAX);
  return state;
}

/** 给 UI 用的一句话状态描述 */
export function turbidLabel(state: TurbidState): string {
  switch (state.phase) {
    case 'corrupting':
      return `浊化爆发（${state.phaseLeft.toFixed(1)}s）`;
    case 'weak':
      return `道基虚弱（${state.phaseLeft.toFixed(1)}s）`;
    default:
      return `浊气 ${state.value.toFixed(0)}/${TURBID_MAX}`;
  }
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function clampRange(x: number, lo: number, hi: number): number {
  if (!Number.isFinite(x)) return lo;
  return x < lo ? lo : x > hi ? hi : x;
}
