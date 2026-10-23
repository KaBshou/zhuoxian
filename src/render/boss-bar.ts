/**
 * 镇守血条几何（D183）。
 *
 * 为什么单独抽出来：新手 5 分钟走查发现**第一次打镇守要等 100 多秒**（层 1 镇守 1700 血 ÷ 玩家
 * 秒伤 9.4 ≈ 123 秒），而屏幕上只有一根 4px 的小血条 —— 玩家分不清「在打」和「卡住了」。
 * 镇守需要「一眼看到还剩多少」的进度感，这根条的比例/位置就得可测，不能靠肉眼调。
 *
 * 几何规则（都由下面的函数给出，渲染器不许自己算）：
 * - 条比普通怪宽（`max(96, r * 2.4)`），并且**一开始就画**（普通怪满血不画是为了画面干净，
 *   镇守反过来：它一登场就该有条）。
 * - 名字抬高到条上方，避免和条重叠；百分比贴在条右侧，让玩家不用读数字也知道进度。
 */

/** 条的最小宽度：太窄看不出百分比变化（层 1 镇守 r=44 → r*2.4=105.6，够；无尽层怪大也够） */
export const BOSS_BAR_MIN_W = 96;
export const BOSS_BAR_H = 5;
/** 名字与条之间的间距 */
export const BOSS_NAME_GAP = 8;

export interface BossBarGeometry {
  /** 条左端 x */
  readonly barX: number;
  /** 条顶端 y */
  readonly barY: number;
  readonly w: number;
  readonly h: number;
  /** 百分比文字的左端 x 与基线 y（贴条右侧） */
  readonly pctX: number;
  readonly pctBaseline: number;
  /** 名字的基线 y（在条上方） */
  readonly nameY: number;
}

/**
 * 算出镇守血条/百分比/名字的位置。
 *
 * @param mx 怪的中心 x（屏幕坐标）
 * @param my 怪的中心 y
 * @param r  怪的身体半径
 */
export function bossBarGeometry(mx: number, my: number, r: number): BossBarGeometry {
  const safeR = Number.isFinite(r) && r > 0 ? r : 1;
  const w = Math.max(BOSS_BAR_MIN_W, safeR * 2.4);
  // 条压在身体上方一点点（原来 -8 的位置留给普通怪的小条，镇守单独让开）
  const barY = my - safeR - BOSS_BAR_H - 6;
  return {
    barX: mx - w / 2,
    barY,
    w,
    h: BOSS_BAR_H,
    pctX: mx - w / 2 + w + 6,
    pctBaseline: barY + BOSS_BAR_H,
    nameY: barY - BOSS_NAME_GAP,
  };
}

/**
 * 百分比文字（向上取整：剩 1 滴血也显示 1%，显示「0%」会让人以为已经死了）。
 * 脏值一律当满血 —— 宁可不显示掉血，也不要画出「250%」。
 */
export function bossPercentText(hp: number, maxHp: number): string {
  if (!Number.isFinite(hp) || !Number.isFinite(maxHp) || maxHp <= 0) return '100%';
  const ratio = Math.max(0, Math.min(1, hp / maxHp));
  return `${Math.ceil(ratio * 100)}%`;
}

/** 已经掉过血才需要画（满血时不画，避免「一登场就一根满条」抢视觉） */
export function bossBarVisible(hp: number, maxHp: number): boolean {
  if (!Number.isFinite(hp) || !Number.isFinite(maxHp) || maxHp <= 0) return false;
  return hp < maxHp;
}
