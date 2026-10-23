/**
 * 五行碎片（REQ §3 第 7 条：镇守掉落、可在打造时使用以提升对应属性词条权重）。
 *
 * 三条纪律（BALANCE §5.11 / D104）：
 *  1. **只做金 / 火 / 水三系** —— 木、土在 v1 没有任何带 `wood` / `earth` 标签的灵纹，
 *     给它们做碎片等于生造一件永远用不到的道具（「存在」必须有「读者」）。
 *  2. **走镇守的独立掉落槽**，不进 `DROP_CHANCE` 三分类。
 *     三分类是「先过 0.28 闸再分流」，碎片挂进去会挤压法宝份额
 *     （`法宝份额 = 1 − 0.6(1+q)`，妖纹 D95 就在这上面踩过）。
 *  3. **不进 `s.pocket`** —— pocket 是「黄阶/灭/洗」三种通货的余额表，
 *     碎片进它会破坏 `craftPlanFromPocket` 的语义，也会糊掉 D28 的囤积监测。
 *
 * 产量与稀缺性（shuzhi v4.45 §5.11）：每镇守必掉 1 个 ⇒ 一轮约 32 个，
 * 黄阶灵石一轮约 314 个 ⇒ 碎片是黄阶的 1/10，是**定向工具**而不是主力通货。
 */

/** 碎片属性（与 data/tags.ts 的五行 ElementTag 同名，便于直接做权重加权） */
export type FragmentElement = 'metal' | 'fire' | 'water';

export const FRAGMENT_ELEMENTS: readonly FragmentElement[] = ['metal', 'fire', 'water'];

/** 单个属性的上限（防止静默囤成天文数字） */
export const FRAGMENT_CAP = 99;

/**
 * 使用 1 个碎片时，池里带该五行标签的灵纹权重倍数（shuzhi 定稿 ×4）。
 * 为什么不是 ×3：候选池 12 条时单条 8.3% → 26.7% 玩家能感觉到；×3 只有 21%。
 * 为什么**不叠乘**：×16 会让单条到 74%，定向就变成了「指定」。
 */
export const FRAGMENT_WEIGHT_MUL = 4;

/** 显示的短名（面板、日志用） */
export const FRAGMENT_TERM: Record<FragmentElement, string> = {
  metal: '金',
  fire: '火',
  water: '水',
};

/** 完整名（掉落日志用） */
export const FRAGMENT_NAME: Record<FragmentElement, string> = {
  metal: '金行碎片',
  fire: '火行碎片',
  water: '水行碎片',
};

export interface FragmentState {
  readonly metal: number;
  readonly fire: number;
  readonly water: number;
}

export const EMPTY_FRAGMENTS: FragmentState = { metal: 0, fire: 0, water: 0 };

export function isFragmentElement(value: unknown): value is FragmentElement {
  return typeof value === 'string' && (FRAGMENT_ELEMENTS as readonly string[]).includes(value);
}

/** 读档清洗：脏值安静归零、上限夹取、非整数向下取整 */
export function sanitizeFragments(raw: unknown): FragmentState {
  const one = (v: unknown): number => {
    const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : 0;
    return Math.max(0, Math.min(FRAGMENT_CAP, n));
  };
  if (!raw || typeof raw !== 'object') return EMPTY_FRAGMENTS;
  const obj = raw as Record<string, unknown>;
  return { metal: one(obj.metal), fire: one(obj.fire), water: one(obj.water) };
}

/**
 * 加减碎片（`delta` 可为负 = 消耗）。
 * 结果完全不变时**返回同一个对象引用**（否则每次击杀都建新对象，存档桥接会一直脏）。
 */
export function addFragments(state: FragmentState, el: FragmentElement, delta: number): FragmentState {
  const cur = state[el];
  const next = Math.max(0, Math.min(FRAGMENT_CAP, cur + Math.floor(delta)));
  if (next === cur) return state;
  return { ...state, [el]: next };
}

export function fragmentCount(state: FragmentState, el: FragmentElement): number {
  return state[el];
}

export function totalFragments(state: FragmentState): number {
  return state.metal + state.fire + state.water;
}

/** 背包格子里那一行的显示串，例如「金 12　火 0　水 3」 */
export function fragmentSummaryText(state: FragmentState): string {
  return FRAGMENT_ELEMENTS.map((el) => `${FRAGMENT_TERM[el]} ${state[el]}`).join('　');
}

/**
 * 哪一层的镇守掉哪种碎片。
 *
 * - 主线 1~9 层（一阶镇守 MP 市侩鬼）：**金**
 * - 主线 10~18（炉主）：**火** —— 炉主本身是火行，与「按镇守属性」一致
 * - 主线 19~27（玄冥）：**水** —— 玄冥是水行，一致
 * - 无尽层 28~46：按 (floor − 28) % 3 轮转，否则三阶镇守恒为玄冥 ⇒ 只会掉水，
 *   玩家进了无尽层就再也拿不到金/火碎片（分段投放断裂）。
 *
 * 注：一阶镇守市侩鬼的元素是 `earth`（土），而土系在 v1 没有可加权的灵纹，
 * 所以这里按**阶位**给金 —— 金行标签的灵纹（裂金/锐金/金行）是一阶就能用的，
 * 这样黄阶（1~9 层）玩家第一颗碎片立刻有去处。
 */
export function fragmentElementForBoss(floor: number, tier: 1 | 2 | 3): FragmentElement {
  if (!Number.isFinite(floor)) return 'metal';
  const f = Math.max(1, Math.floor(floor));
  if (f <= 27) return tier === 1 ? 'metal' : tier === 2 ? 'fire' : 'water';
  return FRAGMENT_ELEMENTS[(f - 28) % FRAGMENT_ELEMENTS.length];
}
