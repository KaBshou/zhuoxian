/**
 * 掉落生成 —— 把随机数、品阶、基底、灵纹串成一条完整链路。
 *
 * 这是全游戏最重要的一个函数家族。原因：玩家玩这个游戏 95% 的时间
 * 都在看掉落物。「掉落有期待感」比「战斗好看」重要一个量级。
 *
 * 三个决定掉落爽感的参数（都在这里可调）：
 * 1. 品阶分布 —— 太慷慨，宝品满地都是，玩家麻木；太吝啬，一天没出货，玩家走人。
 * 2. 灵纹质量 —— 宝品 4 条里 3 条是垃圾，仍然兴奋；4 条全垃圾，等于没掉。
 * 3. 掉落频率 —— 每分钟 3~5 件。太少没节奏，太多玩家干脆不捡了。
 *
 * 纪律：**掉落必须完全由传入的 Rng 决定**。不许读 Date.now、不许读 Math.random，
 * 否则「同一个种子出同一件装备」这条测试就废了，而且离线收益没法补算。
 */

import {
  baseMainValue,
  basesForSlot,
  type ItemBaseDef,
} from '../data/bases';
import type { AffixDef } from '../data/affix-def';
import {
  DEEP_EXTRA_CHANCE,
  DEEP_LEGENDARY_DEFS,
  DEEP_LEGENDARY_MIN_FLOOR,
  LEGENDARY_DEFS,
} from '../data/legendary';
import {
  RARITIES,
  RARITY_BASE_WEIGHT,
  RARITY_NAME,
  type Rarity,
} from '../data/rarity';
import { SLOT_KINDS, SLOT_NAME, type SlotKind } from '../data/slots';
import { Rng } from './rng';
import {
  pickAffixCount,
  rollAffixInstances,
  type BaseStat,
  type Item,
} from './item';

/** 一次掉落的所有可调参数（给秘境词缀 / 怪物品阶 / 机缘属性留的口子） */
export interface LootParams {
  /** 灵蕴（= 怪物/层数的等级），决定能出多高阶的灵纹与基底 */
  readonly ilvl: number;
  /** 品阶权重加成：>1 让高品阶更容易（机缘属性、怪物品阶、稀有怪都用这个） */
  readonly rarityBonus?: number;
  /** 强制指定部位（Boss 掉落可以指定"必掉法器"）；不传则随机 */
  readonly slot?: SlotKind;
  /** 额外灵纹条数（稀有怪 / 秘境词缀的「物品数量」作用于这里） */
  readonly extraAffixes?: number;
  /**
   * 怪物所在层（默认 1 = 最浅）。只用于两件事：
   * ① 层 ≥40 的品阶加成 ×2（D161 (a)）② 层 ≥40 抽 40% 深层传奇池（D161 (b)）。
   * 不传就等价于「浅层」，所以老调用点行为不变。
   */
  readonly floor?: number;
}

/** 品阶加成倍率的上限。超过这个数，分布会退化成「只出仙品」，掉落就没悬念了 */
export const MAX_RARITY_BONUS = 10;

/**
 * 品阶权重（可被 rarityBonus 倾斜）。
 *
 * 用**线性**倾斜而不是指数：
 * - 指数：bonus=3 时仙品权重 ×27，bonus=10 时 ×1000，分布瞬间塌到只剩仙品
 * - 线性：每一阶只多抬一格，深层的稀有怪能明显提高出货率，但不会破坏「地上总有垃圾」
 *
 * 凡品权重永远不动。这是刻意的：暗黑类的爽感来自"大多数掉落是垃圾"，
 * 一旦凡品被挤没，玩家就失去了"出货"的对比参照。
 */
function rarityWeights(bonus: number): { item: Rarity; weight: number }[] {
  const raw = Number.isFinite(bonus) && bonus > 0 ? bonus : 1;
  const b = Math.min(MAX_RARITY_BONUS, Math.max(1, raw));
  return RARITIES.map((r, idx) => {
    const base = RARITY_BASE_WEIGHT[r];
    const lift = idx === 0 ? 1 : 1 + (b - 1) * idx;
    return { item: r, weight: base * lift };
  });
}

/** 抽一个品阶 */
export function rollRarity(rng: Rng, rarityBonus = 1): Rarity {
  const picked = rng.weighted(rarityWeights(rarityBonus));
  return picked ?? 'fan';
}

/**
 * 抽一个基底。
 *
 * 阶位（tier）按灵蕴做门槛：低灵蕴只会掉一阶基底，避免「1 级掉到毕业装」。
 * 门槛规则：灵蕴 < 10 只出一阶；10~24 出一二阶；25+ 出二、三阶。
 * 这条要配合数值策划的灵蕴曲线一起调。
 */
export function rollBase(
  bases: readonly ItemBaseDef[],
  slot: SlotKind,
  ilvl: number,
  rng: Rng,
): ItemBaseDef | null {
  const all = basesForSlot(bases, slot);
  if (all.length === 0) return null;
  const n = Number.isFinite(ilvl) ? Math.max(1, Math.floor(ilvl)) : 1;
  const allowed = all.filter((b) => {
    if (b.tier === 1) return true;
    if (b.tier === 2) return n >= 10;
    return n >= 25;
  });
  const pool = allowed.length > 0 ? allowed : all;
  return rng.pick(pool);
}

/** 掉落结果：法宝 + 一句话说明（给捡拾提示用） */
export interface LootResult {
  readonly item: Item;
  readonly rarity: Rarity;
  readonly slot: SlotKind;
  /**
   * D162 追加槽：层 ≥40 追击 30% 命中时多出的一件仙品（带深层专属传奇）。
   * 调用方要把它当成第二件掉落处理（否则字段存在但没人读 = 第八个死通道）。
   */
  readonly extraItem?: Item;
}

/**
 * 抽一件法宝。
 *
 * 流程：品阶 → 部位 → 基底 → 灵纹条数 → 灵纹内容 → 组装名字。
 * 每一步都用同一个 rng 顺序抽，所以整条链路可复现。
 */
export function rollLoot(
  rng: Rng,
  bases: readonly ItemBaseDef[],
  pool: readonly AffixDef[],
  params: LootParams,
): LootResult {
  const ilvl = Number.isFinite(params.ilvl) ? Math.max(1, Math.floor(params.ilvl)) : 1;
  const floor = Number.isFinite(params.floor) ? Math.max(1, Math.floor(params.floor as number)) : 1;
  const deep = floor >= DEEP_LEGENDARY_MIN_FLOOR;
  const rarity = rollRarity(rng, params.rarityBonus ?? 1);
  const slot = params.slot ?? rng.pick(SLOT_KINDS);

  const baseDef = rollBase(bases, slot, ilvl, rng);
  if (!baseDef) {
    // 基底表缺这个部位 —— 不是运行期错误，兜一张空法宝，但名字要说清楚，
    // 免得界面上出现 undefined 然后查三小时。
    const fallback: Item = {
      uid: `missing-${slot}-${ilvl}`,
      slot,
      rarity,
      ilvl,
      name: `（缺基底：${SLOT_NAME[slot]}）`,
      base: [],
      affixes: [],
    };
    return { item: fallback, rarity, slot };
  }

  const baseStats: BaseStat[] = [
    { stat: baseDef.main, op: baseDef.mainOp ?? 'flat', value: baseMainValue(baseDef, ilvl) },
  ];

  const want =
    pickAffixCount(rarity, rng) + Math.max(0, Math.floor(params.extraAffixes ?? 0));
  const affixes = rollAffixInstances(pool, slot, ilvl, want, rng);

  const name = `${RARITY_NAME[rarity]}·${baseDef.name}`;

  // 仙品固定带一条传奇效果（REQ §4「仙品 = 4 条灵纹 + 1 条传奇效果」）。
  // 放在灵纹抽完之后，保持既有 rng 抽序不变 —— 否则同一颗种子在加了这个字段之后
  // 会掉出完全不同的一批东西，历史验收数据全部作废。
  // D162：主传奇抽取**与改动前逐位相同**（只从基础 9 条池、只给仙品）——
  // 位置也必须在灵纹之后，保持既有 rng 抽序不变。
  const legendary = rarity === 'xian' ? rng.pick(LEGENDARY_DEFS).id : undefined;

  // D162 追加槽：层 ≥40 且**本次已掉出传奇**时，另掷一次 30% 再给一件仙品（带深层专属传奇）。
  // ⚠️ 条件必须是「已掉传奇」而不是「每件都掷」：每件都掷 = 0.30 × 全部掉落 都是仙品，
  //    实测把段④ 的仙品/3h 从 14.3 抬到 207（14 倍），满级从 259.6 掉到 216.9。
  //    shuzhi 的账是 0.9 件/h = 3.0/h × 0.30，即「按传奇件数加 30%」，不是「按掉落件数加」。
  // 为什么是「额外一件」而不是「同一件挂两条传奇」：`Item.legendary` 只有一个字段，
  // 塞两条就得改字段语义 + 所有消费方；而追加一件装备天然是加法（不动原池、不动仙品率）。
  // rng 顺序固定在这里：先决定主掉落，再掷追加槽 —— 位置一变整条抽序移位，历史基线全废。
  let extraItem: Item | undefined;
  if (deep && legendary !== undefined && rng.chance(DEEP_EXTRA_CHANCE)) {
    const deepDef = rng.pick(DEEP_LEGENDARY_DEFS);
    const extraSlot = params.slot ?? rng.pick(SLOT_KINDS);
    const extraBase = rollBase(bases, extraSlot, ilvl, rng);
    if (extraBase) {
      const extraAffixCount = pickAffixCount('xian', rng);
      extraItem = {
        uid: `deep-${extraSlot}-${ilvl}-${rng.int(0x100000, 0x7ffffff).toString(16)}`,
        slot: extraSlot,
        rarity: 'xian',
        ilvl,
        name: `${RARITY_NAME.xian}·${extraBase.name}`,
        base: [{ stat: extraBase.main, op: extraBase.mainOp ?? 'flat', value: baseMainValue(extraBase, ilvl) }],
        affixes: rollAffixInstances(pool, extraSlot, ilvl, extraAffixCount, rng),
        legendary: deepDef.id,
      };
    }
  }

  return {
    item: {
      uid: `${slot}-${ilvl}-${rng.int(0x100000, 0x7ffffff).toString(16)}`,
      slot,
      rarity,
      ilvl,
      name,
      base: baseStats,
      affixes,
      legendary,
    },
    rarity,
    slot,
    extraItem,
  };
}

/**
 * 一次掉多件（Boss / 秘境宝箱）。
 *
 * 注意 `params.slot` 在这里逐件生效：想「指定部位掉 1 件 + 其余随机」
 * 就自己调两次 rollLoot，别指望这个函数理解你的意图。
 */
export function rollLootMany(
  rng: Rng,
  bases: readonly ItemBaseDef[],
  pool: readonly AffixDef[],
  params: LootParams,
  count: number,
): LootResult[] {
  const n = Math.max(0, Math.floor(count));
  const out: LootResult[] = [];
  for (let i = 0; i < n; i++) out.push(rollLoot(rng, bases, pool, params));
  return out;
}

/**
 * 掉落过滤器的判据（第一版只做最小实现）。
 *
 * 拾取玉简的完整规则（按品阶 / 部位 / 词条 / 名字正则过滤）等 M7 再做，
 * 但**留这个函数**是为了提醒：过滤器不是后期才想的事，
 * 它决定玩家"要不要弯腰"，漏了会让前期体验很糟。
 */
export function passesBasicFilter(
  result: LootResult,
  minRarity: Rarity = 'ling',
): boolean {
  return RARITIES.indexOf(result.rarity) >= RARITIES.indexOf(minRarity);
}
