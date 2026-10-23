/**
 * 属性表 —— 修仙话术 vs 内部 key 的唯一对照表。
 *
 * 两条纪律：
 * 1. **业务代码只许用 key，不许直接写中文字符串**。UI 显示名一律从 `STAT_META` 取。
 *    这样改名字只改一处；也逼着把世界观想清楚（需求文档原话：「只需要你能编辑好背景，自圆其说」）。
 * 2. **能从别的字段算出来的值不入档**（idle-grim 实测教训：老档存了 xpNext，
 *    改升级曲线后老档门槛比新曲线大 61.7 倍，新曲线对老档完全失效）。
 *
 * 数值结算统一用这个公式（流放之路同一套）：
 *   最终值 = (基础值 + flat 总和) × (1 + increased 总和) × Π(1 + more)
 *
 * flat       = 固定值加成（「+30 气血」）
 * increased  = 加算百分比，多条互相累加（「+20% 伤害」+「+30% 伤害」= +50%）
 * more       = 乘算百分比，多条互相相乘（「更多 20%」×「更多 30%」= ×1.56）
 *
 * increased 和 more 必须分开，这是流放之路数值能撑住几百小时的根因。
 * 混成一个「伤害加成」的话，后期必然要靠堆海量数值才能推进，曲线会崩。
 */

/** 五行标签在这里也要能当抗性 key 用，所以单独导出一份顺序 */
export type ElementStatKey = 'resMetal' | 'resWood' | 'resWater' | 'resFire' | 'resEarth';

export type StatKey =
  // ── 资源 ──
  | 'life' // 气血
  | 'mana' // 真元
  | 'shield' // 护体罡气
  // ── 回复 ──
  | 'lifeRegen' // 每秒气血回复
  | 'manaRegen' // 每秒真元回复
  | 'lifeOnHit' // 击中回气
  // ── 防御 ──
  | 'armor' // 护体
  | ElementStatKey // 五行抗性
  // ── 攻击 ──
  | 'damage' // 伤害（真正的结算在伤害管线里，见 core/damage.ts）
  | 'attackSpeed' // 出手速度
  | 'castSpeed' // 结印速度
  | 'critChance' // 破绽率
  | 'critMulti' // 破绽伤害倍率
  // ── 主属性 ──
  | 'body' // 体魄
  | 'agility' // 灵巧
  | 'spirit' // 神识
  // ── 通用 ──
  | 'moveSpeed' // 身法（移速）—— ⚠️ v1 未接线，禁止任何词缀/天赋/玉简再引用（D82）
  | 'area' // 范围
  | 'projectileSpeed' // 遁速（投射物速度）—— ⚠️ v1 未接线（本作神通即时结算，无投射物飞行），禁止引用（D82）
  // ── 本作特有 ──
  | 'turbid' // 浊气亲和：浊气积累速度与浊气收益
  // ── 产出 ──
  | 'lootRarity' // 仙缘（提高高品阶掉落概率）
  | 'lootQuantity' // 机缘（提高掉落数量）
  | 'xpGain'; // 修为获取

/** 抗性上限（%）：超过 75% 的部分不生效，需要「抗性上限提升」才放开 */
export const RESIST_CAP = 0.75;
/** 抗性上限可被「抗性上限提升」放开的最大值（周天图 resist-cap-plus 节点用） */
export const RESIST_CAP_BONUS_MAX = 0.05;
/** 破绽率上限 */
export const CRIT_CHANCE_CAP = 1.0;

export type StatKind = 'resource' | 'defense' | 'offense' | 'attribute' | 'utility' | 'loot';

export interface StatMeta {
  readonly key: StatKey;
  /** 修仙话术（UI 主显示） */
  readonly name: string;
  /** 一句话解释，给玩家 hover 用 */
  readonly desc: string;
  readonly kind: StatKind;
  /** true = 内部 0.05 表示 5%，UI 要乘 100 显示 */
  readonly ratio: boolean;
  /** 无任何修正器时的基础值 */
  readonly base: number;
  /** 值域下限（含） */
  readonly min: number;
  /** 值域上限（含），undefined = 不设上限 */
  readonly max?: number;
}

/**
 * 属性元数据表。
 *
 * 基础值是**占位值**（策划案纪律：数值必须标占位，否则落地时被当成承诺）。
 * 标定方法写在 docs/BALANCE.md，做完第一个可玩版本用真机十分钟反推。
 */
export const STAT_META: Readonly<Record<StatKey, StatMeta>> = {
  life: { key: 'life', name: '气血', desc: '生命值，降到 0 就身死道消', kind: 'resource', ratio: false, base: 100, min: 1 },
  mana: { key: 'mana', name: '真元', desc: '施展神通的消耗', kind: 'resource', ratio: false, base: 50, min: 0 },
  shield: { key: 'shield', name: '护体罡气', desc: '先于气血被消耗，脱战后自行恢复', kind: 'resource', ratio: false, base: 0, min: 0 },

  lifeRegen: { key: 'lifeRegen', name: '气血回复', desc: '每秒回复的气血', kind: 'resource', ratio: false, base: 0, min: 0 },
  // 基线 2 → 4（BALANCE §11.5 / §15.4）：2/s 时任何一条法术都续不上——
  // 寒水箭要 4.17/s、锋锐金芒要 4.5/s、浊焰咒 3.2/s，只有召唤浊犬（2.00/s）刚好。
  // 改成 4 之后「可单开一条法术」，6 条全开仍缺 11.87/s，那缺口是设计意图（法术被真元压在轮换位）。
  // 注意：这是**唯一出处**，core 里不许再写死 2（battle.ts 的 MANA_REGEN_PER_SEC 已改为引用本表）。
  manaRegen: { key: 'manaRegen', name: '真元回复', desc: '每秒回复的真元', kind: 'resource', ratio: false, base: 4, min: 0 },
  lifeOnHit: { key: 'lifeOnHit', name: '击中回气', desc: '每次命中回复的气血', kind: 'resource', ratio: false, base: 0, min: 0 },

  armor: { key: 'armor', name: '护体', desc: '减免无属性伤害，收益随敌人境界递减', kind: 'defense', ratio: false, base: 0, min: 0 },
  resMetal: { key: 'resMetal', name: '金抗', desc: '减免金属性伤害', kind: 'defense', ratio: true, base: 0, min: -1, max: RESIST_CAP },
  resWood: { key: 'resWood', name: '木抗', desc: '减免木属性伤害', kind: 'defense', ratio: true, base: 0, min: -1, max: RESIST_CAP },
  resWater: { key: 'resWater', name: '水抗', desc: '减免水属性伤害', kind: 'defense', ratio: true, base: 0, min: -1, max: RESIST_CAP },
  resFire: { key: 'resFire', name: '火抗', desc: '减免火属性伤害', kind: 'defense', ratio: true, base: 0, min: -1, max: RESIST_CAP },
  resEarth: { key: 'resEarth', name: '土抗', desc: '减免土属性伤害', kind: 'defense', ratio: true, base: 0, min: -1, max: RESIST_CAP },

  damage: { key: 'damage', name: '伤害', desc: '所有伤害的加成，实际结算见伤害管线', kind: 'offense', ratio: true, base: 0, min: 0 },
  attackSpeed: { key: 'attackSpeed', name: '出手速度', desc: '每秒攻击次数', kind: 'offense', ratio: true, base: 1.0, min: 0.1 },
  castSpeed: { key: 'castSpeed', name: '结印速度', desc: '每秒施法次数', kind: 'offense', ratio: true, base: 1.0, min: 0.1 },
  critChance: { key: 'critChance', name: '破绽率', desc: '命中破绽的概率', kind: 'offense', ratio: true, base: 0.05, min: 0, max: CRIT_CHANCE_CAP },
  critMulti: { key: 'critMulti', name: '破绽伤害', desc: '命中破绽时的伤害倍率', kind: 'offense', ratio: true, base: 1.5, min: 1 },

  body: { key: 'body', name: '体魄', desc: '每点提供气血与护体', kind: 'attribute', ratio: false, base: 0, min: 0 },
  agility: { key: 'agility', name: '灵巧', desc: '每点提供出手速度与闪避', kind: 'attribute', ratio: false, base: 0, min: 0 },
  spirit: { key: 'spirit', name: '神识', desc: '每点提供真元与破绽率', kind: 'attribute', ratio: false, base: 0, min: 0 },

  moveSpeed: { key: 'moveSpeed', name: '身法', desc: '移动速度倍率', kind: 'utility', ratio: true, base: 1.0, min: 0.1 },
  area: { key: 'area', name: '范围', desc: '范围技能的覆盖半径倍率', kind: 'utility', ratio: true, base: 1.0, min: 0.1 },
  projectileSpeed: { key: 'projectileSpeed', name: '遁速', desc: '投射物飞行速度倍率', kind: 'utility', ratio: true, base: 1.0, min: 0.1 },

  turbid: { key: 'turbid', name: '浊气亲和', desc: '浊气积累速度与收益的倍率', kind: 'utility', ratio: true, base: 1.0, min: 0.1 },

  lootRarity: { key: 'lootRarity', name: '仙缘', desc: '提高高品阶物品的出现概率', kind: 'loot', ratio: true, base: 0, min: -1 },
  lootQuantity: { key: 'lootQuantity', name: '机缘', desc: '提高掉落数量', kind: 'loot', ratio: true, base: 0, min: -1 },
  /**
   * 修为获取（**v1 没有消费方**）。
   *
   * `src/core/character.ts` 的 `gainXp` 只做 `addXp(step, xp, gain)`，不读任何属性；
   * 全库 grep `xpGain` 只有定义/术语/战力权重，没有一处是乘区（BALANCE §20.17 的消融实验：
   * 把天赋里四条 xpGain 换成 lootQuantity，满级时长一字不差）。
   *
   * 保留定义的理由：以后真做「顿悟 / 闭关加成」这类机制时不用重新定义一套 stat，
   * 而且 `ratio: true, base: 1.0` 的量纲是对的。但**在此之前，任何词缀/天赋/玉简
   * 都不许再引用它**——上一版「炼气」灵纹与四个 t-xp 天赋就是这么变成空词条的。
   *
   * 时长的唯一锚点是击杀率单通道（BALANCE §20.17.2）。
   */
  xpGain: { key: 'xpGain', name: '修为获取', desc: '获得的修为倍率（v1 未接线，勿引用）', kind: 'loot', ratio: true, base: 1.0, min: 0 },
};

/** 五行抗性 key（顺序 = 金木水火土），遍历时用这个不要自己拼 */
export const ELEMENT_STAT_KEYS: readonly ElementStatKey[] = [
  'resMetal',
  'resWood',
  'resWater',
  'resFire',
  'resEarth',
];

/** 主属性 key */
export const ATTR_STAT_KEYS: readonly StatKey[] = ['body', 'agility', 'spirit'];

/** 全部属性 key（存档校验、UI 遍历用） */
export const ALL_STAT_KEYS: readonly StatKey[] = Object.keys(STAT_META) as StatKey[];

/**
 * 按元数据把值夹到合法范围。
 *
 * `resistCapBonus`：只放开**五行抗性**的上限（周天图 `resist-cap-plus`），
 * 其它属性的 max 一律不动 —— 「抗性上限提升」不该顺手把破绽率/护甲也放开。
 */
export function clampStat(key: StatKey, value: number, resistCapBonus = 0): number {
  const m = STAT_META[key];
  if (!Number.isFinite(value)) return m.base;
  let v = value;
  const bonus = Number.isFinite(resistCapBonus) ? Math.min(Math.max(resistCapBonus, 0), RESIST_CAP_BONUS_MAX) : 0;
  const isResist = (ELEMENT_STAT_KEYS as readonly StatKey[]).includes(key);
  const max = m.max === undefined ? undefined : isResist ? m.max + bonus : m.max;
  if (v < m.min) v = m.min;
  if (max !== undefined && v > max) v = max;
  return v;
}

/** 把内部比值格式化成给玩家看的文字（0.075 → "7.5%"） */
export function formatStat(key: StatKey, value: number): string {
  const m = STAT_META[key];
  if (m.ratio) {
    const pct = value * 100;
    const digits = Math.abs(pct) >= 100 ? 0 : 1;
    return `${pct.toFixed(digits)}%`;
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
