/**
 * 渊痕 —— 满级之后唯一的永久积累物（BALANCE §21.10，D36-A E1）。
 *
 * 三条铁律（改之前先读）：
 * 1. **渊痕不产生「无限」战力**（D45）。允许**有界**强化（`divineReforge` 单件、灵纹 cap 1.3、不可叠加），
 *    禁止任何「渊痕按比例换伤害/气血」的持续口子 —— 那种口子会同时废掉 §16 的 EHP 判定
 *    和 §20.14 的 BREAKTHROUGH_XP 数组（那两张表都是在「战力只来自装备 + 境界」的前提下标定的）。
 *    有界强化的理由：满级后如果没有「能变强一点点」的感觉，满级那一刻就等于游戏结束；
 *    上限钉死在 cap 1.3 是为了让 3h 后收益必然归零，不至于变成第二个无限曲线。
 * 2. **价格锚在时间上，不锚在层数上。** 价格 = 渊痕/分 × 期望分钟数。
 *    层 36→46 的修为/分从 6 212 掉到 4 016，但价格不改 —— 否则「越深越买不起」。
 * 3. **只有三档，不许加战斗属性档。** validateMarks() 会在测试里守住这条。
 */

/**
 * 渊痕的产出速率（渊痕/分）。
 *
 * BALANCE §21.10 v4.29 实测：10 161 / 10 843 / 11 477（3 种子 --post-cap），取中位 10 843。
 * v4.38（D81）重锚：D78 修好 castSpeed 后实测 6 种子中位 **15 627**（击杀变快 → 渊痕变多），
 * 按 ×1.44 同步三档价格。
 * ⚠️ 历史：这个数曾经是 4 400（早期按「层 46 满级后 10min ≈ 44 000」推的），
 * 而 --post-cap 真跑是 2.46 倍 —— 定价锚的是**分钟数**，所以速率一变三档价格全部同倍缩放。
 * 以后再改掉落 / 修为曲线，必须重跑 --post-cap 并同步这里，否则「3h 能买一次」的
 * 心理账户会静默失真（不会报错，只是玩家觉得渊痕莫名其妙变多或变少）。
 */
export const MARKS_PER_MINUTE = 15_627;

/** 三个可买项（价格 = 渊痕/分 × 期望分钟数，推导见 BALANCE §21.10） */
export type MarkSink = 'setStartFloor' | 'rerollCurrency' | 'divineReforge';

export const MARKS_COST: Readonly<Record<MarkSink, number>> = {
  /** 设下一次闭关的起点层：45.5 分钟的量（选层是决策，不是默认便利）。15 627 × 45.5 ≈ 711 000 → 720 000 */
  setStartFloor: 720_000,
  /** 换一块洗灵石：22.7 分钟（= 一件装备重洗一次的心理账户）。15 627 × 22.7 ≈ 355 000 → 360 000 */
  rerollCurrency: 360_000,
  /**
   * 定向重铸一条天阶词条：230.6 分钟 = 3 600 000。
   *
   * 这是**唯一需要跨天**的一档（3h 挂机产 2.81M，差一点），刻意如此：
   * 它换的是「一件装备的一条灵纹抬到上限」这种终局收益，如果 3h 就能买，
   * 满级后三小时就没事干了。旧值 1.5M（170min）是按 8 900/分 定的，速率修正后同步放大。
   */
  divineReforge: 3_600_000,
};

export const MARK_SINK_NAME: Readonly<Record<MarkSink, string>> = {
  setStartFloor: '定渊（设下次闭关起点层）',
  rerollCurrency: '聚灵（换一块洗灵石）',
  divineReforge: '夺造化（定向重铸天阶灵纹）',
};

/** 校验：只允许三档、价格为正整数。测试用，返回错误列表 */
export function validateMarks(): string[] {
  const errs: string[] = [];
  const keys = Object.keys(MARKS_COST);
  if (keys.length !== 3) errs.push('MARKS_COST 必须恰好 3 档，实际 ' + keys.length);
  for (const key of keys) {
    const v = MARKS_COST[key as MarkSink];
    if (!Number.isFinite(v) || v <= 0 || Math.floor(v) !== v) {
      errs.push('价格非法：' + key + '=' + String(v));
    }
  }
  if (MARKS_PER_MINUTE <= 0) errs.push('MARKS_PER_MINUTE 必须为正');
  return errs;
}

/** 当前渊痕够买哪几档（UI 用） */
export function affordableSinks(marks: number): MarkSink[] {
  const safe = Number.isFinite(marks) ? Math.max(0, marks) : 0;
  return (Object.keys(MARKS_COST) as MarkSink[]).filter((k) => safe >= MARKS_COST[k]);
}
