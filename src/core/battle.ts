/**
 * 自动战斗 —— 全游戏唯一一处「时间流过，血量怎么变」的地方。
 *
 * 三条设计纪律：
 *
 * 1. **不读画面、不认渲染**。这个文件只做数学：谁打了谁、掉多少血、谁死了。
 *    所以离线收益可以拿它在没有 canvas 的情况下直接跑 8 小时；
 *    也可以单测里精确断言「12 秒后这只怪剩多少血」。
 *
 * 2. **战斗全自动，但不许有信息差**。玩家不做操作，但每一个决策（浊气何时停、
 *    换哪件装备）都依赖"我能看懂刚才发生了什么"。所以每次结算都往 `events` 里写一条，
 *    UI 直接拿去出浮字和战斗日志。
 *
 * 3. **玩家站桩，怪走过来**。这是放置类的最小可信模型：
 *    如果玩家也要走位，离线就没法算了（离线没有"走位"这个概念）。
 *    想加位移的玩法，必须是"额外技能"，不能影响普攻循环。
 */

import {
  computeDamage,
  type DamageResult,
  type DefenseProfile,
} from './damage';
import { aggregate, applyAggregate, type Modifier } from './modifier';
import {
  CORRUPTION_DURATION,
  TURBID_DAMAGE_BONUS,
  tickTurbid,
  turbidMultiplier,
  turbidTakenMultiplier,
  type TurbidState,
} from './turbid';
import {
  characterModifiers,
  characterStats,
  baseDamage,
  characterGemLoadout,
  type CharacterState,
} from './character';
import { switchOverridesFor, type TalentSwitchOverrides } from './talents-runtime';
import { legendaryFlags } from './item';
import { STAT_META, type ElementStatKey } from '../data/stats';
import type { ElementTag, Tag } from '../data/tags';
import type { MonsterDef, MonsterRarity } from '../data/monsters';
import { sumMonsterAffixes } from '../data/monster-affixes';
import { cycleDmgMul, cycleHpMul, effectiveCycle } from '../data/cycles';
import { rollMonsterIdentity, shouldSpawnVariant } from './monster-roll';
import {
  BASE_MONSTER_DAMAGE,
  threatMul,
  BASE_MONSTER_HP,
  BOSS_ATTACK_INTERVAL,
  BOSS_REGEN_PERIOD,
  BOSS_HP_MUL,
  BOSS_REGEN_RATIO,
  bossHpMul,
  bossXpMulOfTier,
  scaleOfFloor,
  skillFloorScale,
  tierOfFloor,
  xpPerKill,
} from '../data/monsters';
import type { Rng } from './rng';
import type { ActiveSkillDef } from '../data/skills';
import { unlockedSkills } from './skills-runtime';
import { gemModifiersFor, gemCostMulFor, getSupportGem } from '../data/support-gems';

/** 战场尺寸（和 step1 的 960x540 保持一致，渲染层直接复用） */
export const BATTLE_W = 960;
export const BATTLE_H = 540;

/** 每次命中获得的浊气 */
export const TURBID_PER_HIT = 2.5;
/** 真元回复（每秒）基线。引用 STAT_META.manaRegen.base（唯一出处），
 *  等级带来的真元回复成长由修正器管线加在它上面。
 *  （BALANCE v2 §11.5 / B1：基线 2→4，法术才能单开一条持续用。
 *   之前这里自己写了个 2，stats.ts 改基线时这里就漂 —— 两处写数必漂。） */
export const MANA_REGEN_PER_SEC = STAT_META.manaRegen.base;
/** 每次击杀获得的浊气 */
export const TURBID_PER_KILL = 6;

// ────────────────────────────────────────────────────────────
// 罡气回充（D103 / BALANCE §5.10）
// ────────────────────────────────────────────────────────────
//
// REQ §3 第 3 条原文是「能量护盾（**可随时间再生的**生命值）」。D103 之前 `shield` 只做
// 一次性吸收、永不回复 ⇒ 天赋与词缀发的护盾实际是「一次性血包」，不是护盾。
//
// 参数不是口味问题，是看着**波次结构的真实无伤窗口**定的：
//   波末 `WAVE_GAP = 0.9s` + 新怪从环上走到攻击距离约 2.5s ⇒ 窗口 ≈ 3.4s。
//   延迟若写 4s 就整个落在窗口外 —— 面板看得见、实战一次不回，又是一个死属性
//   （项目第 6 次撞同款形状：castSpeed / xpGain / 厚皮 / 判据快照 / 跨帧测量）。
/** 脱战多久才开始回充（秒） */
export const SHIELD_RECHARGE_DELAY = 3.0;
/** 回充速率的第一个钳制：上限 ÷ 这个数（每秒），防止护盾本身很大时回得太快 */
export const SHIELD_RECHARGE_DIVISOR = 4;
/** 回充速率的第二个钳制：每秒最多回最大气血的这个比例，防止「护盾/气血比失衡」的 build 白拿 EHP */
export const SHIELD_RECHARGE_LIFE_RATIO = 0.05;

/** 每秒回充量 = min(上限/4, 5% 最大气血)。导出给面板/测试用，战斗里不许另写一份 */
export function shieldRechargeRate(shieldMax: number, maxHp: number): number {
  const pool = Math.max(0, finite(shieldMax, 0));
  const life = Math.max(0, finite(maxHp, 0));
  return Math.min(pool / SHIELD_RECHARGE_DIVISOR, SHIELD_RECHARGE_LIFE_RATIO * life);
}

/** 玩家的战斗态（由 CharacterState 派生，不进存档） */
export interface PlayerBattle {
  hp: number;
  maxHp: number;
  /** 当前罡气（护盾）—— 会被入伤先吃掉，脱战后按 `SHIELD_*` 规则回充 */
  shield: number;
  /** 罡气上限（面板 `shield` 属性的解析值；回充只补到这里，不过顶） */
  shieldMax: number;
  /** 距上一次受伤过了多少秒（受击清零；到 `SHIELD_RECHARGE_DELAY` 才开始回充） */
  shieldIdle: number;
  /** 境界台阶 + 1，喂给护甲公式的「目标境界」 */
  level: number;
  armor: number;
  resist: Partial<Record<ElementStatKey, number>>;
  /** 基础攻击力 */
  damage: number;
  /** 每秒攻击次数 */
  attackSpeed: number;
  /** 每秒结印次数（只作用于 spell 类神通冷却；D78 前是死属性） */
  castSpeed: number;
  critChance: number;
  /** 攻击距离（像素） */
  range: number;
  /** 普攻的道性标签（空数组 = 无属性，走护甲） */
  tags: readonly Tag[];
  modifiers: readonly Modifier[];
  /** 每秒气血回复（灵纹「气血回复」在这里生效） */
  lifeRegen: number;
  /** 每次命中回复多少气血（灵纹「击中回气」在这里生效） */
  lifeOnHit: number;
  /** 传奇「血祭」：每次击杀回复最大气血的比例（0 = 没有） */
  killHeal: number;
  /** 传奇「双影」：普攻追加一击的概率（0 = 没有） */
  doubleStrike: number;
  /** 传奇「浊魄」：浊气伤害加成上限的额外值（0 = 没有） */
  boomMore: number;
  /** 当前真元（战斗态，不入档） */
  mana: number;
  /** 真元上限（面板 STAT_META.mana 的值） */
  maxMana: number;
  /** 站位（站桩，不动） */
  x: number;
  y: number;
}

/** 一只在场的浊物 */
export interface MonsterInPlay {
  readonly uid: number;
  readonly defId: string;
  readonly name: string;
  readonly rarity: MonsterRarity;
  /** 妖纹 id（空 = 普通浊物）。只存 id，效果已在生成时乘进下面几个数值。
   *  可选：手工构造的怪（单测/探针）可以不给 —— 效果已经烘进数值，这里只给 UI 用。 */
  readonly affixIds?: readonly string[];
  /** 异变体（D160）：额外带 1 条同类妖纹 + 掉落数量 +10%；只给 UI/掉落用，数值已烘进上面几项 */
  readonly variant?: boolean;
  readonly element: ElementTag;
  readonly tier: number;
  hp: number;
  readonly maxHp: number;
  readonly damage: number;
  readonly armor: number;
  readonly resist: Partial<Record<ElementStatKey, number>>;
  readonly speed: number;
  readonly attackInterval: number;
  /** 镇守战内自回计时器（非镇守恒 0；可选 = 测试手搓怪不用关心它） */
  bossRegenTimer?: number;
  readonly attackRange: number;
  readonly size: number;
  readonly xp: number;
  /** 位置（运行时态，不进存档） */
  x: number;
  y: number;
  /** 攻击冷却剩余秒数 */
  cooldown: number;
}

/**
 * 一次伤害的拆解留痕（「损伤详解」面板的数据源）。
 *
 * 它不是新算的东西：computeDamage 每一步本身就留了 steps，
 * 这里只负责把"最近一次打出去的那一下"存下来给 UI 读。
 */
export interface DamageBreakdown {
  /** 用什么打的、打的谁（如「御剑术 → 坊市怨客」） */
  readonly label: string;
  readonly amount: number;
  readonly isCrit: boolean;
  readonly steps: readonly { label: string; before: number; after: number; note?: string }[];
}

export type BattleEventKind =
  | 'player-hit'
  | 'player-crit'
  | 'player-kill'
  | 'monster-hit'
  | 'player-died'
  | 'monster-spawn';

/**
 * 击杀事件里带上的「死的是谁」。
 *
 * 为什么要有：战斗层只负责"谁死了"，掉落和修为是上层的事。
 * 但上层如果不认识这只怪（不知道 defId / 阶数 / 凶煞等级），就没法算掉落。
 * 所以击杀事件必须把自己的身份牌一起交出去 —— 而不是让上层去猜。
 */
export interface KilledMonster {
  readonly defId: string;
  readonly tier: number;
  readonly rarity: MonsterRarity;
  /** 妖纹 id（空/未定义 = 普通浊物）。掉落数量加成靠它，不靠 rarity 反推 */
  readonly affixIds?: readonly string[];
  /** 异变体（D160）：掉落数量额外 +10%（独立于 MONSTER_QTY_CAP，见 session 的 q 计算） */
  readonly variant?: boolean;
  readonly xp: number;
  readonly x: number;
  readonly y: number;
}

export interface BattleEvent {
  readonly kind: BattleEventKind;
  /** 直接能显示的中文（浮字 / 战斗日志用） */
  readonly label: string;
  readonly amount?: number;
  readonly x?: number;
  readonly y?: number;
  /** 只在 player-kill 上有 */
  readonly monster?: KilledMonster;
}

export interface BattleState {
  /**
   * 玩家战斗态。**可变**：突破和换装会改变上限与加成，
   * 必须能原地同步，否则「升了境界但伤害没变」这种 bug 会静默存在。
   */
  player: PlayerBattle;
  readonly turbid: TurbidState;
  /** 开关覆盖：爆发期伤害加成（默认 TURBID_DAMAGE_BONUS） */
  readonly boomBonus: number;
  /** 开关覆盖：爆发时长（默认 CORRUPTION_DURATION） */
  readonly corruptionDur: number;
  monsters: MonsterInPlay[];
  /** 已经打了多少秒 */
  time: number;
  /** 累计击杀 */
  kills: number;
  /** 累计获得的修为 */
  xpGained: number;
  /** 本帧发生的事（每帧开头清空，UI 消费完即可） */
  events: BattleEvent[];
  /** 玩家普攻冷却 */
  attackCooldown: number;
  /** 复活冷却（死了之后要等一会儿，避免瞬间反复死亡刷屏） */
  reviveCooldown: number;
  /** 累计死亡次数 */
  deaths: number;
  /** 本层死亡次数（层结算/死亡惩罚用） */
  floorDeaths: number;
  /**
   * 死亡清场标记。**它和「清场」是两回事**：
   * `isCleared()` 只看场上怪数，所以死亡清场也会让它为真 ——
   * 但死亡不该推进波次。上层消费掉这个标记后置回 false，
   * 用来把「打完了开下一波」和「死了重开本波」区分开。
   */
  deathCleanup: boolean;
  /** 累计受到的伤害（血条会被回复拉满，所以"挨过打"只能靠这个数证明） */
  damageTaken: number;
  /**
   * 累计被护盾吸收的伤害（D105 护盾活性度量）。
   * 为什么不能从外面拿 `shield` 快照差分：同一帧里可能既吸收又回充，差分拿到的是净变化，
   * 而「吸收占比」要的是事件量。运行时态，不入档。
   */
  shieldAbsorbed: number;
  /** 护盾回充的**段数**（不是帧数）：从「被打断」到「回满/再次被打断」算一段。D105 的专属验收。 */
  shieldRecharges: number;
  /** 当前是否处在回充段内（内部标记，配合 shieldRecharges 用；不入档） */
  shieldRecharging?: boolean;
  /** 单次最大入伤（D105 的「致死距离」代理：lifeMax / maxHit = 还能挨几下最重的） */
  maxHit: number;
  /**
   * 最后一击的来源（D204）：致死那一下的怪名、伤害、被护盾吃掉的量。
   *
   * 只在致死时写。玩家被秒时最想知道的就三件事 —— 谁打的、多少、我当时多少血，
   * 而 `damageTaken`/`maxHit` 只能回答「我挨过多少」，回答不了「死于谁手」。
   */
  lastFatal?: { source: string; amount: number; absorbed: number };
  /** D122：普攻（武器段）累计伤害 —— 用来验证「深层 DPS 构成」，运行时计数、不入档 */
  weaponDamage: number;
  /** D122：神通（技能段）累计伤害；含 weapon 类神通（它吃 p.damage，不吃 skillFloorScale） */
  skillDamage: number;
  /** D123：`damageType === 'weapon'` 的神通伤害（吃 p.damage → 武器属性还在这里起作用） */
  skillWeaponDamage: number;
  /** D123：`damageType === 'fixed'` 的神通伤害（吃 skillFloorScale → 与武器属性无关） */
  skillFixedDamage: number;
  /** 度量用入伤倍率（默认 1）。只有 tools/measure-survival.mjs 会设它扫 atk-mul，玩法路径永不设置。 */
  incomingMul?: number;
  /** 各神通的剩余冷却（秒），key = skill.id（战斗态，不入档） */
  castCooldowns: Record<string, number>;
  /** D123：每个神通「就绪后已等了多久」（秒）—— least-slack 调度用，按各自冷却归一后比大小 */
  skillOverdue: Record<string, number>;
  /** 本场战斗可施放的神通（createBattle 时按角色解锁台阶算好） */
  /** 神通轮转（D123 起可变：境界提升解锁新神通时必须刷新，否则新神通终生不出场） */
  skillRotation: readonly ActiveSkillDef[];
  /** 每个神通命中的玉简修正器（createBattle 时按标签过滤算好，key = skill.id） */
  readonly gemModsBySkill: Readonly<Record<string, readonly Modifier[]>>;
  /** 每神通的真元代价倍率（预计算，扣费与够不够判定都读这张表；别在施放处现算） */
  readonly gemCostMulBySkill: Readonly<Record<string, number>>;
  /** 最近一次打出去的伤害拆解（null = 还没打过）。纯运行时态，不入档 */
  lastBreakdown: DamageBreakdown | null;
}

// ────────────────────────────────────────────────────────────
// 组装
// ────────────────────────────────────────────────────────────

export interface PlayerBattleInput {
  readonly maxHp: number;
  readonly shield?: number;
  readonly level: number;
  readonly armor: number;
  readonly resist?: Partial<Record<ElementStatKey, number>>;
  readonly damage: number;
  readonly attackSpeed: number;
  /** 结印速度（每秒施法次数），只作用于 spell 类神通的冷却 */
  readonly castSpeed?: number;
  readonly critChance: number;
  readonly range?: number;
  readonly tags?: readonly Tag[];
  readonly modifiers?: readonly Modifier[];
  readonly lifeRegen?: number;
  readonly lifeOnHit?: number;
  /** 传奇旗子（由 `legendaryFlags()` 从全身装备汇总；缺省 = 没有传奇效果） */
  readonly killHeal?: number;
  readonly doubleStrike?: number;
  readonly boomMore?: number;
  readonly maxMana?: number;
}

export function createPlayerBattle(input: PlayerBattleInput): PlayerBattle {
  const maxHp = pos(input.maxHp, 1);
  const shieldMax = pos(input.shield ?? 0, 0);
  return {
    hp: maxHp,
    maxHp,
    shield: shieldMax,
    shieldMax,
    shieldIdle: 0,
    level: Math.max(1, Math.floor(finite(input.level, 1))),
    armor: pos(input.armor, 0),
    resist: input.resist ?? {},
    damage: pos(input.damage, 1),
    attackSpeed: Math.max(0.1, pos(input.attackSpeed, 1)),
    castSpeed: Math.max(0.1, pos(input.castSpeed ?? 1, 1)),
    critChance: Math.min(1, pos(input.critChance, 0)),
    range: pos(input.range ?? 120, 1),
    tags: input.tags ?? [],
    modifiers: input.modifiers ?? [],
    lifeRegen: pos(input.lifeRegen ?? 0, 0),
    lifeOnHit: pos(input.lifeOnHit ?? 0, 0),
    killHeal: Math.min(0.5, pos(input.killHeal ?? 0, 0)),
    doubleStrike: Math.min(1, pos(input.doubleStrike ?? 0, 0)),
    boomMore: Math.min(1, pos(input.boomMore ?? 0, 0)),
    maxMana: pos(input.maxMana ?? 0, 0),
    mana: pos(input.maxMana ?? 0, 0), // 开局满真元
    x: BATTLE_W / 2,
    y: BATTLE_H / 2,
  };
}

/**
 * 角色存档态 → 战斗态。
 *
 * 这是「面板」和「实战」之间唯一的桥。它必须只做换算、不做判断：
 * 一旦里面有 if (classId === 'yujian') 这类分支，就等于又开了一个加成入口，
 * 以后加机制必然漏。所有差异化都已经在 `characterModifiers()` 里变成 Modifier 了。
 *
 * 普攻目前是**无属性**（空 tags），所以走护甲减免。
 * 五行要等神通系统上线后由技能决定，那时候这里传的才是技能的 tags。
 */
export function playerBattleFromCharacter(ch: CharacterState): PlayerBattle {
  const s = characterStats(ch);
  const resist: Partial<Record<ElementStatKey, number>> = {
    resMetal: s.resMetal,
    resWood: s.resWood,
    resWater: s.resWater,
    resFire: s.resFire,
    resEarth: s.resEarth,
  };
  return createPlayerBattle({
    maxHp: s.life,
    shield: s.shield,
    level: ch.step + 1,
    armor: s.armor,
    resist,
    damage: baseDamage(),
    attackSpeed: s.attackSpeed,
    // 结印速度：**必须传**，否则「急切」玉简与「凝神/印成」天赋全是死属性（D78）
    castSpeed: s.castSpeed,
    critChance: s.critChance,
    range: 110 + s.area * 40,
    tags: [],
    modifiers: characterModifiers(ch),
    // 回复灵纹在战斗里生效的唯一落点（BALANCE §8 的「挂机不死」靠这两条线）
    lifeRegen: s.lifeRegen,
    lifeOnHit: s.lifeOnHit,
    // 传奇效果里需要战斗逻辑配合的三条（数值型传奇已经进了 characterModifiers，
    // 这里只接「修正器表达不了」的机制旗子）
    ...legendaryFlags(ch.equipment),
    maxMana: s.mana,
  });
}

/**
 * 从怪物定义生成一只在场的怪（按**层数**缩放，BALANCE §3）。
 *
 * ⚠️ `floor` 是层数不是阶数：血量/攻伐/修为全部由层曲线决定
 * （`scaleOfFloor` / `xpPerKill`），数据表只提供形态和个人浮动系数。
 * 之前传阶数导致全表只按 1.18/1.12 放大三次，是「一波 8 秒就清完」的根因之一。
 */
export function spawnMonster(
  def: MonsterDef,
  floor: number,
  uid: number,
  x: number,
  y: number,
  rarity: MonsterRarity = def.boss ? 'boss' : 'normal',
  /** 妖纹 id 列表（默认空 = 行为与改造前逐位相同） */
  affixIds: readonly string[] = [],
  /** 周目数（默认 0 = 初临，全部倍率恒等 ⇒ 与改造前逐位相同） */
  cycle: number = 0,
  /** 异变体（D160）：只影响标签与掉落，数值已在 affixIds 里体现 ⇒ 默认 false 与改造前逐位相同 */
  variant = false,
): MonsterInPlay {
  const s = scaleOfFloor(floor);
  // 妖纹：伤害/气血/护体/移速都是 increased（加法汇总后乘一次），出手间隔是乘法。
  // 空数组时四舍五入与乘法全部是恒等，所以「不传妖纹」= 改造前逐位相同（探针/单测的向后兼容硬断言）。
  const affix = sumMonsterAffixes(affixIds);
  // 镇守血量：BOSSES 表里的 def.hpMul 已经是 BOSS_HP_MUL（25），
  // 所以这里只能乘「相对主线的降幂比例」bossHpMul(floor)/BOSS_HP_MUL，绝不能再乘一次绝对值。
  // （曾经乘了绝对值：层 1 镇守 68×25×1×25 = 42 500 血，玩家 5 面板伤打到 900 秒都打不死。
  //   这条是 ceshi 用「层 1 跑 900s 杀数不动」抓出来的，看截图看不出来。）
  const bossRel = def.boss ? bossHpMul(floor) / BOSS_HP_MUL : 1;
  const maxHp = Math.max(
    1,
    Math.round(
        BASE_MONSTER_HP * def.hpMul * s.hp * bossRel * (1 + affix.lifeInc) * cycleHpMul(effectiveCycle(cycle, floor)),
      ),
  );
  return {
    uid,
    defId: def.id,
    name: def.name,
    rarity,
    affixIds,
    variant,
    element: def.element,
    tier: Math.max(1, Math.floor(finite(floor, 1))),
    hp: maxHp,
    maxHp,
    // D109 分段威胁：层 22+ ×8、镇守再 ×1.5。层 1~21 恒为 1（教学期不动）。
    damage: Math.max(
      1,
      BASE_MONSTER_DAMAGE *
          def.dmgMul *
          s.damage *
          (1 + affix.damageInc) *
          threatMul(floor, !!def.boss) *
          cycleDmgMul(effectiveCycle(cycle, floor)),
    ),
    armor: Math.round(def.armor * (1 + affix.armorInc)),
    resist: scaleResist(def.resist ?? {}, affix.resistInc),
    // D151：移速通道已随 `ji` 条目一起删除（挂机里移速既不加威胁也不加收益，实测是假词条）。
    speed: def.speed,
    // D6（BALANCE v2 §11.2）：镇守出手 1 次/5 秒 —— 难度从抗伤转限时 DPS 检查。
    // 不改的话这三个常量只有定义没有使用点，×25 血就是纯沙包。
    attackInterval: def.boss
      ? Math.max(0.2, BOSS_ATTACK_INTERVAL)
      : Math.max(0.2, def.attackInterval * affix.intervalMul),
    attackRange: Math.max(1, def.attackRange),
    size: def.size,
    // D33（BALANCE §20.9.2 / §20.13）：镇守修为按阶给，不用 def.xpMul。
    // 镇守血是普通怪 ×25，赏金也该是「该阶普通怪均值 ×25」（26 / 82 / 254）；
    // 旧的固定 30 让三阶镇守相对倍率只剩 2.96×，镇守波白打（层 27 只占修为 8%）。
    xp: Math.max(
      0,
      Math.round(
        xpPerKill(floor) * (def.boss ? bossXpMulOfTier(tierOfFloor(floor)) : def.xpMul),
      ),
    ),
    x,
    y,
    cooldown: 0,
    bossRegenTimer: 0,
  };
}

/**
 * 妖纹的五行抗性按 `increased` 缩放：各元素 ×(1+resistInc)。
 * 空表返回**原对象**（不是新空对象）—— 普通怪不该因为接妖纹而多一次分配。
 */
function scaleResist(
  resist: Partial<Record<ElementStatKey, number>>,
  resistInc: number,
): Partial<Record<ElementStatKey, number>> {
  if (!Number.isFinite(resistInc) || resistInc <= 0) return resist;
  const out: Partial<Record<ElementStatKey, number>> = {};
  for (const [k, v] of Object.entries(resist)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    out[k as ElementStatKey] = v * (1 + resistInc);
  }
  return out;
}

/** 在战场边缘环形撒一批怪（不在玩家脸上生成，避免开局就被贴） */
export function spawnRing(
  defs: readonly MonsterDef[],
  floor: number,
  count: number,
  rng: Rng,
  startUid: number,
  /** 周目数（透传给 spawnMonster） */
  cycle: number = 0,
  /** 当前波号（决定这一波有没有异变体；默认 0 = 没有 ⇒ 与改造前逐位相同） */
  wave: number = 0,
): MonsterInPlay[] {
  const out: MonsterInPlay[] = [];
  const n = Math.max(0, Math.floor(count));
  if (n === 0 || defs.length === 0) return out;
  // D29（2026-10-22，lead 拍板 A）：一波内按 defs 轮转取怪，而不是「每只独立均匀抽」。
  // 旧实现每只都 rng.int(0, len-1)，4 只怪的一波里经常出现 2~3 只同一品种，
  // 让「这一波是什么组合」变成噪声（层 24~27 的死亡读数 ±20% 抖动就是它 + 抽样）。
  // 轮转的代价：一波必然覆盖 len 种里的前 n 种（n <= len 时一波内不重复）。
  // rng 消耗从 3n 次变成 (len-1 + 2n) 次（多一次 Fisher-Yates 洗牌换顺序），
  // 所以**旧种子的逐帧序列会变**，跨版本对比必须锁版本重跑基线（ceshi 已备改前基线）。
  // D160：这一波的异变体下标（-1 = 本波没有）。必须在洗牌**之前**决定，
  // 否则「哪一只是异变体」会依赖洗牌结果，玩家会觉得是随机的错觉。
  const variantIdx = shouldSpawnVariant(floor, wave) ? rng.int(0, Math.max(0, n - 1)) : -1;
  const order = defs.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const tmp = order[i]!;
    order[i] = order[j]!;
    order[j] = tmp;
  }
  for (let i = 0; i < n; i++) {
    const def = defs[order[i % order.length]!];
    if (!def) continue;
    // 妖纹（REQ §3 第 8 条）：稀有度与妖纹在这里一起掷，镇守由 rollMonsterIdentity 直接给 boss。
    // 掷档必须放在取坐标**之前**以外的位置保持 rng 消耗稳定可复现（同种子同序列）。
    // D160：异变体 —— 每 4 波 1 只（层 ≥28）。先一次性决定「哪一只」，再掷身份，
    // 保证 rng 消耗顺序稳定（同种子同序列）：每波最多 +1 次（选只）+2 次（选类别/抽条目）。
    const identity = rollMonsterIdentity(rng, floor, !!def.boss, i === variantIdx);
    const angle = rng.float(0, Math.PI * 2);
    const dist = rng.float(260, 330);
    const x = clamp(BATTLE_W / 2 + Math.cos(angle) * dist, 20, BATTLE_W - 20);
    const y = clamp(BATTLE_H / 2 + Math.sin(angle) * dist * 0.62, 20, BATTLE_H - 20);
    out.push(
      spawnMonster(def, floor, startUid + i, x, y, identity.rarity, identity.affixIds, cycle, i === variantIdx),
    );
  }
  return out;
}

export function createBattle(
  player: PlayerBattle,
  turbid: TurbidState,
  /** 角色存档态：算解锁神通与玉简修正器用（只读一次，不持有） */
  ch?: CharacterState,
  switchOverrides?: TalentSwitchOverrides,
): BattleState {
  const sw = switchOverrides ?? (ch ? switchOverridesFor(ch.talentIds ?? []) : {});
  const boomBonus = sw.turbidBoomBonus ?? TURBID_DAMAGE_BONUS;
  const corruptionDur = sw.corruptionDuration ?? CORRUPTION_DURATION;
  const rotation = ch ? unlockedSkills(ch).filter((s) => s.cooldown > 0) : [];
  const gemMods: Record<string, readonly Modifier[]> = {};
  const gemCostMul: Record<string, number> = {};
  // 装配表（characterGemLoadout：解锁过滤 + 去重 + 截到 GEM_SLOTS=4），
  // 不是「解锁即全开」—— 槽位是第一版的核心 build 决策。
  for (const skill of rotation) {
    // D14：每神通各自 4 槽装配（不是全局共享）——共享表火系只保 57%，
    // 装不下三套（1速度+1元素+拷皮+万汇 是全类最优，猛攻只对 attack 有效）。
    const loadout = ch
      ? characterGemLoadout(ch, skill.id).map((id) => getSupportGem(id)).filter((g) => g !== undefined)
      : [];
    gemMods[skill.id] = gemModifiersFor(loadout, skill.tags);
    gemCostMul[skill.id] = gemCostMulFor(loadout, skill.tags);
  }
  return {
    player,
    turbid,
    boomBonus,
    corruptionDur,
    monsters: [],
    time: 0,
    kills: 0,
    xpGained: 0,
    events: [],
    attackCooldown: 0,
    reviveCooldown: 0,
    deaths: 0,
    floorDeaths: 0,
    deathCleanup: false,
    // D123 修 bug：冷却表必须用 rotation 初始化 —— 若留空对象，tick 里 `Object.keys(castCooldowns)`
    // 一个键都没有，`skillOverdue` 永远为空，least-slack 的全部 score 都是 0，于是又退回「表序第一个就绪」。
    castCooldowns: Object.fromEntries(rotation.map((sk) => [sk.id, 0])),
    skillOverdue: Object.fromEntries(rotation.map((sk) => [sk.id, 0])),
    skillRotation: rotation,
    gemModsBySkill: gemMods,
    gemCostMulBySkill: gemCostMul,
    damageTaken: 0,
    shieldAbsorbed: 0,
    shieldRecharges: 0,
    maxHit: 0,
  weaponDamage: 0,
  skillDamage: 0,
  skillWeaponDamage: 0,
  skillFixedDamage: 0,
    lastBreakdown: null,
  };
}

// ────────────────────────────────────────────────────────────
// 主循环
// ────────────────────────────────────────────────────────────

/**
 * 推进一帧。
 *
 * 顺序是固定的，而且有讲究：
 *   1 冷却/浊气/复活 → 2 玩家出手 → 3 怪移动 → 4 怪出手 → 5 清尸体
 *
 * 为什么玩家先出手：如果怪先出手，玩家在"最后一击"的竞速里永远吃亏，
 * 手感上会觉得"我明明伤害够了还是被打死"。先手是放置类给玩家的默认便宜。
 */
export function tickBattle(state: BattleState, dt: number, rng: Rng): void {
  const d = Math.max(0, Math.min(0.25, finite(dt, 0)));
  if (d === 0) return;
  state.time += d;
  state.events = [];

  const p = state.player;

  // 1) 复活
  if (state.reviveCooldown > 0) {
    state.reviveCooldown = Math.max(0, state.reviveCooldown - d);
    if (state.reviveCooldown === 0) {
      p.hp = p.maxHp;
      // 复活给 0 罡气 + 计时归零：想拿回护盾得先活过 3 秒（D103）。
      // 不给满盾是因为死亡已经罚了修为（DEATH_XP_PENALTY），再送一份 EHP 会削弱惩罚。
      p.shield = 0;
      p.shieldIdle = 0;
      p.mana = p.maxMana; // 重生回满真元，跟气血同一条路，两条回复不叠加
      // 冷却表清空后要按当前 rotation 重建（不能留空对象，理由同 createBattle 里的注释）
      state.castCooldowns = Object.fromEntries(state.skillRotation.map((sk) => [sk.id, 0]));
      state.skillOverdue = Object.fromEntries(state.skillRotation.map((sk) => [sk.id, 0]));
    }
    tickTurbid(state.turbid, d, 0, { corruptionDuration: state.corruptionDur });
    return;
  }

  // 每秒气血回复（灵纹「气血回复」）：只回活的玩家，且不会溢出上限。
  // 放在复活判断之后 —— 死亡期间不回复，复活直接满血，两条路不叠加
  if (p.lifeRegen > 0 && p.hp > 0) {
    p.hp = Math.min(p.maxHp, p.hp + p.lifeRegen * d);
  }

  // 罡气回充（D103）：脱战 3 秒后按 min(上限/4, 5% 气血)/秒补回，只补到上限。
  // 三条纪律：①受击只「打断 + 重置计时」，**不扣已有护盾**（清空是双罚，深层高频受击会永远攒不起来
  // = 又一个死属性）；②不吃 `lifeRegen` / 治疗加成（两条通道互相放大会让标定失控）；
  // ③`shieldIdle` 只在受伤时清零，这里累加。
  p.shieldIdle += d;
  if (p.shieldMax > 0 && p.shield < p.shieldMax && p.shieldIdle >= SHIELD_RECHARGE_DELAY) {
    const rate = shieldRechargeRate(p.shieldMax, p.maxHp);
    if (!state.shieldRecharging) {
      state.shieldRecharging = true;
      state.shieldRecharges += 1;
    }
    p.shield = Math.min(p.shieldMax, p.shield + rate * d);
  }

  // 2) 玩家出手。神通优先于普攻：冷却好的最高优先级神通插队占掉这一次出手
  //（共用 attackCooldown 节律），普攻是兜底。真元每帧回 MANA_REGEN_PER_SEC。
  p.mana = Math.min(p.maxMana, p.mana + MANA_REGEN_PER_SEC * d);
  state.attackCooldown = Math.max(0, state.attackCooldown - d);
  for (const id of Object.keys(state.castCooldowns)) {
    const before = state.castCooldowns[id];
    state.castCooldowns[id] = Math.max(0, before - d);
    // D123：已经就绪的神通继续累计「等了多久」—— 这才是 least-slack 的比较量
    if (before <= 0 || state.castCooldowns[id] === 0) {
      state.skillOverdue[id] = (state.skillOverdue[id] ?? 0) + d;
    }
  }
  if (state.attackCooldown === 0 && state.monsters.length > 0) {
    const target = nearestInRange(state.monsters, p, p.range);
    if (target) {
      const skill = pickNextSkillRaw(
        state.skillRotation,
        p.mana,
        state.castCooldowns,
        state.gemCostMulBySkill,
        state.skillOverdue,
      );
      if (skill) {
        skillStrike(state, target, skill, rng);
        p.mana -= skill.manaCost * (state.gemCostMulBySkill[skill.id] ?? 1);
        state.skillOverdue[skill.id] = 0;
        state.castCooldowns[skill.id] = skillCooldown(
          skill.cooldown,
          skill,
          p,
          state.gemModsBySkill[skill.id] ?? [],
        );
      } else {
        playerStrike(state, target, rng);
      }
      state.attackCooldown = 1 / Math.max(0.1, p.attackSpeed);
      // 传奇「双影」：同一节律内追加一击（不额外占冷却，也不额外耗真元）
      if (p.doubleStrike > 0 && rng.chance(p.doubleStrike)) {
        const extra = target.hp > 0 ? target : nearestInRange(state.monsters, p, p.range);
        if (extra) playerStrike(state, extra, rng);
      }
    }
  }

  // 3) 怪移动 + 4) 怪出手
  if (p.hp > 0) {
    for (const m of state.monsters) {
      const dx = p.x - m.x;
      const dy = p.y - m.y;
      const dist = Math.hypot(dx, dy);
      m.cooldown = Math.max(0, m.cooldown - d);
      // 镇守自回计时器必须**每帧**推进（diag-boss 抓到的 bug：原来写在出手分支里，
      // 每次只加 1/60s，凑满 10s 要 600 次出手 —— 实测 120 秒内自回 0 次）。
      if (m.rarity === 'boss') m.bossRegenTimer = (m.bossRegenTimer ?? 0) + d; // 已 ?? 0 兜底

      if (dist > m.attackRange) {
        // 走向玩家，但不会走进"攻击距离"以内
        const step = Math.min(m.speed * d, dist - m.attackRange);
        if (step > 0 && dist > 0.001) {
          m.x += (dx / dist) * step;
          m.y += (dy / dist) * step;
        }
      } else if (m.cooldown === 0) {
        if (m.rarity === 'boss' && (m.bossRegenTimer ?? 0) >= BOSS_REGEN_PERIOD) {
          // 战内自回：每 10 秒回 3% 最大气血（比例由 ceshi diag-boss 实测定标：
          // 10% 生效后 TTK 395~1904s 全卡关，3% = 105/133/119s 全落 60~180s）。
          m.bossRegenTimer = (m.bossRegenTimer ?? 0) - BOSS_REGEN_PERIOD;
          m.hp = Math.min(m.maxHp, m.hp + m.maxHp * BOSS_REGEN_RATIO);
        }
        monsterStrike(state, m, rng);
        m.cooldown = m.attackInterval;
      }
    }
  }

  // 5) 清尸体（玩家出手已经算过击杀，这里只兜底）
  state.monsters = state.monsters.filter((m) => m.hp > 0);

  // 浊气推进
  tickTurbid(state.turbid, d, 0, { corruptionDuration: state.corruptionDur });
}

/**
 * 战斗层内挑神通：只用战斗态（mana / castCooldowns），不查角色表。
 * skills-runtime 的 pickNextSkill 是给 UI 用的；战斗内每帧调它要过一遍角色解锁表，
 * 这里换成同语义的轻量版（解锁判断在 castCooldowns 初始化时已做过）。
 */
/**
 * 神通吃哪条「速度」通道。
 *
 * 为什么必须分两把：attack 类走 `attackSpeed`（和普攻同一条通路，猛攻玉简），
 * spell 类走 `castSpeed`（结印，急切玉简 / 凝神·印成天赋）。
 * 合成一条会让两种主题的玉简变成只对一半神通有效 —— 那就是「面板写了、实战没生效」。
 */
function speedStatOf(skill: ActiveSkillDef): 'attackSpeed' | 'castSpeed' {
  return skill.tags.includes('attack') ? 'attackSpeed' : 'castSpeed';
}

/**
 * 神通的**实际冷却**（秒）：面板冷却 ÷ 速度通道。
 *
 * 为什么必须有这一条（D78）：本作有两条「速度」玉简（猛攻 +25% attackSpeed、
 * 急切 +25% castSpeed）和两点天赋（凝神/印成 castSpeed），
 * 但早版 tickBattle 直接写 `skill.cooldown` ⇒ 这些加成全是死属性，
 * 面板说「结印更快」、算伤害时也把它们算进 2.43×，实战一点没变。
 *
 * 公式：`panelSpeed` 已经是 1.0 基准的绝对倍率（含装备/属性/天赋），
 * 玉简给的是 increased，乘在上面。下限 0.2 防止病态数据把冷却打成 0。
 */
export function skillCooldown(
  baseCooldown: number,
  skill: ActiveSkillDef,
  p: PlayerBattle,
  gemMods: readonly Modifier[],
): number {
  if (!(baseCooldown > 0)) return 0;
  const gemSpeedInc = aggregate(gemMods, speedStatOf(skill)).increased;
  const panelSpeed = skill.tags.includes('attack') ? p.attackSpeed : p.castSpeed;
  const speed = Math.max(0.2, panelSpeed * (1 + Math.max(-0.9, gemSpeedInc)));
  return baseCooldown / speed;
}

function pickNextSkillRaw(
  rotation: readonly ActiveSkillDef[],
  mana: number,
  cooldowns: Readonly<Record<string, number>>,
  costMuls: Readonly<Record<string, number>>,
  overdue: Readonly<Record<string, number>> = {},
): ActiveSkillDef | null {
  // D123 least-slack：在所有「就绪且真元够」的神通里，选「就绪后等得最久（按各自冷却归一）」的那个。
  // 旧实现是「按表序返回第一个就绪的」⇒ 表序靠后的神通（焚天掌第 5、锋锐金芒第 6）永远轮不到，
  // 实测武器型神通伤害占比 0.00%，不是数值问题而是调度问题。
  // cd = 0 的神通仍是 filler（不参与优先级竞争，它的角色就是普攻形态）。
  let best: ActiveSkillDef | null = null;
  let bestScore = -1;
  for (const skill of rotation) {
    if (skill.cooldown <= 0) continue;
    if ((cooldowns[skill.id] ?? 0) > 0) continue;
    if (mana < skill.manaCost * (costMuls[skill.id] ?? 1)) continue;
    const score = (overdue[skill.id] ?? 0) / skill.cooldown;
    if (score > bestScore) {
      bestScore = score;
      best = skill;
    }
  }
  return best;
}

/**
 * 神通打一只怪。与 playerStrike 同一条 computeDamage 管线，差异只有三处：
 * 1. base：weapon 型用 p.damage（吃武器/面板）；fixed 型用 skill.baseDamage × skillFloorScale(target.tier)
 *    —— baseDamage 是「层 1 当量」，不乘层曲线的话法术 DPS 会在第 3 层起被怪血甩开并归零
 * 2. tags：用神通的道性标签（决定五行抗性/玉简修正器是否命中）
 * 3. modifiers：p.modifiers + 该神通命中的玉简修正器（gemModifiersFor 过滤）
 */
function skillStrike(
  state: BattleState,
  target: MonsterInPlay,
  skill: ActiveSkillDef,
  rng: Rng,
): void {
  const p = state.player;
  const gemMods = state.gemModsBySkill[skill.id] ?? [];
  // 玉简的破绽率（贯头 +6 个百分点）必须在这里生效：
  // `p.critChance` 是「角色面板」的已解析值，不含玉简 —— 不补这一句，贯头就是死属性（D78）。
  // 用 aggregate + applyAggregate 而不是手工加法：将来若有玉简给 `critChance increased`，语义自动正确。
  const critChance = Math.min(1, applyAggregate(p.critChance, aggregate(gemMods, 'critChance')));
  const isCrit = rng.chance(critChance);
  const defense: DefenseProfile = {
    armor: target.armor,
    resist: target.resist,
    level: p.level,
  };
  const res: DamageResult = computeDamage({
    base:
      skill.damageType === 'weapon'
        ? p.damage * (1 + WEAPON_DEEP_K * (skillFloorScale(target.tier) - 1))
        : skill.baseDamage * skillFloorScale(target.tier),
    tags: skill.tags,
    modifiers: [...p.modifiers, ...gemMods],
    isCrit,
    target: defense,
    externalMore: turbidMultiplier(state.turbid, { damageBonus: state.boomBonus + p.boomMore }),
    roll: rng.float(0.9, 1.1),
  });

  target.hp -= res.amount;
  state.skillDamage += res.amount;
  // D123：按伤害类型再分 —— weapon 型吃 p.damage（武器属性有效），fixed 型吃 skillFloorScale（与武器无关）
  if (skill.damageType === 'weapon') state.skillWeaponDamage += res.amount;
  else state.skillFixedDamage += res.amount;
  state.lastBreakdown = {
    label: `${skill.name} → ${target.name}`,
    amount: res.amount,
    isCrit: res.isCrit,
    steps: res.steps,
  };
  state.events.push({
    kind: res.isCrit ? 'player-crit' : 'player-hit',
    label: `${skill.name} ${res.amount}`,
    amount: res.amount,
    x: target.x,
    y: target.y,
  });

  if (target.hp <= 0) {
    target.hp = 0;
    state.kills += 1;
    // 传奇「血祭」：击杀回气（按最大气血比例，有界 0~50%）
    if (p.killHeal > 0) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * p.killHeal);
    state.xpGained += target.xp;
    state.events.push({
      kind: 'player-kill',
      label: `击杀 ${target.name}`,
      x: target.x,
      y: target.y,
      monster: {
        defId: target.defId,
        tier: target.tier,
        rarity: target.rarity,
    affixIds: target.affixIds,
    variant: target.variant === true,
        xp: target.xp,
        x: target.x,
        y: target.y,
      },
    });
    addTurbid(state.turbid, TURBID_PER_KILL);
  } else {
    addTurbid(state.turbid, TURBID_PER_HIT);
    if (p.lifeOnHit > 0) p.hp = Math.min(p.maxHp, p.hp + p.lifeOnHit);
  }
}

/** 玩家打一只怪 */
function playerStrike(state: BattleState, target: MonsterInPlay, rng: Rng): void {
  const p = state.player;
  const isCrit = rng.chance(p.critChance);
  const defense: DefenseProfile = {
    armor: target.armor,
    resist: target.resist,
    level: p.level,
  };
  const res: DamageResult = computeDamage({
    base: p.damage,
    tags: p.tags,
    modifiers: p.modifiers,
    isCrit,
    target: defense,
    // 浊气沸腾是外部倍率，不是修正器 —— 它随时在变，进修正器会让面板乱跳
    externalMore: turbidMultiplier(state.turbid, { damageBonus: state.boomBonus + p.boomMore }),
    roll: rng.float(0.9, 1.1),
  });

  target.hp -= res.amount;
  state.weaponDamage += res.amount;
  state.lastBreakdown = {
    label: `普攻 → ${target.name}`,
    amount: res.amount,
    isCrit: res.isCrit,
    steps: res.steps,
  };
  state.events.push({
    kind: res.isCrit ? 'player-crit' : 'player-hit',
    label: `${res.amount}`,
    amount: res.amount,
    x: target.x,
    y: target.y,
  });

  if (target.hp <= 0) {
    target.hp = 0;
    state.kills += 1;
    // 传奇「血祭」：击杀回气（按最大气血比例，有界 0~50%）
    if (p.killHeal > 0) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * p.killHeal);
    state.xpGained += target.xp;
    state.events.push({
      kind: 'player-kill',
      label: `击杀 ${target.name}`,
      x: target.x,
      y: target.y,
      // 身份牌交出去：掉落要按「死的这只怪」算，不能按「场上随便一只」算。
      // affixIds / variant 必须一起交：神通击杀也吃妖纹的掉落加成、也要能收录异变体图鉴
      // （D173 补：这一处曾经漏了变体与妖纹，导致「用神通杀死的异变体不收录」）。
      monster: {
        defId: target.defId,
        tier: target.tier,
        rarity: target.rarity,
        xp: target.xp,
        x: target.x,
        y: target.y,
        affixIds: target.affixIds,
        variant: target.variant === true,
      },
    });
    addTurbid(state.turbid, TURBID_PER_KILL);
  } else {
    addTurbid(state.turbid, TURBID_PER_HIT);
    // 击中回气（灵纹「击中回气」）在这里生效。
    // 挂在未击杀分支是刻意的：击杀本身已推进战斗，致死那一刀回不回血对续航无意义
    if (p.lifeOnHit > 0) p.hp = Math.min(p.maxHp, p.hp + p.lifeOnHit);
  }
}

/** 怪打玩家 */
function monsterStrike(state: BattleState, m: MonsterInPlay, rng: Rng): void {
  const p = state.player;
  const defense: DefenseProfile = {
    armor: p.armor,
    resist: p.resist,
    level: m.tier, // 攻击方等级 = 怪所在层（护甲公式的 k 随攻方等级涨）
  };
  const res = computeDamage({
    base: m.damage,
    tags: [m.element],
    modifiers: [],
    isCrit: false,
    target: defense,
    // 虚弱时受到的伤害更高 —— 这是"浊化之后有代价"的落点
    // 度量用倍率（D105 的 K 值扫描）：默认 1，玩法路径不设 ⇒ 与线上完全一致。
    externalMore: turbidTakenMultiplier(state.turbid) * (state.incomingMul ?? 1),
    roll: rng.float(0.95, 1.05),
  });

  const absorbed = Math.min(p.shield, res.amount);
  p.shield -= absorbed;
  if (absorbed > 0) state.shieldAbsorbed += absorbed;
  // 受击打断回充（D103）：只重置计时，不扣护盾 —— 护盾该扣的已经在上面的 absorbed 里扣过了。
  p.shieldIdle = 0;
  state.shieldRecharging = false;
  const dealt = res.amount - absorbed;
  p.hp -= dealt;
  // 累计入伤：血条会被回复拉回满值，所以「玩家挨过打」这件事只能靠累计量证明。
  // 它同时是伤害详解面板的数据源（玩家想知道"我为什么这么脆"）。
  state.damageTaken += dealt;
  if (res.amount > state.maxHit) state.maxHit = res.amount;
  // 最后一击的来源（D204）：玩家被秒时必须能说出「是谁打的、多少」。
  // 只在致死那一下记 —— 记全部等于每帧写一个对象，而玩家只关心死因。
  if (p.hp <= 0) {
    state.lastFatal = { source: m.name, amount: res.amount, absorbed };
  }
  state.events.push({
    kind: 'monster-hit',
    label: `-${res.amount}`,
    amount: res.amount,
    x: p.x,
    y: p.y,
  });

  if (p.hp <= 0) {
    p.hp = 0;
    state.deaths += 1;
    state.floorDeaths = (state.floorDeaths ?? 0) + 1;
    // 复活要等 REVIVE_COOLDOWN 秒，期间什么都不做 —— 给玩家一个"这里打不过"的明确体感
    state.reviveCooldown = REVIVE_COOLDOWN;
    state.events.push({ kind: 'player-died', label: '气血枯竭，浊脉重凝', x: p.x, y: p.y });
    // 清场：死亡等于这次探索中断，怪不留在原地等你复活。
    // 注意：清场 ≠ 清波进度。上层（session）靠 `deathCleanup` 标记区分
    // 「打完了」和「死了」，死了必须重打这一波 —— 否则死得越多推进越快（实测踩过）
    state.deathCleanup = true;
  }
}

/**
 * 复活冷却（秒），D110-b：3 → 6。
 *
 * 6 秒的来历不是「感觉上更疼」，而是它必须与「玩家能感知的时间块」同量级：
 * 本游戏一层平均 3.7 分钟、一波约 8 秒。3 秒几乎与波间隔同长（感知不到），
 * 6 秒是「你能注意到自己在等」的最小值，同时 42 次死亡也只有 4.6 分钟（0.5%），
 * 不会把满级时长炸掉 —— 真正的死亡代价是「本层回到第 1 波」（8.4%）。
 */
export const REVIVE_COOLDOWN = 6;

/**
 * D125（shuzhi）：武器型神通的「深层补偿系数」。
 *
 * 为什么需要它：固定型神通的伤害吃 `skillFloorScale`（随层等比放大），而武器型吃 `p.damage`
 * （基础 5 + 装备 flat）**不随层放大** ⇒ 深层天然被甩开，实测武器型神通伤害占比 0.09%，
 * sword 部位与 `damage` 的 flat 通道等于死掉。
 *
 * 公式刻意写成 `1 + k × (scale − 1)` 而不是 `1 + k × scale`：
 * 层 1 的 `scale` 恰好是 1 ⇒ 乘数恒等式 1，**早期一位不变**。这正是不重演
 * 「flat 8 打在基数 5 上 = +160%」那次事故的关键（D123：同一组数字换 op 完全不等价）。
 *
 * k 是标定量，不是设计量：目标是让武器型占比落 8~12%。扫完由 BALANCE 定稿后改成常量。
 */
const WEAPON_DEEP_K = (() => {
  // 浏览器里没有 process（tsconfig 不装 @types/node），所以走 globalThis 的鸭子取法：
  // 标定期间用 `ZX_WEAPON_K=1 node tools/run-timeline.mjs` 扫 k；定稿后这一整段改成 plain const。
  const g = globalThis as unknown as { process?: { env?: Record<string, string | undefined> } };
  const n = Number(g.process?.env?.ZX_WEAPON_K);
  return Number.isFinite(n) && n >= 0 ? n : 0.4;
})();

/** 给浊气加点，处理满值（tickTurbid 负责状态机，这里只负责加分） */
function addTurbid(t: TurbidState, amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) return;
  t.value = Math.min(100, t.value + amount);
}

// ────────────────────────────────────────────────────────────
// 查询
// ────────────────────────────────────────────────────────────

/** 距离玩家最近、且在射程内的怪 */
export function nearestInRange(
  monsters: readonly MonsterInPlay[],
  p: { x: number; y: number },
  range: number,
): MonsterInPlay | null {
  let best: MonsterInPlay | null = null;
  let bestD = Infinity;
  for (const m of monsters) {
    if (m.hp <= 0) continue;
    const d = Math.hypot(m.x - p.x, m.y - p.y) - m.size / 2;
    if (d <= range && d < bestD) {
      bestD = d;
      best = m;
    }
  }
  return best;
}

/** 场上还剩几只活的 */
export function aliveCount(state: BattleState): number {
  return state.monsters.filter((m) => m.hp > 0).length;
}

/** 是否清场完成 */
export function isCleared(state: BattleState): boolean {
  return aliveCount(state) === 0 && state.reviveCooldown === 0;
}

/** 本场战斗的玩家血量比例（0~1，给血条用） */
export function hpRatio(state: BattleState): number {
  const p = state.player;
  if (p.maxHp <= 0) return 0;
  return clamp(p.hp / p.maxHp, 0, 1);
}

/** 状态是否已经坏掉（NaN 会一路污染，越早发现越好） */
export function isBattleSane(state: BattleState): boolean {
  const p = state.player;
  return (
    Number.isFinite(p.hp) &&
    Number.isFinite(p.maxHp) &&
    Number.isFinite(p.x) &&
    Number.isFinite(p.y) &&
    Number.isFinite(state.turbid.value) &&
    state.monsters.every(
      (m) => Number.isFinite(m.hp) && Number.isFinite(m.x) && Number.isFinite(m.y),
    )
  );
}

// ────────────────────────────────────────────────────────────
// 小工具
// ────────────────────────────────────────────────────────────

function finite(n: number, fallback: number): number {
  return Number.isFinite(n) ? n : fallback;
}

function pos(n: number, fallback: number): number {
  const v = finite(n, fallback);
  return v >= 0 ? v : fallback;
}

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}
