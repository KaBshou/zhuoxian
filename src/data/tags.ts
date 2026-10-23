/**
 * 标签表 —— 整个游戏最底层的一张表。
 *
 * 为什么需要它：流放之路式装备系统的核心是「一条词缀只能影响带某种标签的东西」。
 * 例：`+20% 法术伤害` 只作用于带 `法术` 标签的伤害实例；
 *     `召唤浊犬` 一个技能里 `撕咬`（单体）和 `猛扑`（范围）是两个伤害实例，标签不同，
 *     所以「范围伤害」只加成 `猛扑`，不加成 `撕咬`。
 *
 * 没有这张表，60 个辅助技能石 × 20 个主动技能 = 上千条手写 if 分支，没人测得完。
 *
 * 纪律：**新增标签必须在这里加，不许在业务代码里现写字符串**。
 * 因为标签是字符串，写错一个字母编译器不会报错，但那条词缀会永远不生效。
 */

/** 施放方式：这个伤害是「用武器打的」还是「用神通打出来的」 */
export type CastTag = 'attack' | 'spell' | 'summon' | 'dot' | 'aura';

/** 形状：这个伤害打几个人、怎么打到 */
export type ShapeTag = 'single' | 'area' | 'projectile' | 'melee' | 'chain';

/** 五行：这个伤害属于哪一种属性 */
export type ElementTag = 'metal' | 'wood' | 'water' | 'fire' | 'earth';

export type Tag = CastTag | ShapeTag | ElementTag;

/** 五行标签，运行时判断「吃五行抗性还是吃护甲」要用 */
export const ELEMENT_TAGS: readonly ElementTag[] = ['metal', 'wood', 'water', 'fire', 'earth'];

export const CAST_TAGS: readonly CastTag[] = ['attack', 'spell', 'summon', 'dot', 'aura'];
export const SHAPE_TAGS: readonly ShapeTag[] = ['single', 'area', 'projectile', 'melee', 'chain'];

/** 全部标签，给 UI 和校验用 */
export const ALL_TAGS: readonly Tag[] = [...CAST_TAGS, ...SHAPE_TAGS, ...ELEMENT_TAGS];

const TAG_SET: ReadonlySet<string> = new Set<string>(ALL_TAGS);

/** 校验一个字符串是不是合法标签（存档读回来的标签要过这一道） */
export function isTag(x: unknown): x is Tag {
  return typeof x === 'string' && TAG_SET.has(x);
}

/**
 * 目标的标签是否包含修正器的全部条件标签。
 *
 * 空条件 = 无条件生效（任何伤害都吃）。
 * 这是整套系统的判定核心，只有这一个函数，不要在任何地方另写一套。
 */
export function matchesTags(
  targetTags: readonly Tag[] | undefined,
  required: readonly Tag[] | undefined,
): boolean {
  if (!required || required.length === 0) return true;
  if (!targetTags || targetTags.length === 0) return false;
  for (const need of required) {
    if (!targetTags.includes(need)) return false;
  }
  return true;
}

/**
 * 从一个伤害实例的标签里找出它的五行属性。
 *
 * 返回 null = 这个伤害「无属性」（物理），吃护甲而不是吃五行抗性。
 * 多个五行标签同时存在时取第一个 —— 一个伤害实例只应该有一种属性，
 * 靠「附加伤害」拆成多个实例，不要在一个实例上挂两个五行。
 */
export function elementOf(tags: readonly Tag[]): ElementTag | null {
  for (const t of tags) {
    if ((ELEMENT_TAGS as readonly string[]).includes(t)) return t as ElementTag;
  }
  return null;
}

/** 标签的修仙话术（给 UI 和伤害拆解面板显示用） */
export const TAG_NAME: Readonly<Record<Tag, string>> = {
  attack: '攻击',
  spell: '法术',
  summon: '召唤',
  dot: '持续伤害',
  aura: '光环',
  single: '单体',
  area: '范围',
  projectile: '投射物',
  melee: '近战',
  chain: '连锁',
  metal: '金',
  wood: '木',
  water: '水',
  fire: '火',
  earth: '土',
};
