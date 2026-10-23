/**
 * 术语表 —— 修仙话术的唯一来源。
 *
 * 为什么要单独一个文件：
 * 1. 需求文档原话「名词全部修仙式替换」，但**替换必须是全项目一致的**。
 *    如果这里写「气血」、那里写「生命」，玩家会以为这是两个东西。
 * 2. 改名字只改一处。后期想统一改风格（比如「气力」→「气血」）不用全仓搜索。
 * 3. 它逼着把世界观想清楚：每个词都得能「自圆其说」（需求文档原话）。
 *
 * 纪律：**业务代码和 UI 都不许直接写中文字符串**，一律 `TERM.xxx`。
 */

/** 内部 key → 修仙名。key 用英文，显示用这个。 */
export const TERM = {
  // ── 界面骨架 ──
  game: '浊仙',
  player: '浊脉修士',
  invincible: '身死道消',
  damage: '伤害',
  heal: '回复',
  crit: '破绽',
  critHit: '命中破绽',
  kill: '斩杀',
  respawn: '还魂',

  // ── 地图与进度 ──
  floor: '渊层', // 九幽魔渊的层数，也是关卡进度
  /**
   * 渊层阶位 = 按**层号**分的大段（1~9 / 10~18 / 19~27），术语上必须与「灵纹阶」分开叫。
   * 为什么非要另立一个词：灵纹阶按**灵蕴**分（`ilvlForFloor(f)=round(99f/27)`），
   * 层 10 的灵蕴已经是 37 = 地阶灵纹，而渊层阶位才刚到玄 —— 两套边界差约 5 层。
   * 只要 UI 笼统写「阶」，玩家必然把「玄阶的怪」和「玄阶灵纹」当成同一件事。
   */
  floorTier: '渊层阶位',
  abyss: '九幽魔渊',
  codex: '图鉴', // 收集度：浊物 + 传奇
  wave: '浊潮', // 每层内的波次
  boss: '镇守',
  bossOf: '镇守·',
  map: '秘境', // 流放之路式地图，中后期主要刷图入口

  // ── 角色成长 ──
  level: '境界',
  xp: '修为',
  xpGain: '修为获取',
  breakthrough: '突破', // 境界突破，永久不可逆，替代转生
  realm: '境界',
  tribulation: '天劫',

  // ── 资源 ──
  life: '气血',
  mana: '真元',
  shield: '护体罡气',
  turbid: '浊气',
  turbidCalm: '浊气平稳',
  turbidCorrupting: '浊化',
  turbidWeak: '道基虚弱',
  gold: '灵石',

  // ── 装备 ──
  item: '法宝',
  equip: '法宝',
  weapon: '法器',
  slot: '法宝位',
  affix: '灵纹', // = 词缀
  affixTier: '灵纹阶',
  ilvl: '灵蕴', // = 物品等级，决定能洗出多高阶的灵纹
  bag: '储物袋',
  stash: '洞府',
  upgrade: '炼器',
  combine: '合器',

  // ── 品阶（稀有度）──
  rarity: '品阶',
  rarityFan: '凡品',
  rarityLing: '灵品',
  rarityBao: '宝品',
  rarityXian: '仙品',

  // ── 技能 ──
  skill: '神通',
  skillStone: '神通玉简', // 主动技能石
  supportStone: '辅助玉简', // 辅助技能石
  skillTag: '道性', // 技能标签
  skillLevel: '神通阶',
  cooldown: '回转', // 冷却
  manaCost: '真元消耗',
  aura: '法域',
  summon: '御兽', // 召唤物

  // ── 天赋与职业 ──
  talent: '道行',
  talentTree: '周天图',
  talentPoint: '道点',
  ascendancy: '浊气觉醒',
  class: '道统',
  classOf: '道统·',

  // ── 怪物 ──
  monster: '浊物',
  elite: '凶煞',
  monsterAffix: '妖纹', // = 怪物词缀
  monsterRarity: '浊物品阶',

  // ── 通货 ──
  currency: '灵石',
  currencyAdd: '黄阶灵石', // 加一条灵纹
  currencyRemove: '灭灵石', // 随机删一条灵纹
  currencyReroll: '洗灵石', // 重洗全部灵纹
  currencyQuality: '淬灵石', // 提升灵纹数值

  // ── 其他系统 ──
  offline: '闭关', // 离线收益
  offlineEarnings: '闭关所得',
  lootFilter: '拾取玉简', // 掉落过滤器
  achievement: '道果',
  statPanel: '道体',
  damagePanel: '损伤详解', // 伤害拆解面板
  autoAdvance: '自动推演',
} as const;

/** 品阶 key → 显示名（与 src/data/rarity.ts 的 Rarity 对应） */
export const RARITY_TERM = {
  fan: TERM.rarityFan,
  ling: TERM.rarityLing,
  bao: TERM.rarityBao,
  xian: TERM.rarityXian,
} as const;

/** 五行 key → 显示名（图鉴/详情面板用；写死字符串会拼出「metal行」这种东西） */
export const ELEMENT_TERM = {
  metal: '金',
  wood: '木',
  water: '水',
  fire: '火',
  earth: '土',
} as const;

/**
 * 九层魔渊的层名 —— 每一层都是被浊气封存的一段「正常时光」。
 * 这是暗黑味最浓的地方：玩家会意识到这里曾经不是这样。
 */
export const FLOOR_TERM: readonly string[] = [
  '废弃坊市',
  '尸解坑',
  '断剑宗',
  '药王谷遗址',
  '浊丹炉海',
  '万妖巢',
  '堕修邪城',
  '太清废墟',
  '渡劫台',
];

/** 每层镇守的名字 */
export const FLOOR_BOSS_TERM: readonly string[] = [
  '市侩鬼',
  '收尸人',
  '残剑',
  '药人',
  '炉主',
  '妖王',
  '邪城之主',
  '守碑人',
  '玄冥',
];

/** 九大境界（凡人流标准，源自《凡人修仙传》确立的体系） */
export const REALM_TERM: readonly string[] = [
  '练气',
  '筑基',
  '金丹',
  '元婴',
  '化神',
  '炼虚',
  '合体',
  '大乘',
  '渡劫',
];

/** 每个境界九重，所以「境界 + 重」= 81 个台阶 */
export const REALM_STAGE_TERM: readonly string[] = [
  '一重',
  '二重',
  '三重',
  '四重',
  '五重',
  '六重',
  '七重',
  '八重',
  '九重',
];

/** 把 0..80 的台阶序号格式化成「金丹·三重」 */
export function formatRealm(step: number): string {
  // NaN 必须单独挡：Math.max(0, Math.min(80, NaN)) 的结果是 NaN，
  // 会一路传到 REALM_TERM[NaN] 变成 undefined，界面上显示成「undefined·undefined」。
  const n = Number.isFinite(step) ? Math.floor(step) : 0;
  const s = Math.max(0, Math.min(REALM_TERM.length * REALM_STAGE_TERM.length - 1, n));
  const realm = Math.floor(s / REALM_STAGE_TERM.length);
  const stage = s % REALM_STAGE_TERM.length;
  return `${REALM_TERM[realm]}·${REALM_STAGE_TERM[stage]}`;
}

/** 六大道统（= 6 职业）。第一版只开前三个，架构按 6 个留位。 */
export const CLASS_TERM: readonly string[] = [
  '御剑堂', // 剑修：近战、高爆发
  '御兽堂', // 御兽：召唤物、持续输出
  '焚炎堂', // 火修：范围、灼烧
  '玄水阁', // 水修：控制、回复
  '厚土宗', // 体修：护甲、反击
  '锐金门', // 金修：暴击、破甲
];

/** 八条浊气觉醒（每个道统至少一条；第一版只做前三条） */
export const ASCENDANCY_TERM: readonly string[] = [
  '浊剑', // 御剑堂
  '浊兽', // 御兽堂
  '浊炎', // 焚炎堂
  '浊水', // 玄水阁
  '浊体', // 厚土宗
  '浊金', // 锐金门
  '浊心', // 通用
  '浊骨', // 通用
];
