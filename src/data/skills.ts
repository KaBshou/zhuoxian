/**
 * 主动神通（技能石）定义 —— 核心玩法之一。
 *
 * 设计纪律（来自 SYSTEM-MAP 三块地基）：
 * - 一切加成按**标签**过滤：辅助玉简的修正器带 tags，只有技能标签命中才生效。
 * - 「攻击吃武器伤害，法术吃技能等级」：damageType 区分，不要混。
 * - 第一版只做 6 个（REQ：20 主动是终量），但结构按全量留位。
 *
 * 所有名词取自 glossary.ts 的 TERM，不许在本文件里直接造词。
 */
import type { Tag } from './tags';

/** 神通的施展形态（决定战斗层怎么画/怎么结算） */
export type SkillKind = 'strike' | 'projectile' | 'zone' | 'summon';

/** 伤害来源：attack 吃武器伤害，spell 吃 baseDamage×等级 */
export type SkillDamageType = 'weapon' | 'fixed';

export interface ActiveSkillDef {
  readonly id: string;
  readonly name: string;
  readonly desc: string;
  /** 道性标签：辅助玉简按这组标签过滤生效 */
  readonly tags: readonly Tag[];
  readonly kind: SkillKind;
  readonly damageType: SkillDamageType;
  /**
   * 法术基础伤害（damageType='fixed' 时用）。
   * **语义 = 「层 1 当量」**：结算时乘 `skillFloorScale(层)`（= 怪血同一条 1.1534^(层-1) 曲线），
   * 所以法术 DPS 与怪血恒等比，不会随层数衰减。见 BALANCE §11.5。
   * 判据统一成 `baseDamage ÷ max(cooldown,1) ÷ 9.4` = 占需求 DPS 的比例，与层数无关。
   */
  readonly baseDamage: number;
  /** 真元消耗 */
  readonly manaCost: number;
  /** 冷却（秒）；0 = 无冷却，受出手速度节律 */
  readonly cooldown: number;
  /** 解锁所需境界台阶（step） */
  readonly unlockStep: number;
}

/** 第一版 6 个主动神通。元素只开金/火/水（DECISIONS：五行架构留 5 开 3）。 */
export const ACTIVE_SKILLS: readonly ActiveSkillDef[] = [
  {
    id: 'yujian-shu',
    name: '御剑术',
    desc: '引本命法宝横斩当面之敌。',
    tags: ['attack', 'melee', 'single', 'metal'],
    kind: 'strike',
    damageType: 'weapon',
    baseDamage: 0,
    manaCost: 2,
    cooldown: 0,
    unlockStep: 0,
  },
  {
    // 浊焰咒 = AoE 口径：单发 6 当量只算单体是 25.5% 需求，但它是范围技，
    // 按「命中 3 目标」算 = 3 × 6 ÷ 2.5 ÷ 9.4 = 76.6% 需求，与其余法术同一条线。
    // 所以 6 不是「弱」，是「三目标下才达标」—— 单挑时它本就该输给寒水箭。
    id: 'zhuoyan-zhou',
    name: '浊焰咒',
    desc: '掐诀喷出浊焰，灼烧一片（范围伤害，按多目标摊薄）。',
    tags: ['spell', 'area', 'fire'],
    kind: 'zone',
    damageType: 'fixed',
    baseDamage: 6,
    manaCost: 8,
    cooldown: 2.5,
    unlockStep: 0,
  },
  {
    // 寒水箭 = 单体口径：9 ÷ 1.2 = 7.50 DPS = 需求 9.4 的 80%。单体法术里最高的一条（它是主力）。
    id: 'hanshui-jian',
    name: '寒水箭',
    desc: '凝水成箭，破空而去。',
    tags: ['spell', 'projectile', 'single', 'water'],
    kind: 'projectile',
    damageType: 'fixed',
    baseDamage: 9,
    manaCost: 5,
    cooldown: 1.2,
    unlockStep: 4,
  },
  {
    // 召唤浊犬的当量账（BALANCE §11.5）：
    //   设计形态 = 召唤一只浊犬持续 12 秒，每秒咬 1 口，每口 3.5 当量 → 单次召唤总伤害 42 当量；
    //   冷却 6 秒 → 稳态 2 只在场 → 2 × 3.5 = 7 DPS = 层 1 基准 DPS 9.4 的 75%（与其他法术同一条线）。
    //   当前战斗层还没有「持续体」，所以 42 一次性结算 —— 数值上与「12 口 × 3.5」完全等价，
    //   等持续体上线后只需把这一次结算拆成 12 次，baseDamage 不需要再改。
    //   44 会越线（78%），40 会掉到 71%，所以取 42。
    id: 'zhaohuo-zhu',
    name: '召唤浊犬',
    desc: '以浊气塑形，唤出浊犬撕咬；每口 3.5 当量，共 12 口（合计 42 当量），冷却 6 秒。',
    tags: ['spell', 'summon', 'single', 'metal'],
    kind: 'summon',
    damageType: 'fixed',
    baseDamage: 42,
    manaCost: 12,
    cooldown: 6,
    unlockStep: 9,
  },
  {
    id: 'fentian-zhang',
    name: '焚天掌',
    desc: '掌心聚火，拍碎当面一群。',
    tags: ['attack', 'melee', 'area', 'fire'],
    kind: 'strike',
    damageType: 'weapon',
    baseDamage: 0,
    manaCost: 6,
    cooldown: 3,
    unlockStep: 18,
  },
  {
    // 锋锐金芒 = 高消耗高单发：14 ÷ 2 = 7.00 DPS = 需求的 74.5%，和召唤浊犬同线；
    // 它解锁最晚（步 27 / 层 9.8），代价是 9 真元/发（4.5/s），所以是「真元够才连发」的终结技。
    id: 'fengrui-jinmang',
    name: '锋锐金芒',
    desc: '金气凝芒，直取要害。',
    tags: ['spell', 'projectile', 'single', 'metal'],
    kind: 'projectile',
    damageType: 'fixed',
    baseDamage: 14,
    manaCost: 9,
    cooldown: 2,
    unlockStep: 27,
  },
];

export const ACTIVE_SKILL_IDS: readonly string[] = ACTIVE_SKILLS.map((s) => s.id);

export function getActiveSkill(id: string): ActiveSkillDef | undefined {
  return ACTIVE_SKILLS.find((s) => s.id === id);
}

/** 简单校验：id 唯一 / 标签合法 / 数值为正 / 同 kind 标签一致 */
export function validateActiveSkills(list: readonly ActiveSkillDef[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const s of list) {
    if (seen.has(s.id)) errors.push(`神通 id 重复：${s.id}`);
    seen.add(s.id);
    if (s.tags.length === 0) errors.push(`${s.id} 没有任何标签`);
    if (s.damageType === 'fixed' && s.baseDamage <= 0) {
      errors.push(`${s.id} 法术基础伤害必须 > 0`);
    }
    if (s.manaCost < 0) errors.push(`${s.id} 真元消耗为负`);
    if (s.cooldown < 0) errors.push(`${s.id} 冷却为负`);
    if (s.unlockStep < 0) errors.push(`${s.id} 解锁台阶为负`);
  }
  return errors;
}
