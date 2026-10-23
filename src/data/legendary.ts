/**
 * 传奇效果 —— 仙品法宝专属的第五条词条。
 *
 * 需求文档（REQ §4）对品阶的定义是：**仙品固定 4 条灵纹 + 1 条传奇效果**，
 * 而「传奇」的作用不是更大的数字，是**改机制**（GDD 4.5「传奇改机制」）。
 * 所以这里刻意分成两类：
 *
 * 1. `mods`：纯数值，走 `core/modifier.ts` 的统一聚合（和灵纹同一条管线，不另开加成入口）；
 * 2. `flag`：需要战斗逻辑配合的旗子（击杀回气 / 追加一击 / 浊气上限提高）。
 *
 * 设计纪律：
 * - **数值必须是有界的**：传奇效果不提供「无限战力」，只提供「同等灵蕴下明显更强的那一档」
 *   （D45 渊痕铁律的同一条理由：有界强化允许，无限战力不允许）。
 * - 旗子只能落在**已经存在的系统**上（击杀 / 出手 / 浊气），不许为了传奇效果新开一套资源。
 * - 一个仙品只能有一条传奇效果，且**洗练 / 灭灵 / 淬炼都不许碰它**
 *   （否则玩家花几十小时刷到的仙品会被通货洗没，这比「越玩越弱」更伤人）。
 */

import type { ElementStatKey, StatKey } from './stats';
import type { ModOp } from '../core/modifier';

/** 需要战斗逻辑读取的旗子 */
export type LegendaryFlag =
  /** 击杀回复气血（按最大气血比例） */
  | 'kill-heal'
  /** 普攻概率追加一次（对最近目标再打一次） */
  | 'double-strike'
  /** 浊气伤害加成上限提高 */
  | 'boom-more';

export interface LegendaryMod {
  readonly stat: StatKey;
  readonly op: ModOp;
  readonly value: number;
}

export interface LegendaryDef {
  readonly id: string;
  readonly name: string;
  /** 给玩家看的一句话（UI 直接显示，不加工） */
  readonly desc: string;
  /** 纯数值部分 */
  readonly mods?: readonly LegendaryMod[];
  /** 机制旗子 */
  readonly flag?: LegendaryFlag;
  /** 旗子参数（比例 / 概率 / 加成） */
  readonly param?: number;
}

const RESISTS: readonly ElementStatKey[] = ['resMetal', 'resWood', 'resWater', 'resFire', 'resEarth'];

export const LEGENDARY_DEFS: readonly LegendaryDef[] = [
  {
    id: 'taiyi',
    name: '太一余烬',
    desc: '伤害更多 30%（与灵纹的「提高」相乘，不是相加）',
    mods: [{ stat: 'damage', op: 'more', value: 0.3 }],
  },
  {
    id: 'zhoutian',
    name: '周天不熄',
    desc: '气血提高 45%',
    mods: [{ stat: 'life', op: 'increased', value: 0.45 }],
  },
  {
    id: 'wuxing',
    name: '五行归元',
    desc: '五行抗性各 +12%',
    mods: RESISTS.map((stat) => ({ stat, op: 'flat' as ModOp, value: 0.12 })),
  },
  {
    id: 'xuanming',
    name: '玄冥护体',
    desc: '护体提高 300%（D19 之后护甲只占减伤 30% 权重，+140% 实际只值 EHP +6%）',
    mods: [{ stat: 'armor', op: 'increased', value: 3.0 }],
  },
  {
    id: 'tanlan',
    name: '贪婪之瞳',
    desc: '机缘提高 60%（掉落更多）',
    mods: [{ stat: 'lootQuantity', op: 'increased', value: 0.6 }],
  },
  {
    id: 'zhuihun',
    name: '追魂夺魄',
    desc: '破绽率 +10%',
    mods: [{ stat: 'critChance', op: 'flat', value: 0.1 }],
  },
  {
    id: 'xueji',
    name: '血祭',
    desc: '每次击杀回复 8% 气血',
    flag: 'kill-heal',
    param: 0.08,
  },
  {
    id: 'zhuopo',
    name: '浊魄',
    desc: '浊气伤害加成的上限提高 50%（越脏越强）',
    flag: 'boom-more',
    param: 0.5,
  },
  {
    id: 'shuangying',
    name: '双影',
    desc: '普攻有 18% 概率追加一击',
    flag: 'double-strike',
    param: 0.18,
  },
];

/**
 * 深层专属传奇（D161 / shuzhi v4.72 ③b）。
 *
 * **只在层 ≥40 掉落**，且与基础 9 条**加法共存**（层 ≥40 时 40% 抽深层池、60% 抽基础池）。
 * 为什么不能「替换」：段④ 的标准刷法是停层 46，若层 ≥40 只掉深层池，
 * 基础 9 条在最优刷法下永远刷不到 ⇒ 收集变成不可能（D161）。
 *
 * 为什么是「加深层内容」而不是「给低层加门槛」：低层传奇是存量战力，
 * 设门槛会在练级期前 53%（145.5/273min）里减战力 ⇒ 满级变慢 ⇒ 撞 D64（D161 的教训）。
 */
export const DEEP_LEGENDARY_MIN_FLOOR = 40;
/**
 * 层 ≥40 时**额外追加**一次传奇抽取的概率（D162）。
 *
 * ⚠️ 这是「追加槽」不是「分池」：原有传奇抽取**完全不动**（基础 9 条仍 3.0 件/h），
 * 另掷一次 **10%** 从深层池抽 1 条（D164 从 0.30 下调，理由见下方常量前的注释）。
 * 为什么不能分池（shuzhi 自己在 D158 里踩的坑）：层 ≥40 传奇率 3.0/h 若 40% 给深层池，
 * 基础 9 条只剩 1.8/h ⇒ 基础收集 5.3h → 8.8h（+66%）。**共用一份掉率预算，加新货必然稀释老货。**
 */
//
// D164：0.30 实测把段④ 收集从 5.3h 压到 **3.2h**（设计目标 5.5~6.5h）。
// 根因不是「+30% 传奇」而是「额外那件是**一整件新仙品**，而仙品率只有 4.81%」：
// 拿「传奇件数 ×30%」的比例去推「仙品件数」的绝对量，两个分母不同（族纪律：不许跨分母推绝对量）。
// 0.10 ⇒ per3h 14.3→17.5 ⇒ 段④ ≈4.4h（留一点「深层独占惊喜」，又不把 24h 账吃掉）。
export const DEEP_EXTRA_CHANCE = 0.1;

export const DEEP_LEGENDARY_DEFS: readonly LegendaryDef[] = [
  {
    id: 'yuanhen',
    name: '渊痕刻印',
    desc: '伤害更多 45%（深层专属，比太一余烬更重）',
    mods: [{ stat: 'damage', op: 'more', value: 0.45 }],
  },
  {
    id: 'shenyuan',
    name: '深渊回响',
    desc: '护体提高 400%（深层专属）',
    mods: [{ stat: 'armor', op: 'increased', value: 4 }],
  },
  {
    id: 'changye',
    name: '长夜未明',
    desc: '破绽率 +18%（深层专属，比追魂夺魄更高）',
    mods: [{ stat: 'critChance', op: 'flat', value: 0.18 }],
  },
];

/** 图鉴/洗档用：12 条全部（基础 9 + 深层 3） */
export const ALL_LEGENDARY_DEFS: readonly LegendaryDef[] = [...LEGENDARY_DEFS, ...DEEP_LEGENDARY_DEFS];

const BY_ID: ReadonlyMap<string, LegendaryDef> = new Map(ALL_LEGENDARY_DEFS.map((d) => [d.id, d]));



export function getLegendary(id: string | undefined): LegendaryDef | undefined {
  if (!id) return undefined;
  return BY_ID.get(id);
}

export function isLegendaryId(x: unknown): x is string {
  return typeof x === 'string' && BY_ID.has(x);
}
