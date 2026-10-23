/**
 * 通货打造 —— 消费 pocket 里的通货，改造背包 / 身上的法宝。
 *
 * 分工纪律：
 * - item.ts 里的 addAffix / removeRandomAffix / rerollAffixes 是**纯操作**，
 *   只改 Item、返回 CraftResult，不知道通货的存在。
 * - 这里是唯一把「通货计数 → 选目标 → 调操作 → 扣计数」串起来的地方。
 * - 战斗/掉落层（session.ts）不碰打造；打造层不改战斗状态。
 *
 * 放置游戏的设计约束（BALANCE §5 + REQ 通货节）：
 * - 打造是**全自动挂机策略**，不是玩家逐件点的工作台 —— 「决策全留给人」指的是
 *   策略开关，不是每 15 秒点一次按钮。
 * - 策略刻意保守：只在「身上穿的 + 背包里战力前 N」里挑目标，
 *   见什么洗什么会把手里的好东西洗废。
 * - **单调操作 vs 赌**（2026-10-22 D55 定稿）：添灵纹是单调的（只会更强），可以作用于已穿件；
 *   洗 / 灭 / 满条兜底重掷都是赌（期望可能为负），**只作用于背包件**。
 *   违反这条的后果是实测过的：已穿玉佩被洗到 55.9 → 51.09，玩家视角就是「越玩越弱」。
 */
import {
  addAffix,
  maxAffixes,
  removeRandomAffix,
  rerollAffixAt,
  rerollAffixes,
  type CraftResult,
  type Item,
} from './item';
import { equippedItems } from './character';
import { STAT_WEIGHT, itemPower } from './inventory';
import type { CharacterState } from './character';
import type { Rng } from './rng';
import type { AffixDef } from '../data/affix-def';
import type { CurrencyId } from '../data/currency';
import {
  addFragments,
  EMPTY_FRAGMENTS,
  FRAGMENT_WEIGHT_MUL,
  type FragmentElement,
} from '../data/fragments';
import type { AffixWeightBoost } from './item';

/** 背包里参与打造的件数上限（战力最高的前 N 件）。再多的不会被通货碰 */
export const CRAFT_BAG_TOP = 4;

/** 打造候选：身上的全部 + 背包战力前 N。按 uid 去重 */
export function craftTargets(ch: CharacterState, bag: readonly Item[]): Item[] {
  const out: Item[] = equippedItems(ch).map((e) => e.item);
  const rest = [...bag].sort((a, b) => itemPower(b) - itemPower(a)).slice(0, CRAFT_BAG_TOP);
  for (const it of rest) {
    if (!out.some((x) => x.uid === it.uid)) out.push(it);
  }
  return out;
}

function isWorn(ch: CharacterState, item: Item): boolean {
  return equippedItems(ch).some((e) => e.item.uid === item.uid);
}

/** 把旧物品从身上/背包里替换成打造后的新物品（uid 不变） */
function replaceItem(
  ch: CharacterState,
  bag: readonly Item[],
  old: Item,
  next: Item,
): { character: CharacterState; bag: Item[] } {
  const worn = equippedItems(ch).find((e) => e.item.uid === old.uid);
  if (worn) {
    return {
      character: { ...ch, equipment: { ...ch.equipment, [worn.slot]: next } },
      bag: [...bag],
    };
  }
  return { character: ch, bag: bag.map((it) => (it.uid === old.uid ? next : it)) };
}

interface CraftStep {
  readonly character: CharacterState;
  readonly bag: Item[];
  readonly result: CraftResult | null;
}

/** 黄阶灵石：给「还有灵纹空位」的候选添一条；优先身上（战力立即变现），其次背包 */
export function craftAddAffix(
  ch: CharacterState,
  bag: readonly Item[],
  pool: readonly AffixDef[],
  rng: Rng,
  boost?: AffixWeightBoost,
): CraftStep {
  const targets = craftTargets(ch, bag).filter((t) => t.affixes.length < maxAffixes(t.rarity));
  if (targets.length === 0) {
    // D28-B：全员满条时，黄阶降级成「重掷最不值钱的那条」（PoE chaos orb 语义）。
    // 没有这个出口，满条之后黄阶永远失败 → pocket 里无限堆积（实测 2h 只花掉 46%）。
    return craftReforgeWorstAffix(ch, bag, pool, rng);
  }
  // 添灵纹是**唯一可以作用在已穿件上的打造操作**（2026-10-22 复核，ceshi 反证后定稿）：
  // 它是单调的 —— 只会让这件法宝多一条正向灵纹，战力不可能下降。
  // 其余三种（洗 / 灭 / 满条兜底重掷）都是**赌**，期望可能为负，必须只在背包件上做（D55）。
  // 优先挑身上的，是因为自动换装会瞬间把背包里的好东西穿上，
  // 所以「会长期穿着的那件」就在身上 —— 通货花在这里才不是白扔。
  const target = targets.find((t) => isWorn(ch, t)) ?? targets[0];
  const result = addAffix(target, pool, rng, boost);
  if (!result.ok) return { character: ch, bag: [...bag], result };
  const rep = replaceItem(ch, bag, target, result.item);
  return { character: rep.character, bag: rep.bag, result };
}

/** 一条灵纹的战力贡献（用全局权重表，跨属性可比） */
function affixPowerOf(item: Item, index: number): number {
  const a = item.affixes[index];
  return (STAT_WEIGHT[a.stat] ?? 1) * a.value;
}

/**
 * 满条兜底：挑「战力最高的那件」里「最不值钱的那条灵纹」重掷，**并保证结果不变差**。
 *
 * 为什么挑战力最高的那件：通货应该花在会被长期穿着的装备上，
 * 花在马上要被分解的垃圾上等于白扔（这也是 craftTargets 只取背包战力前 N 的原因）。
 *
 * 「保底不亏」（2026-10-22 第三版，`keepBest`）：
 * 重掷最弱一条的期望值本来是正的（新骰的平均 > 当前最弱），但单次会掷出更差的
 * —— 实测把已穿玉佩从 55.9 洗到 51.09，玩家视角就是「越玩越弱」。
 * 改成「掷完若更差就保留原样（通货照扣）」之后，这个算子变成**单调不降**：
 * - 已穿件可以安全地作为目标（不会再掉战力）；
 * - 但也不是免费变强：每次都要付一枚黄阶灵石，收益随时间收敛到「该灵蕴下这条灵纹的最好骰点」。
 * 这就是「赌」和「单调」的统一写法 —— 用保单把赌变成只会向上的随机游走。
 */
export function craftReforgeWorstAffix(
  ch: CharacterState,
  bag: readonly Item[],
  pool: readonly AffixDef[],
  rng: Rng,
): CraftStep {
  const targets = craftTargets(ch, bag).filter((t) => t.affixes.length > 0);
  if (targets.length === 0) return { character: ch, bag: [...bag], result: null };
  const target = [...targets].sort((a, b) => itemPower(b) - itemPower(a))[0];
  let worst = 0;
  for (let i = 1; i < target.affixes.length; i++) {
    if (affixPowerOf(target, i) < affixPowerOf(target, worst)) worst = i;
  }
  const before = itemPower(target);
  const result = rerollAffixAt(target, worst, pool, rng);
  if (!result.ok) return { character: ch, bag: [...bag], result };
  if (itemPower(result.item) < before) {
    // 掷坏了：保留原样，但通货已经花掉（保单的钱不退，否则就等于无限免费重掷）
    return {
      character: ch,
      bag: [...bag],
      result: { item: target, ok: true, message: '重铸未得利，原样保留' },
    };
  }
  const rep = replaceItem(ch, bag, target, result.item);
  return { character: rep.character, bag: rep.bag, result };
}

/** 灭灵石：删掉「有灵纹但战力最低」候选的一条（灭最差的，好货不碰） */
export function craftRemoveAffix(
  ch: CharacterState,
  bag: readonly Item[],
  rng: Rng,
): CraftStep {
  // 只对「灵纹已满」的候选动灭灵石（2026-10-22 修）：旧实现挑「有灵纹且战力最低」的，
  // 结果满级挂机 8 小时后身上出现 `ring1 ling/0` —— 灵品保底 1 条灵纹（RARITY_AFFIX_COUNT
  // ling=[1,2]），0 条只可能是被灭掉的，而它正是身上最弱的那件。
  // 对没满条的装备用灭灵石是纯亏：掉 1 条最多换回 1 条随机，期望战力下降。
  // 同理：**只灭背包件**。已穿件被灭 = 直接掉属性，玩家视角就是「越玩越弱」。
  const targets = craftTargets(ch, bag).filter(
    (t) => !isWorn(ch, t) && t.affixes.length > 0 && t.affixes.length >= maxAffixes(t.rarity),
  );
  if (targets.length === 0) return { character: ch, bag: [...bag], result: null };
  const target = [...targets].sort((a, b) => itemPower(a) - itemPower(b))[0];
  const result = removeRandomAffix(target, rng);
  if (!result.ok) return { character: ch, bag: [...bag], result };
  const rep = replaceItem(ch, bag, target, result.item);
  return { character: rep.character, bag: rep.bag, result };
}

/** 洗灵石：重洗「灵纹已满、战力最高」的候选（满条的才值得洗） */
export function craftReroll(
  ch: CharacterState,
  bag: readonly Item[],
  pool: readonly AffixDef[],
  rng: Rng,
): CraftStep {
  // 凡品 0 条上限会被 0>=0 判成「满条」——洗 0 条是白费最稀有的通货，必须排除。
  // **只洗背包件，绝不洗已穿件**（2026-10-22，P0）：洗灵石是全重掷，4 条能洗成 1 条好的 +
  // 3 条垃圾，期望战力可能下降。作用在已穿件上就是「打造在削弱玩家」——
  // 实测同一个种子的戒指被洗到「同部位宝品中位的 39%」，这也是段② 判据震荡的唯一根因
  // （同掉落、压掉打造 → 退出次数 0/0/0；开打造 → 11/6/9 次）。背包件随便洗，玩家看不出来。
  const targets = craftTargets(ch, bag).filter(
    (t) => !isWorn(ch, t) && t.affixes.length > 0 && t.affixes.length >= maxAffixes(t.rarity),
  );
  if (targets.length === 0) return { character: ch, bag: [...bag], result: null };
  const target = [...targets].sort((a, b) => itemPower(b) - itemPower(a))[0];
  const result = rerollAffixes(target, pool, rng);
  if (!result.ok) return { character: ch, bag: [...bag], result };
  const rep = replaceItem(ch, bag, target, result.item);
  return { character: rep.character, bag: rep.bag, result };
}

/** 一份通货消费计划。策略层（session 自动策略 / 将来 UI）的输出 */
export interface CraftPlan {
  readonly counts: Partial<Record<CurrencyId, number>>;
}

export interface CraftOutcome {
  readonly character: CharacterState;
  readonly bag: Item[];
  /** 每次成功打造的一句话（日志用） */
  readonly messages: string[];
  /** 实际消费掉的通货计数 */
  readonly spent: Partial<Record<CurrencyId, number>>;
  /** 这一轮用掉了几颗五行碎片（D104，日志/统计用） */
  readonly fragmentsUsed: number;
}

/**
 * 打造选项。
 *
 * `fragment` = 玩家在面板里「定向」的五行（D104）。只有**添灵纹**这一步会吃碎片：
 * 它是唯一单调的打造操作，用碎片把定向属性抽出来的期望是正的。
 * 洗 / 灭 / 满条兜底重掷都是赌（D55），**不许**吃碎片 ——
 * 否则碎片就变成了「免费重掷券」，赌类操作的负期望被抹平。
 */
export interface CraftOptions {
  readonly fragment?: FragmentElement | null;
}

/**
 * 按计划执行一轮打造。
 *
 * 顺序刻意：**先灭**（腾出空位）→ **再添**（把空位填上）→ **最后洗**（满条才值得洗）。
 * 任一步没有可用目标就跳过该步。
 *
 * 为什么不是原来的「先洗 → 再灭 → 最后添」（2026-10-22 改）：
 *   ① 洗排第一会把刚掉的满条件洗成预期战力更低的东西，而玩家此刻正穿着它；
 *   ② 灭在添之前才是对的：灭是为了腾位，添是填位，两步必须相邻；
 *   ③ 修完后 `craftReroll`/`craftRemoveAffix` 都只作用于**背包件**（见各自注释），
 *      打造不再动已穿装备 —— 这是「装备只升不降」的唯一保证。
 */
export function runCraftPlan(
  ch: CharacterState,
  bag: readonly Item[],
  plan: CraftPlan,
  pool: readonly AffixDef[],
  rng: Rng,
  opts?: CraftOptions,
): CraftOutcome {
  let character = ch;
  let items = [...bag];
  const messages: string[] = [];
  const spent: Partial<Record<CurrencyId, number>> = {};
  const fragEl = opts?.fragment ?? null;
  let fragLeft = fragEl ? (character.fragments?.[fragEl] ?? 0) : 0;
  let fragmentsUsed = 0;

  const run = (
    id: CurrencyId,
    step: (c: CharacterState, b: Item[]) => CraftStep,
  ): void => {
    for (let i = 0; i < (plan.counts[id] ?? 0); i++) {
      const r = step(character, items);
      if (!r.result || !r.result.ok) break;
      character = r.character;
      items = r.bag;
      messages.push(r.result.message);
      spent[id] = (spent[id] ?? 0) + 1;
    }
  };

  run('mie', (c, b) => craftRemoveAffix(c, b, rng));
  run('huang', (c, b) => {
    const useBoost = fragEl !== null && fragLeft > 0;
    const step = craftAddAffix(
      c,
      b,
      pool,
      rng,
      useBoost && fragEl !== null ? { tag: fragEl, mul: FRAGMENT_WEIGHT_MUL } : undefined,
    );
    if (!step.result || !step.result.ok || !useBoost || fragEl === null) return step;
    // 只有「真的添上了」才扣碎片：失败（满条/池子抽干/锁住）不扣。
    const before = c.fragments ?? EMPTY_FRAGMENTS;
    fragLeft -= 1;
    fragmentsUsed += 1;
    return {
      character: { ...step.character, fragments: addFragments(before, fragEl, -1) },
      bag: step.bag,
      result: step.result,
    };
  });
  run('xi', (c, b) => craftReroll(c, b, pool, rng));

  return { character, bag: items, messages, spent, fragmentsUsed };
}
