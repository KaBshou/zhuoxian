/**
 * 周目（D36-A 的第一层，D130）：满级之后「重开一轮」，唯一的「一个乘数换无限小时」结构。
 *
 * 为什么是周目而不是继续加层（shuzhi v4.61 判定）：
 * - 层 28~76 目前只有「变肉变疼」，再加层只是把「变肉」拉长，**换不来新刻度**；
 * - 满级后修为直接丢弃（`xpForStep(80) = Infinity`）、层数在 `MAX_FLOOR` 封顶，
 *   所以「更长的时间」在这个系统里无法兑换成任何东西；
 * - 周目同时补两个缺口：**内容时长**（每轮重练）+ **离散刻度**（周目数本身可做成就/展示）。
 *
 * 三条硬纪律：
 * 1. **绝不给修为加成** —— 修为已满，给了也是丢（`xpForStep` 已在终点返回 Infinity）；
 * 2. **只给渊痕与品阶** —— 这两样是「越刷越强」的有界通道，不产生无限战力（D45）；
 * 3. **周目倍率只乘怪，不乘玩家** —— 玩家的成长来自装备与周目间积累的渊痕。
 */

/** 每周目怪物气血倍率（乘算：第 N 周目 = 1.35^N） */
// D149（shuzhi 前置清理）：1.35 → 1.30。理由：c3 死亡/小时实测 14.07，红线 15，余量仅 6%；
// 按 1.16/1.4 的增速外推 c4 必超（~20/h）。D141 的触发条件是「>15 才降到 1.30」，
// 但「等红了再改」= 改数据追着 bug 跑；按 D141 的**预案值**提前落地，c4 开工前先办掉。
// D149：1.35 → 1.30 的「c4 前置清理」**已实测否决并回滚**。
// 反证：降怪血 ⇒ 爬得更快 ⇒ 在同样 900min 内更早进入深层 ⇒ c3 死亡/小时 14.07 → 16.51（破 D141 的 15 红线），
// 而 c3 满级中位只从 486.0 降到 461.9。方向与 D141 的假设相反 —— 「死亡/h」由**爬升速度**驱动，不是由怪血量驱动。
// 结论：要压 c3 的死亡/h，杠杆是「减慢爬升」或「加深层威胁形状」，不是降怪血。保持 1.35。
export const CYCLE_HP_MUL = 1.35;

/**
 * 每周目怪物攻伐倍率（D134：**攻不再吃周目**，1.25 → 1.00）。
 *
 * 为什么拿掉：补 9h 需要的是「时长」不是「死亡」。血 ×1.35 已经把时长给足（击杀率 ×0.74）；
 * 而全重置后玩家每轮回到同一强度，`1.25^N` 的攻直接压在同一份 EHP 上 ——
 * 实测 c1 只 +25% 攻就让死亡中位 1.5 → 18.5、首次撞墙 60 → 35，c2 直接在层 1 就死。
 * 那不是难度，是惩罚。危险的来源已经有 §6.5 的 threat 斜坡（层 22+ ×1~4、镇守 ×1.5），
 * 不需要周目再叠一层。将来真要「越轮回越险」，正确形状是 1.05^N 缓坡 + 配套 EHP 通道。
 */
export const CYCLE_DMG_MUL = 1.0;

/** 每周目渊痕产出加成（线性：第 N 周目 = 1 + N × 1.0 = 基础 × (N+1)） */
export const CYCLE_MARKS_PER = 1;

/**
 * 渊痕倍率上限（D131）：钳在 ×4。
 *
 * 锚 =「最深一档沉淀 ≥ 1 小时」：夺造化 3.6M ÷ (15 627 × 4) = 57.6min。
 * 不钳的话第 20 周目就是 ×21 ⇒ 11min，渊痕三档全部失去沉淀意义（D45 的有界强化）。
 * 同理绝不做 2^N：渊痕是**固定价**的沉淀货币，指数收入会直接打穿沉淀。
 */
export const CYCLE_MARKS_MAX = 4;

/** 周目数上限只用于显示与防御（不限制玩家推进，但超过这个数说明数值失控） */
export const CYCLE_SOFT_CAP = 50;

/** 渐入起点层：层 1~9 不吃周目倍率（轮回后从 0 装备起跑，那一段就是教学期） */
export const CYCLE_FADE_FROM_FLOOR = 9;

/**
 * 按层渐入的有效周目数（D135）：`cycle × clamp((floor − 9) / 9, 0, 1)`。
 *
 * 为什么按**层**不按强度：轮回后玩家从 0 装备起跑，「层 1~9」对新角色就该是教学期；
 * 按层渐入 = 用「你已经打过一遍」这个事实承接倍率，而不是拿倍率去惩罚重开。
 */
export function effectiveCycle(cycle: number, floor: number): number {
  const c = Number.isFinite(cycle) && cycle > 0 ? Math.floor(cycle) : 0;
  if (c === 0) return 0;
  const f = Number.isFinite(floor) && floor > 0 ? Math.floor(floor) : 1;
  const fade = Math.min(1, Math.max(0, (f - CYCLE_FADE_FROM_FLOOR) / CYCLE_FADE_FROM_FLOOR));
  return c * fade;
}

/** 第 N 周目的怪物气血倍率（接受小数 = 渐入后的有效周目）。脏输入按第 0 周目（= 1）。 */
export function cycleHpMul(cycle: number): number {
  const c = Number.isFinite(cycle) && cycle > 0 ? cycle : 0;
  return Math.pow(CYCLE_HP_MUL, c);
}

/** 第 N 周目的怪物攻伐倍率（接受小数；D134 起 CYCLE_DMG_MUL = 1 ⇒ 恒为 1）。 */
export function cycleDmgMul(cycle: number): number {
  const c = Number.isFinite(cycle) && cycle > 0 ? cycle : 0;
  return Math.pow(CYCLE_DMG_MUL, c);
}

/** 第 N 周目的渊痕产出倍率（线性，不乘方 —— 渊痕是「有界强化」的货币） */
export function cycleMarksMul(cycle: number): number {
  const c = Number.isFinite(cycle) && cycle > 0 ? Math.floor(cycle) : 0;
  return Math.min(CYCLE_MARKS_MAX, 1 + CYCLE_MARKS_PER * c);
}

/** 归一化周目数（读档、调试钩子、UI 共用；非法值归 0） */
export function clampCycle(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  return Math.min(CYCLE_SOFT_CAP, Math.floor(value));
}

/** 周目显示名：第 0 周目叫「初临」，之后是「第 N 周目」 */
export function cycleName(cycle: number): string {
  const c = clampCycle(cycle);
  return c === 0 ? '初临' : `第 ${c} 周目`;
}
