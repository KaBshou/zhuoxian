/**
 * 六大道统（职业）。
 *
 * 设计原则（用户 m03123 拍板 D1）：
 * 差异化只靠三样东西，**不给每个职业写专属技能表**：
 * 1. 被动加成方式（本文件的 `passives`）
 * 2. 周天图（天赋树）起点不同（`talentStart`）
 * 3. 可用神通池不同（`skillTags` 决定它更容易拿到什么道性的玉简）
 *
 * 为什么不做专属技能表：6 个职业 × 专属技能 = 平衡工作量爆炸，
 * 而且玩家会立刻问「为什么御剑堂不能学火球」。
 * 流放之路的做法是所有人共用技能池、靠天赋和辅助石长成不同样子 —— 照抄这个。
 *
 * ⚠️ 数值全是占位，等 BALANCE.md 定稿后由数值策划重标。
 */

import type { Modifier } from '../core/modifier';
import type { StatKey } from './stats';
import type { Tag } from './tags';

export type ClassId = 'yujian' | 'yushou' | 'fenyin' | 'xuanshui' | 'houtu' | 'ruijin';

export const CLASS_IDS: readonly ClassId[] = [
  'yujian',
  'yushou',
  'fenyin',
  'xuanshui',
  'houtu',
  'ruijin',
];

/** 三主属性 */
export interface Attributes {
  /** 体魄：加气血、护体 */
  readonly body: number;
  /** 灵巧：加出手速度、身法、破绽率 */
  readonly agility: number;
  /** 神识：加真元、范围、五行穿透 */
  readonly spirit: number;
}

export interface AscendancyDef {
  readonly id: string;
  readonly name: string;
  readonly desc: string;
  /** 具体加成。**必须是 Modifier**，不许写特判代码 */
  readonly effects: readonly Modifier[];
}

export interface ClassDef {
  readonly id: ClassId;
  /** 修仙名，如「御剑堂」 */
  readonly name: string;
  /** 一句话定位（显示在选道统界面） */
  readonly tagline: string;
  /** 详情说明 */
  readonly desc: string;
  /** 主属性 —— 决定这个道统每级多涨哪一项 */
  readonly primary: keyof Attributes;
  /** 属性权重：转成属性点时的相对比例 */
  readonly attrWeight: Attributes;
  /** 起始主属性 */
  readonly baseAttrs: Attributes;
  /** 这个道统更容易出什么道性的玉简（决定主动神通池） */
  readonly skillTags: readonly Tag[];
  /** 周天图（天赋树）起点编号。6 个职业从图上不同位置起步 */
  readonly talentStart: number;
  /** 浊气觉醒路线（第一版每条线一个） */
  readonly ascendancy: AscendancyDef;
}

/** 六道统。名字与 glossary.ts 的 CLASS_TERM 保持一致 */
export const CLASSES: readonly ClassDef[] = [
  {
    id: 'yujian',
    name: '御剑堂',
    tagline: '一剑破万法，攻高防低',
    desc: '御剑堂不修护体，只修锋芒。出手极快，破绽率高，但被贴脸时很脆。适合喜欢"打得快、死得快"的玩家。',
    primary: 'agility',
    attrWeight: { body: 1, agility: 3, spirit: 1 },
    baseAttrs: { body: 10, agility: 14, spirit: 8 },
    skillTags: ['attack', 'melee', 'metal'],
    talentStart: 0,
    ascendancy: {
      id: 'asc-zhuojian',
      name: '浊剑',
      desc: '浊气凝于剑锋。破绽伤害 +35%（加在基础的 1.5 倍之上）。',
      effects: [{ stat: 'critMulti', op: 'flat', value: 0.35, source: { kind: 'ascend', label: '浊剑' } }],
    },
  },
  {
    id: 'yushou',
    name: '御兽堂',
    tagline: '浊犬开路，本人在后',
    desc: '御兽堂以浊气养成召唤物，自己在后面下指令。召唤物吃同一套伤害管线，所以"召唤物伤害"这个词条是真生效的。',
    primary: 'spirit',
    attrWeight: { body: 2, agility: 1, spirit: 3 },
    baseAttrs: { body: 11, agility: 9, spirit: 14 },
    skillTags: ['summon', 'spell', 'wood'],
    talentStart: 20,
    ascendancy: {
      id: 'asc-zhuoshou',
      name: '浊兽',
      desc: '你把气血喂给浊兽：伤害 +30%，但气血上限 −20%。打得狠，也薄。',
      effects: [
        { stat: 'damage', op: 'increased', value: 0.3, source: { kind: 'ascend', label: '浊兽' } },
        { stat: 'life', op: 'increased', value: -0.2, source: { kind: 'ascend', label: '浊兽' } },
      ],
    },
  },
  {
    id: 'fenyin',
    name: '焚炎堂',
    tagline: '一把火烧到渊底',
    desc: '焚炎堂专修火法，范围大、爆发高、消耗真元也快。清怪最快，打单体 Boss 略吃力。',
    primary: 'spirit',
    attrWeight: { body: 1, agility: 1, spirit: 4 },
    baseAttrs: { body: 9, agility: 10, spirit: 15 },
    skillTags: ['spell', 'area', 'fire'],
    talentStart: 40,
    ascendancy: {
      id: 'asc-zhuoyan',
      name: '浊炎',
      desc: '火焰伤害 +40%。烧得越旺，离浊化越近。',
      effects: [{ stat: 'damage', op: 'increased', value: 0.4, tags: ['fire'], source: { kind: 'ascend', label: '浊炎' } }],
    },
  },
  {
    id: 'xuanshui',
    name: '玄水阁',
    tagline: '以水养身，久战不衰',
    desc: '玄水阁修回复与护体罡气，单体伤害不算高，但续航最强，越难的秘境越体现价值。',
    primary: 'spirit',
    attrWeight: { body: 2, agility: 1, spirit: 3 },
    baseAttrs: { body: 12, agility: 10, spirit: 13 },
    skillTags: ['spell', 'water', 'aura'],
    talentStart: 60,
    ascendancy: {
      id: 'asc-zhuoshui',
      name: '浊水',
      desc: '气血回复 +50%（乘算）。别人怕浊气，你靠它活。',
      effects: [{ stat: 'lifeRegen', op: 'more', value: 0.5, source: { kind: 'ascend', label: '浊水' } }],
    },
  },
  {
    id: 'houtu',
    name: '厚土宗',
    tagline: '站着不动，让你打',
    desc: '厚土宗堆护体与气血，伤害低但极难打死。自动战斗挂机最省心的道统，适合放置玩家。',
    primary: 'body',
    attrWeight: { body: 4, agility: 1, spirit: 1 },
    baseAttrs: { body: 15, agility: 8, spirit: 11 },
    skillTags: ['attack', 'melee', 'earth'],
    talentStart: 80,
    ascendancy: {
      id: 'asc-zhuoti',
      name: '浊体',
      desc: '护体罡气上限 +50%。把最危险的时刻变成最厚的时刻。',
      effects: [{ stat: 'shield', op: 'more', value: 0.5, source: { kind: 'ascend', label: '浊体' } }],
    },
  },
  {
    id: 'ruijin',
    name: '锐金门',
    tagline: '五行之中，金最利',
    desc: '锐金门修金属性穿透，专破高抗性的敌人。对其他属性抗性高的怪物时，别的道统刮痧，它照打。',
    primary: 'agility',
    attrWeight: { body: 2, agility: 3, spirit: 2 },
    baseAttrs: { body: 11, agility: 13, spirit: 10 },
    skillTags: ['attack', 'single', 'metal'],
    talentStart: 100,
    ascendancy: {
      id: 'asc-zhuojin',
      name: '浊金',
      desc: '金属性伤害 +25%。代价：自身木抗 −30%（金克木，反噬己身）。',
      effects: [
        { stat: 'damage', op: 'increased', value: 0.25, tags: ['metal'], source: { kind: 'ascend', label: '浊金' } },
        { stat: 'resWood', op: 'flat', value: -0.3, source: { kind: 'ascend', label: '浊金' } },
      ],
    },
  },
];

const BY_ID = new Map<ClassId, ClassDef>(CLASSES.map((c) => [c.id, c]));

export function getClass(id: ClassId): ClassDef | undefined {
  return BY_ID.get(id);
}

export function isClassId(x: unknown): x is ClassId {
  return typeof x === 'string' && BY_ID.has(x as ClassId);
}

/** 属性 → 修正器。体魄/灵巧/神识各自换算成实际属性 */
export function attributeModifiers(attrs: Attributes): Modifier[] {
  const src = { kind: 'base' as const, label: '属性' };
  const body = safe(attrs.body);
  const agility = safe(attrs.agility);
  const spirit = safe(attrs.spirit);
  return [
    // D3 主属性换算（BALANCE v2 §10 最终口径，shuzhi 定稿 2026-10-22）：
    // 体魄 +3 气血 +1 护体 / 灵巧 +0.25% 出手速度 / 神识 +2 真元 +0.15% 破绽率。
    // 旧表（体魄 8/3、灵巧 0.01 攻速…）作废 —— 那套把 critChance/moveSpeed/area 也
    // 挂在属性上，主属性和灵纹抢同一条通道，60 点神识就给 +30% 破绽，超规格。
    { stat: 'life', op: 'flat', value: body * 3, source: src },
    { stat: 'armor', op: 'flat', value: body * 1, source: src },
    { stat: 'attackSpeed', op: 'flat', value: agility * 0.0025, source: src },
    { stat: 'mana', op: 'flat', value: spirit * 2, source: src },
    { stat: 'critChance', op: 'flat', value: spirit * 0.0015, source: src },
  ];
}

function safe(n: number): number {
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/** 校验道统表（6 个、id 不重复、起点不撞） */
export function validateClasses(list: readonly ClassDef[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  const starts = new Set<number>();
  for (const c of list) {
    if (seen.has(c.id)) problems.push(`道统 id 重复：${c.id}`);
    seen.add(c.id);
    if (!c.name.trim()) problems.push(`${c.id} 没有名字`);
    if (c.ascendancy.effects.length === 0) problems.push(`${c.id} 的浊气觉醒没有任何效果`);
    for (const e of c.ascendancy.effects) {
      if (!Number.isFinite(e.value)) problems.push(`${c.id} 的觉醒效果数值不是有限数`);
      if (e.source?.kind !== 'ascend') problems.push(`${c.id} 的觉醒效果来源必须是 ascend`);
    }
    if (starts.has(c.talentStart)) problems.push(`周天图起点重复：${c.talentStart}（两个道统会长得一样）`);
    starts.add(c.talentStart);
    if (c.skillTags.length === 0) problems.push(`${c.id} 没有任何道性标签，拿不到神通`);
  }
  if (list.length !== 6) problems.push(`道统数量应为 6，实际 ${list.length}`);
  return problems;
}
