/**
 * 一局游戏 —— 把「角色、战斗、掉落、拾取、修为、波次」串起来的那一层。
 *
 * 为什么要有这一层，而不是全塞进 main.ts：
 * main.ts 只该做组装。规则（掉什么、捡不捡、什么时候下一波）是游戏逻辑，
 * 必须能被单测直接调用、也能在没有浏览器的情况下跑（离线收益要用）。
 *
 * 这里所有东西都是「运行时态」，不进存档。存档只存 `CharacterState` + 背包 + 波次进度。
 */

import {
  BATTLE_H,
  BATTLE_W,
  createBattle,
  isCleared,
  playerBattleFromCharacter,
  spawnMonster,
  spawnRing,
  tickBattle,
  type BattleState,
  type MonsterInPlay,
} from './battle';
import { characterStats, createCharacter, equip, gainXp, type CharacterState } from './character';
import type { SoundName } from './audio';
import { CURRENCY_SHARE, rollCurrency, type CurrencyId } from '../data/currency';
import { GEM_SHARE, rollGemDrop } from '../data/gem-drops';
import { runCraftPlan, type CraftPlan } from './crafting';
import {
  addFragments,
  EMPTY_FRAGMENTS,
  FRAGMENT_CAP,
  FRAGMENT_NAME,
  FRAGMENT_TERM,
  fragmentElementForBoss,
  type FragmentElement,
} from '../data/fragments';
import {
  LOOT_QUANTITY_CAP,
  MAX_GROUND_DROPS,
  PICKUP_DELAY,
  rollDropGate,
  rollMonsterDropAll,
  type GroundDrop,
} from './drop';
import { MONSTER_QTY_CAP, sumMonsterAffixes } from '../data/monster-affixes';
import { VARIANT_EXTRA_DROP } from './monster-roll';
import { clampCycle, cycleMarksMul, cycleName } from '../data/cycles';
import { allocateTalent, switchOverridesFor, type TalentSwitchOverrides } from './talents-runtime';
import { autoAllocateTalents } from './talents-auto';
import { getTalent } from '../data/talents';
import { unlockedSkills } from './skills-runtime';
import { codexUnlockText, createCodex, recordLegendary, recordMonsterKill, type CodexState } from './codex';
import {
  achievementUnlockText,
  createAchievements,
  unlockAchievements,
  type AchievementState,
} from './achievement';
import type { AchievementFacts } from '../data/achievements';
import { getLegendary } from '../data/legendary';
import { getMonster } from '../data/monsters';
import { pickup, slotForItem } from './inventory';
import type { Item } from './item';
import type { MonsterRarity } from '../data/monsters';
import { Rng } from './rng';
import type { AffixDef } from '../data/affix-def';
import type { ItemBaseDef } from '../data/bases';
import {
  hasBossFloor, bossOfTier, monstersOfTier, MAX_FLOOR, tierOfFloor } from '../data/monsters';
import { isMaxStep, TOTAL_STEPS } from './progression';
import type { ClassId } from '../data/classes';
import { unlockedGems } from './skills-runtime';

/** 一条飘起来的字（伤害数字 / 掉落提示） */
export interface FloatText {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly color: string;
  /** 已经飘了多久（秒） */
  age: number;
  /** 总时长（秒），到点就删 */
  readonly life: number;
  /** 这段时间里向上飘多少像素 */
  readonly rise: number;
}

/** 战斗日志一行（右下角滚动） */
export interface LogLine {
  readonly text: string;
  readonly color: string;
  age: number;
}

/** 日志最多留几行：多了会糊住画面 */
export const MAX_LOG_LINES = 6;
/**
 * 一帧内最多留几个音效 cue（音效引擎自己还有按名的节流，这里是第二道闸）。
 *
 * 为什么要在 core 里就设上限：放置游戏满级后一秒能杀十几只怪，
 * 逐个播 = 白噪音；而且 main.ts 每帧 drain 一次，堆太多会让音效滞后于画面。
 */
/** D199 震动的六种来源（0~1 振幅；实际像素由渲染层乘 MAX_SHAKE_PX） */
export const SHAKE_ON_HIT = 0.06;
export const SHAKE_ON_CRIT = 0.14;
export const SHAKE_ON_MONSTER_HIT = 0.05;
export const SHAKE_ON_KILL = 0.05;
export const SHAKE_ON_BOSS_KILL = 0.34;
export const SHAKE_ON_DEATH = 0.6;
export const SHAKE_MAX = 1;
/** 每秒 e^-8 衰减：0.6 的死亡震动约 0.35s 掉到 0.03 —— 够短，不会让人晕 */
export const SHAKE_DECAY_PER_SEC = 8;

/** 叠加震动（只加，上限 SHAKE_MAX；脏值当 0）。 */
export function addShake(s: { shake: number }, amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) return;
  const cur = Number.isFinite(s.shake) ? s.shake : 0;
  s.shake = Math.min(SHAKE_MAX, cur + amount);
}

/** 每帧衰减。指数衰减与帧率无关（dt 变了曲线不变）。 */
export function decayShake(shake: number, dt: number): number {
  if (!Number.isFinite(shake) || shake <= 0) return 0;
  // **不许夹 dt**：指数衰减夹住 dt 就变成「大 dt 衰减更慢」，帧率一变曲线就变（测试会红）。
  // 战斗里夹 dt 是为了防切标签页补算，那里夹得对；这里只需要「时间越长越小」。
  const d = Number.isFinite(dt) && dt > 0 ? dt : 0;
  return Math.max(0, shake * Math.exp(-SHAKE_DECAY_PER_SEC * d));
}

export const MAX_SOUND_CUES = 6;

/** 清场之后隔多久开下一波（秒）。给玩家「喘一口气 + 看清掉落」的时间 */
export const WAVE_GAP = 0.9;

/** 每几波一个镇守（一层 10 波，第 10 波是镇守） */
export const BOSS_EVERY = 10;

/**
 * 同一层泡了多久给一次「卡住了」提示（秒）。D205。
 *
 * 8 分钟是量出来的：一阶一层约 3.7 分钟（BALANCE 四段下界 27min / 约 7 层），
 * 8 分钟 ≈ 两层的时间，正常推进几乎不会触发；反过来说，真触发了就说明停住了。
 * 距离「挂机一晚」那种规模（几小时）又差得远，不会打扰正常挂机的玩家。
 */
export const STUCK_HINT_SECONDS = 8 * 60;

/**
 * 一波几只普通浊物。
 *
 * BALANCE v4 定标：6→10→6→4。现在是 4 —— 因为「每波挨打总量」按同屏数近似平方涨
 * （同时出手的数 × 出手次数），6 只时层 27 入伤到气血 62%，4 只才回到 26%。
 */
export const WAVE_SIZE = 4;

/** 死亡扣掉当前修为的百分比（DECISIONS 默认值：掉修为不掉装备） */
export const DEATH_XP_PENALTY = 0.1;

/**
 * 逃生阀阈值（D113）：同一层**连续**死这么多次就自动回退 1 层。
 *
 * 3 的来历：1~2 次死亡仍属「手滑/装备差一点」，第 3 次说明这层结构上打不过；
 * 再高会让玩家在死锁里多耗 2×1.8min，再低会让「越级挑战」变得没有代价。
 * 换层（下潜或退层）后计数器清零。
 */
export const ESCAPE_VALVE_DEATHS = 3;
/** 逃生阀每次退几层（D117）：1 层会被「清完立刻回去」抵消，2 层让每次循环多刷一批装备 */
export const ESCAPE_VALVE_LAYERS = 1;

/** 每波清完回多少比例的最大气血（BALANCE §8 挂机生存的数学基础） */
export const WAVE_END_REGEN = 0.25;

/** 距上次自动打造多久（秒） */
export const CRAFT_TICK = 15;

/** 掉落物 / 浮字的自增 id */
let uidCounter = 1;

/**
 * 运行时诊断计数（**不入档**，也不是玩法状态）。
 *
 * 存在的唯一理由：按稀有度分解掉落 —— 妖纹上线后「出货总数 +9.8% 但法宝 −3%」
 * 需要一个可复算的分解表来区分「份额挤压」与「多掷了一次闸」。
 * **任何玩法逻辑都不许读它**：它只往上涨，不参与任何判定，也不进存档。
 */
export interface SessionDiag {
  readonly killsByRarity: Record<MonsterRarity, number>;
  readonly itemsByRarity: Record<MonsterRarity, number>;
  readonly currencyByRarity: Record<MonsterRarity, number>;
  readonly gemByRarity: Record<MonsterRarity, number>;
}

export function createSessionDiag(): SessionDiag {
  return {
    killsByRarity: { normal: 0, magic: 0, rare: 0, boss: 0 },
    itemsByRarity: { normal: 0, magic: 0, rare: 0, boss: 0 },
    currencyByRarity: { normal: 0, magic: 0, rare: 0, boss: 0 },
    gemByRarity: { normal: 0, magic: 0, rare: 0, boss: 0 },
  };
}

export interface GameSession {
  /** 运行时诊断计数（不入档，玩法不读） */
  readonly diag: SessionDiag;
  character: CharacterState;
  bag: Item[];
  battle: BattleState;
  ground: GroundDrop[];
  floats: FloatText[];
  log: LogLine[];
  readonly rng: Rng;
  readonly tables: { bases: readonly ItemBaseDef[]; affixes: readonly AffixDef[] };
  /** 当前第几波（从 1 开始） */
  wave: number;
  /** 当前层（1~27，每层一条怪表索引；每 9 层换一阶的怪表） */
  floor: number;
  /** 本层死亡次数（死亡会重开本波，玩家要看得见自己死了几次） */
  floorDeaths: number;
  /** 逃生阀触发次数 =「死锁事件」数（D115）。运行时计数、不入档；1 次事件 = ESCAPE_VALVE_DEATHS 次死亡。 */
  escapeValveCount: number;
  /** 距下一波还有多久 */
  waveTimer: number;
  /** 天赋开关的运行时覆盖值（波末回气/拾取延迟；战斗侧的在 battle.switches） */
  readonly switches: TalentSwitchOverrides;
  /** 累计掉落件数（UI 显示"出货"用；含法宝 + 通货 + 玉简三类） */
  dropsFound: number;
  /**
   * 累计击杀（运行期观察量，不进存档）。
   *
   * 为什么必须单独记：battle.kills 是战斗层计数，死亡重开/换层都不区分层；
   * 而「按层真实击杀率」是标定 KILLS_PER_MIN_BY_FLOOR 的唯一实测来源（BALANCE §21.11）。
   * 这里曾经声明了 readonly kills 却没有任何一处赋值，工具读到 NaN。
   */
  kills: number;
  /** 本层击杀（换层清零）。floorKills / floorMinutes = 该层真实击杀率 */
  floorKills: number;
  /** 本层停留分钟数（换层清零）。运行时态，不进存档 */
  floorMinutes: number;
  /**
   * 「卡住了」提示已经给过的层（D205，运行时态）。
   *
   * 每层只提示一次：一直挂机在同一层是**正常玩法**（挂机本来就不该被催），
   * 但连续 8 分钟一层都没过、又不是在镇守波上，多半是打不动了 —— 这时给一次
   * 「往哪走」的话术，比让玩家自己发现「原来能回刷」强得多。
   */
  stuckHintFloor?: number;
  /** 累计突破次数 */
  breakthroughs: number;
  /**
   * 待播音效队列（运行时、不入档）。
   *
   * core 只写「发生了什么」，不认识 AudioContext —— 主循环 drain 之后交给渲染侧播。
   * 这样离线结算/数值模拟跑 session 时既不会发声、也不会创建音频上下文（Node 里根本没有）。
   */
  soundCues: SoundName[];
  /** D199 当前震动振幅（运行时态，不入档）。渲染层只读它，不消耗 rng。 */
  shake: number;
  /** 本次运行累计秒数（运行时态，不入档）。D200 统计面板要显示「玩了多久」。 */
  playedSeconds: number;
  /** 货币袋：通货计数（不占 40 格背包，记账式） */
  pocket: Record<CurrencyId, number>;
  /** 掉落的玉简（id 计数，拾取即收入） */
  gemPouch: Record<string, number>;
  /** 已首通楼层（每层首通 +2 天赋点的账本；含当前层则不再发首通点） */
  firstClearedFloors: number[];
  /**
   * 到过的最高层（含没通关的）。
   * 单靠 floor + firstClearedFloors 推不出来：玩家从第 3 层回刷第 1 层时，
   * 第 3 层既不是当前层也没通关，会被算成「没到过」→ 回刷一次就永久锁死。
   * 这是运行到过的事实，必须单独记、必须入档。
   */
  maxFloorReached: number;
  /**
   * 周目数（D36-A / D130）。0 = 初临（第一轮），每次轮回 +1。
   *
   * 它是「刻度的载体」而不是资源：怪物气血/攻伐按周目乘方（1.35^N / 1.25^N），
   * 渊痕产出按周目线性放大（1 + N），**修为永远不加**（满级后修为只能换渊痕）。
   */
  cycle: number;
  /**
   * 锁层挂机（D137 方案 d）：为 true 时清完一层不再下潜，停在本层反复刷。
   * 需要先花渊痕开定渊（`character.diveLockUnlocked`）；运行时态，不入档。
   */
  diveLock: boolean;
  /** 距下次自动打造还有多久（运行时态，不进存档） */
  craftTimer: number;
  /**
   * 五行碎片的「定向」选择（D104）。null = 不用碎片（默认）。
   *
   * 为什么是玩家手动选：碎片的全部价值在「我知道我要火行灵纹」。
   * 自动挑就退化成「随便给点加成」，定向工具变成随机加成，等于没做。
   * 这个选择本身不入档（下次开局重新选）：它不是收集进度，是操作意图。
   */
  fragmentAim: FragmentElement | null;
  /**
   * 新手引导走到第几条（0 = 刚开局；到 TUTORIAL_LENGTH 就是教完了）。
   *
   * **必须入档**：不然玩家关一次页面引导就从头再讲一遍 —— 对已经会玩的人
   * 来说这比没有引导更烦。它是「回不去的进度」，从任何别的字段都算不出来。
   */
  tutorialStep: number;
  /**
   * 图鉴（D87）：已收录的浊物 / 传奇 id。
   *
   * **必须入档**：它是「收集进度」，从任何别的字段都算不出来 —— 玩家杀过的怪、
   * 掉过的传奇都不会留在别处（地上会消失、背包会被换掉）。
   * 也只存 id：名字/描述/百分比全部由数据表算，不入档（存档铁律）。
   */
  codex: CodexState;
  /**
   * 成就（D87）：已达成的成就 id。
   *
   * **必须入档**：与图鉴同理，是「回不去的收集进度」（死亡次数、到过第几层这些
   * 事实里能算出大部分，但成就一旦达成就不该因为回刷低层而回退）。
   * 也只存 id —— 阈值/文案/奖励全在 `data/achievements.ts`。
   */
  achievements: AchievementState;
  /** 累计死亡次数（成就与面板用；与 `floorDeaths` 不同：那个是「本层死了几次」） */
  deaths: number;
  /** D168：累计获得过的仙品件数（成就 `xian-80` 的度量；入档，否则刷新后归零） */
  xianFound: number;
  /** 是否自动点天赋（见 SessionOptions.autoTalents） */
  readonly autoTalents: boolean;
  /**
   * 上一次闭关（离线）的结算摘要 —— **纯运行时态，不进存档**。
   * 只用来在界面上显示「闭关 6 小时：击杀 3 210 / 修为 8 400 / 出货 42 件」，
   * 显示过一次就该由 UI 侧清掉（渲染器只看 age，不负责删）。
   */
  offlineReport?: OfflineReport;
}

/** 离线结算摘要（显示用，数值全部来自 offline.OfflineGain） */
export interface OfflineReport {
  /** 实际结算时长（分钟） */
  readonly minutes: number;
  readonly kills: number;
  readonly xp: number;
  readonly items: number;
  readonly currency: number;
  readonly gems: number;
  /** 是否被 12 小时上限截断 */
  readonly capped: boolean;
  /** 显示计时（秒），渲染器用它做淡出 */
  age: number;
}

export interface SessionOptions {
  readonly classId: ClassId;
  readonly seed: number;
  readonly tables: { bases: readonly ItemBaseDef[]; affixes: readonly AffixDef[] };
  /** 初始天赋（talent 节点 id 列表；开关会被 switchOverridesFor 解析成运行时覆盖值） */
  readonly talentIds?: readonly string[];
  /**
   * 是否自动点天赋（默认 true）。
   *
   * 存在的唯一理由是**验收口径**：BALANCE 的天赋数值是按「自动点」标定的，
   * 但要做到「重建忠实度校验 / 无天赋基线对比」就必须能关掉它。
   * 关掉时玩家会攒着天赋点不花（等于少了一部分成长），只用于测量，不是给玩家的选项。
   */
  readonly autoTalents?: boolean;
  /** 起始周目（默认 0；读档/测试用，玩家侧只由 prestige 推进） */
  readonly cycle?: number;
}

export function createSession(opts: SessionOptions): GameSession {
  const rng = new Rng(opts.seed);
  const character = createCharacter(opts.classId);
  // opts.talentIds 在角色创建时合并（CharacterState.talentIds 是 readonly，用展开复制而不是赋值）
  const seeded = opts.talentIds?.length ? { ...character, talentIds: [...opts.talentIds] } : character;
  // 周目：怪物倍率在 spawnMonster 里按 cycle 应用，渊痕产出在击杀分支乘 cycleMarksMul
  const cycle = clampCycle(opts.cycle);
  const switches = switchOverridesFor(seeded.talentIds ?? []);
  const battle = createBattle(playerBattleFromCharacter(seeded), seeded.turbid, seeded, switches);

  return {
    diag: createSessionDiag(),
    character: seeded,
    bag: [],
    battle,
    ground: [],
    floats: [],
    log: [],
    rng,
    tables: opts.tables,
    wave: 0,
    floor: 1,
    floorDeaths: 0,
    escapeValveCount: 0,
    waveTimer: 0,
    switches,
    dropsFound: 0,
    kills: 0,
    floorKills: 0,
    floorMinutes: 0,
    breakthroughs: 0,
    soundCues: [],
    shake: 0,
    playedSeconds: 0,
    pocket: { huang: 0, mie: 0, xi: 0 },
    gemPouch: {},
    firstClearedFloors: [],
    maxFloorReached: 1,
    craftTimer: 0,
    fragmentAim: null,
    tutorialStep: 0,
    codex: createCodex(),
    achievements: createAchievements(),
    deaths: 0,
  xianFound: 0,
    cycle,
    diveLock: false,
    autoTalents: opts.autoTalents !== false,
  };
}

/** 还能打的目标（血量 > 0）。渲染和「清场判定」都用它，避免两处口径不一致 */
export function liveMonsters(s: GameSession): MonsterInPlay[] {
  return s.battle.monsters.filter((m) => m.hp > 0);
}

/**
 * 开一波。
 *
 * 第 `BOSS_EVERY` 波出镇守（单只），其余波按当前层的怪表环形撒一圈。
 * 怪不贴脸生成（spawnRing 距中心 260~330px），否则开局就被围死。
 */
/**
 * 已到过的最高层（含当前所在层）。
 *
 * 为什么用「到过」而不是「通关」：玩家掉到第 12 层打不过想回第 9 层刷，
 * 这时候第 12 层已经「到过」但没「通关」，如果按通关算他会被永久锁回去。
 */
export function highestFloorReached(s: GameSession): number {
  let hi = Math.max(s.floor, s.maxFloorReached ?? 1);
  for (const f of s.firstClearedFloors) if (f > hi) hi = f;
  return Math.min(MAX_FLOOR, Math.max(1, hi));
}

/** 可选层上限 = 已到过的最高层（不许跳关） */
export function floorSelectableMax(s: GameSession): number {
  return highestFloorReached(s);
}

/**
 * 转入指定层（回刷 / 换农点）。
 *
 * 返回是否真的换了层。规则：
 * - 只能选 1..floorSelectableMax(s)，选没到过的层返回 false（主线必须正推）
 * - 换层会清空场上怪与地上掉落、波次归零、立刻开新波（不保留旧层的半场战斗）
 * - **不清修为、不清浊气、不动装备**：换层是移动，不是重开
 */
export function setFloor(s: GameSession, floor: number): boolean {
  if (!Number.isFinite(floor)) return false;
  const target = Math.round(floor);
  // 越界直接拒绝，不静默夹取 —— 「我点了第 30 层，结果悄悄跳到第 27 层」是玩家最讨厌的行为
  if (target < 1 || target > floorSelectableMax(s)) return false;
  if (target === s.floor) return false;
  const from = s.floor;
  s.floor = target;
  s.maxFloorReached = Math.max(s.maxFloorReached, target);
  s.wave = 0;
  s.waveTimer = 0;
  s.battle.monsters = [];
  s.ground = [];
  if (!s.firstClearedFloors.includes(target)) {
    // 没通关过的层不计首通，但到过要记（否则回刷几层后最高层会被忘掉）
  }
  startWave(s);
  pushLog(s, `自第 ${from} 层转入第 ${target} 层`, '#6b3fa0');
  return true;
}

export function startWave(s: GameSession): void {
  s.wave += 1;
  const floor = s.floor;
  // 镇守波：一层 10 波、第 10 波是镇守；但层 28+（无尽层）只在能被 BOSS_EVERY_FLOORS 整除的层出
  const isBossWave = s.wave % BOSS_EVERY === 0 && hasBossFloor(floor);

  if (isBossWave) {
    const boss = bossOfTier(tierOfFloor(floor));
    if (boss) {
      s.battle.monsters.push(
        spawnMonster(boss, floor, uidCounter++, BATTLE_W / 2 + 210, BATTLE_H / 2, 'boss', [], s.cycle),
      );
      pushLog(s, `镇守现身：${boss.name}`, '#e05a3a');
      return;
    }
  }

  s.battle.monsters.push(
    ...spawnRing(monstersOfTier(tierOfFloor(floor)), floor, WAVE_SIZE, s.rng, uidCounter, s.cycle, s.wave),
  );
  uidCounter += WAVE_SIZE;
}

/**
 * 推进一帧。
 *
 * 五步顺序是刻意的，改之前先想清楚「谁依赖谁」：
 * 1) 战斗（谁掉血、谁死了）
 * 2) 消费战斗事件（击杀 → 修为/掉落；死亡 → 重开本波 + 扣修为）
 * 3) 掉落变老 + 自动拾取
 * 4) 清场 → 回气 → 开下一波 / 下潜一层
 * 5) 浮字与日志变老 + 自动打造
 */
export function tickSession(s: GameSession, dt: number): void {
  const d = Math.max(0, Math.min(0.25, Number.isFinite(dt) ? dt : 0));
  if (d === 0) return;

  // 1) 战斗
  tickBattle(s.battle, d, s.rng);

  // 2) 消费事件
  for (const e of s.battle.events) {
    if (e.kind === 'player-died') {
      pushLog(s, '气血枯竭，浊脉重凝', '#e05a3a');
      // 死因一行（D204）：只说「气血枯竭」等于什么也没说 —— 玩家想知道是谁打的、多少。
      // 数据来自 `battle.lastFatal`（只在致死那一下写），这里只负责翻译成人话。
      const fatal = s.battle.lastFatal;
      if (fatal && Number.isFinite(fatal.amount) && fatal.amount > 0) {
        const absorbedText =
          fatal.absorbed > 0 ? `（罡气挡掉 ${Math.round(fatal.absorbed)}）` : '';
        pushLog(
          s,
          `死于「${fatal.source}」一击 ${Math.round(fatal.amount)}${absorbedText}`,
          '#c25a48',
        );
      }
      pushCue(s, 'death');
      // 死亡 ≠ 清场。旧逻辑里死亡清怪 → isCleared 立即为真 → 白送一波进度，
      // 模拟里 10 分钟死 17 次却推了 27 波。现在：重开本波，不给进度。
      s.battle.deathCleanup = false;
      s.floorDeaths += 1;
      s.battle.floorDeaths += 1;
      s.deaths += 1;
      addShake(s, SHAKE_ON_DEATH);
      // 修为惩罚：掉 10%，但不掉装备也不掉层（惩罚要疼，但不能让人想退游）
      if (s.character.xp > 0) {
        const loss = Math.max(1, Math.floor(s.character.xp * DEATH_XP_PENALTY));
        const kept = Math.max(0, s.character.xp - loss);
        if (kept !== s.character.xp) {
          s.character = { ...s.character, xp: kept };
          pushLog(s, `修为受损 -${loss}`, '#6d665c');
        }
      }
      // D113 逃生阀：同一层**连续**死 ≥3 次 → 自动回退 1 层。
      //
      // 为什么必须有：D110 定了「本层回第 1 波、层不降」保住了心理成本，
      // 但「层不降 = 没有逃生阀」—— 一旦某层真打不过，玩家就是
      // 「6s 冷却 → 回第 1 波 → 再死」的死锁（实测种子 2026 在威胁 ×5 下死 160 次）。
      // 这不是难度，是死锁；渐进威胁只会把死锁从层 22 搬到层 60。
      //
      // 为什么退 1 层是唯一正解：
      //   - 「刚才清得过的层」永远存在 ⇒ 结构上保证玩家有出路；
      //   - 成本有界：正常死亡 1.8min，只有进入死锁才付 3.7min/次的退层成本；
      //   - 可学习：玩家会明白「这层硬打不过，退一层刷装备再回来」，这正是刷宝循环。
      // 层 1 无处可退时仍按 D110 处理（回第 1 波），不会退到 0 层。
      if (s.floor > 1 && s.floorDeaths >= ESCAPE_VALVE_DEATHS) {
        // D117 实验：退 **1** 层时实测有种子反复撞墙（层 f 死 3 次→退到 f−1→清完立刻回 f→再死 3 次），
        // 一轮循环只花 2min ⇒ 900min 内能撞 20+ 次。退 2 层把「重新爬回墙前」的成本抬到两层的量级，
        // 让每次循环都多刷一批装备，这是在**不改威胁倍率**的前提下压缩尾部。
        const back = Math.min(ESCAPE_VALVE_LAYERS, s.floor - 1);
        pushLog(s, `连死 ${s.floorDeaths} 次，退回第 ${s.floor - back} 层`, '#c8553d');
        s.floor -= back;
        s.maxFloorReached = Math.max(s.maxFloorReached, s.floor);
        s.floorDeaths = 0;
        s.battle.floorDeaths = 0;
        s.escapeValveCount += 1;
        s.battle.monsters = [];
        s.waveTimer = 0;
        s.wave = 0;
        startWave(s);
        continue;
      }
      s.battle.monsters = [];
      s.waveTimer = 0;
      // D110-c-light：死亡 → **本层回到第 1 波**（层不降、修为/掉落全保留）。
      // 为什么不是「重开本波」：8s × 42 死 = 0.6%，测不到也感觉不到（实测满级时长一位不差）。
      // 为什么不是「掉层」：放置游戏里掉层会让玩家直接停手，心理成本远大于时间成本。
      // 为什么保留 10% 修为惩罚：它已经写进 DECISIONS，且是「疼但不劝退」的既有口径；
      //   本层重开是时间代价，两者不叠加成双重惩罚（shuzhi D110）。
      s.wave = 0;
      startWave(s);
    } else if (e.kind === 'player-hit' || e.kind === 'player-crit') {
      // 伤害浮字：暴击金色更大，普攻灰白 —— 玩家不看数字也能感到"这一下重"
      const crit = e.kind === 'player-crit';
      pushCue(s, crit ? 'crit' : 'hit');
      // D199 震动：暴击比普攻重一倍（玩家不看数字也分得出这一下更疼）
      addShake(s, crit ? SHAKE_ON_CRIT : SHAKE_ON_HIT);
      pushFloat(s, {
        text: crit ? `${e.amount}!` : String(e.amount),
        // 抖动必须**确定性**：浮字是纯显示，吃 rng 会把「第几条随机数」整体错位，
        // 后续所有掉落序列都跟着变 —— 重建时实测种子 3 的满级时长因此偏离 10%。
        x: (e.x ?? BATTLE_W / 2) + jitter(e.amount, 7),
        y: (e.y ?? BATTLE_H / 2) - 8,
        color: crit ? '#d4a13c' : '#d8d3c4',
        life: crit ? 0.95 : 0.75,
        rise: crit ? 40 : 30,
      });
    } else if (e.kind === 'monster-hit') {
      // 挨打比打人轻：玩家要知道自己在掉血，但不该被自己的伤害震到
      addShake(s, SHAKE_ON_MONSTER_HIT);
      pushFloat(s, {
        text: e.label,
        x: (e.x ?? BATTLE_W / 2) + jitter(e.amount, 5),
        y: (e.y ?? BATTLE_H / 2) - 30,
        color: '#c25a48',
        life: 0.9,
        rise: 34,
      });
    } else if (e.kind === 'player-kill' && e.monster) {
      const killed = e.monster;
      pushCue(s, killed.rarity === 'boss' ? 'boss' : 'kill');
      // 累计与本层击杀：按层真实击杀率（BALANCE §21.11）的唯一实测来源
      s.kills += 1;
      s.floorKills += 1;
      addShake(s, killed.rarity === 'boss' ? SHAKE_ON_BOSS_KILL : SHAKE_ON_KILL);
      s.diag.killsByRarity[killed.rarity] += 1;
      // 图鉴（D87）：收录这只浊物。recordMonsterKill 在已收录时返回原对象，
      // 所以这里只在「第一次遇到」时复制数组 + 播报，热路径无额外开销。
      // D170：异变体那一行由 recordMonsterKill 走**产品路径**解锁（跨过 dev 钩子），
      // 所以这里只调一次、再按「哪一段真变了」分别播报。
      const prevCodex = s.codex;
      const nextCodex = recordMonsterKill(prevCodex, killed.defId, killed.variant === true);
      if (nextCodex !== prevCodex) {
        s.codex = nextCodex;
        const def = getMonster(killed.defId);
        if (nextCodex.monsters !== prevCodex.monsters && def) {
          pushLog(s, codexUnlockText('monster', def.name), '#8eeae2');
        }
        if (nextCodex.variants !== prevCodex.variants) {
          pushLog(s, codexUnlockText('variant', '异变体'), '#c9a3ff');
        }
      }
      // 五行碎片（REQ §3 第 7 条 / D104）：**只有镇守掉**，走独立掉落槽，
      // 不进 DROP_CHANCE 三分类 —— 否则会挤压法宝份额（妖纹 D95 踩过）。
      if (killed.rarity === 'boss') {
        const def = getMonster(killed.defId);
        if (def) {
          const el = fragmentElementForBoss(s.floor, tierOfFloor(s.floor));
          const before = s.character.fragments ?? EMPTY_FRAGMENTS;
          const next = addFragments(before, el, 1);
          if (next !== before) {
            s.character = { ...s.character, fragments: next };
            pushFloat(s, {
              text: `+1 ${FRAGMENT_TERM[el]}行碎片`,
              x: (killed.x ?? BATTLE_W / 2) + jitter(s.kills, 10),
              y: (killed.y ?? BATTLE_H / 2) - 26,
              color: '#7fb8a0',
              life: 0.9,
              rise: 26,
            });
            pushLog(s, `镇守掉落 · ${FRAGMENT_NAME[el]}（打造时可定向 ${FRAGMENT_TERM[el]} 行灵纹）`, '#7fb8a0');
          } else {
            // 已到上限：安静不刷屏，但要能解释「为什么没掉」（否则玩家以为掉率坏了）
            pushLog(s, `${FRAGMENT_NAME[el]} 已满 ${FRAGMENT_CAP}，不再累积`, '#6d665c');
          }
        }
      }
      // 修为：只在这里加一次。battle 里的 xpGained 是给 UI 看的累计量，不是给角色加的
      const before = s.character.step;
      // 满级（台阶 80）后修为没有去处：xpForStep(80) = Infinity，gainXp 静默吞掉。
      // D36-A 定：满级后的修为 1:1 转成渊痕（长线内容物，不产生任何战力）。
      if (before >= TOTAL_STEPS - 1) {
        // 周目只放大渊痕产出（线性），修为永远不加：满级后修为本来也只能换渊痕。
        const gained = Math.max(0, Math.round(killed.xp * cycleMarksMul(s.cycle)));
        const marksBefore = s.character.marks ?? 0;
        const marksAfter = marksBefore + gained;
        s.character = { ...s.character, marks: marksAfter };
        // 满级后修为的唯一去处是渊痕，玩家必须看得见它在涨：
        // 只进数字不进画面的话，满级那一刻等于「游戏结束了」而不是「另一条线开始了」。
        pushFloat(s, {
          text: `+${gained} 渊痕`,
          x: (killed.x ?? BATTLE_W / 2) + jitter(marksAfter, 8),
          y: (killed.y ?? BATTLE_H / 2) - 18,
          color: '#6b3fa0',
          life: 0.8,
          rise: 26,
        });
        // 每跨过一个 10 万门槛报一次（按 MARKS_COST 的最小档对齐），夜里挂机也不刷屏
        const step = 100_000;
        if (Math.floor(marksAfter / step) > Math.floor(marksBefore / step)) {
          pushLog(s, `渊痕 ${Math.floor(marksAfter / step) * step}`, '#6b3fa0');
        }
      } else {
        s.character = gainXp(s.character, killed.xp);
      }
      if (s.character.step > before) {
        s.breakthroughs += s.character.step - before;
        // 满级那一下要单独说：它不再是「又一重」，而是「这条线到头了，另一条线开始了」。
        // 玩家如果不知道这里按 N 能轮回，他会以为游戏卡在满级不动（D180）。
        pushLog(s, breakthroughLogText(s.character.step), '#d4a13c');
        pushCue(s, s.character.step >= TOTAL_STEPS - 1 ? 'ascend' : 'levelup');
        pushFloat(s, {
          text: s.character.step >= TOTAL_STEPS - 1 ? '渡劫圆满！' : '突破！',
          x: BATTLE_W / 2,
          y: BATTLE_H / 2 - 80,
          color: '#d4a13c',
          life: 1.6,
          rise: 30,
        });
        // 突破会改属性，战斗态必须跟着重算 —— 否则升了境界伤害不变，玩家会以为没生效
        // 顺手把新到手的天赋点花掉（放置游戏不让玩家手点 130 次，理由见 talents-auto.ts）
        // D207：玩家手动点过天赋之后，自动分配必须停手 —— 否则玩家刚点完一条线，
        // 下一次突破就把点数接管走了，「手动」变成临时状态。
        if (s.autoTalents && s.character.manualTalents !== true) {
          s.character = autoAllocateTalents(s.character, s.firstClearedFloors.length);
        }
        syncBattleFromCharacter(s);
      }

      // 掉落三分类（BALANCE §5/§11.3）：法宝 40% / 通货 47.5% / 玉简 12.5%。
      // killed.tier 实际存的是层（spawnMonster 的 floor），直接透传。
      // 之前包一层 tierOfFloor 会把层 1~9 全压成 ilvl 4，玄/地/天三档词缀永远洗不出。
      s.dropsFound += 1;
      // D39：通货/玉简吃「机缘」（lootQuantity），法宝吃「仙缘」（lootRarity）。
      // 为什么数量只给通货/玉简：法宝份额若也放大，段②「装备成型 6.9h」会被 +23% 压到 4.5h，
      // 直接击穿 GDD 的 6h。cap 0.58 保证 (0.475+0.125)(1+q) <= 0.95，法宝份额永远 >= 5%。
      const lootStats = characterStats(s.character);
      const luckQ = Math.max(
        0,
        Math.min(LOOT_QUANTITY_CAP, Number.isFinite(lootStats.lootQuantity) ? lootStats.lootQuantity : 0),
      );
      // 妖纹的「数量」加成（D95）：q 来自这只怪身上的 dropBonus 合计（钳到 MONSTER_QTY_CAP=0.24）。
      // 口径（shuzhi v4.44）：通货/玉简份额 ×(1+q)，法宝吃剩下的 1 − 0.6(1+q)。
      // ⚠️ 这意味着一只 4 条妖纹的怪法宝份额只剩 0.256 —— 精英的法宝倍数**完全靠掉率闸抬**，
      //    所以 dropBonus 不能给大（给到 0.48 时 rare 反而比 normal 穷，即「越精英越穷」）。
      const affixQ = Math.min(
        MONSTER_QTY_CAP,
        sumMonsterAffixes(killed.affixIds).dropBonus,
      );
      // 异变体（D160）：额外 +10% 数量，**独立于 MONSTER_QTY_CAP**（否则会被 0.24 的钳位吞掉，
      // 变成又一个「有字段没效果」的死通道 —— 这是本项目第八次同类风险，所以在写的时候就分开）。
      const variantQ = killed.variant === true ? VARIANT_EXTRA_DROP : 0;
      const curShare = CURRENCY_SHARE * (1 + luckQ) * (1 + affixQ + variantQ);
      const gemShare = GEM_SHARE * (1 + luckQ) * (1 + affixQ + variantQ);
      // D46.1：**闸在分流之前**。设计原意是「28% 的击杀出货，内部再按 40/47.5/12.5 分三类」，
      // 旧实现把分流放在闸前 → 通货/玉简各超发 3.57 倍（实测通货 47.5%/杀 vs 设计 13.6%/杀）。
      // 现在没出货的击杀什么都不掉，这是设计，不是 bug。
      const gated = rollDropGate(s.rng, killed.rarity);
      const curRoll = gated ? s.rng.float(0, 1) : 1;
      if (!gated) {
        // 什么也不掉：不掷后面的骰子，保证随机数消耗与「出货/不出货」一致可复现
      } else if (curRoll < curShare) {
        const cur = rollCurrency(s.rng, s.floor);
        if (cur) {
          s.pocket[cur.id] = (s.pocket[cur.id] ?? 0) + 1;
          s.diag.currencyByRarity[killed.rarity] += 1;
          pushCue(s, 'currency');
          pushFloat(s, {
            text: cur.name,
            x: killed.x,
            y: killed.y - 26,
            color: '#d4a13c',
            life: 1.1,
            rise: 22,
          });
        }
      } else if (curRoll < curShare + gemShare) {
        const gemStep = unlockedGems(s.character).reduce((m, g) => Math.max(m, g.unlockStep), 0);
        const gem = rollGemDrop(s.rng, gemStep);
        if (gem) {
          s.gemPouch[gem.id] = (s.gemPouch[gem.id] ?? 0) + 1;
          s.diag.gemByRarity[killed.rarity] += 1;
          pushCue(s, 'gem');
          pushFloat(s, {
            text: `玉简·${gem.name}`,
            x: killed.x,
            y: killed.y - 26,
            color: '#6b3fa0',
            life: 1.1,
            rise: 22,
          });
        }
      } else {
        const items = rollMonsterDropAll(
          killed.defId,
          killed.tier,
          killed.rarity,
          s.rng,
          s.tables,
          lootStats.lootRarity,
          // 闸已经在外面掷过了（D46.1），这里不能再掷一次
          true,
        );
        for (const item of items) {
          addGroundDrop(s, item, killed.x, killed.y);
          s.diag.itemsByRarity[killed.rarity] += 1;
        }
        // 传奇单独一个音：它是本作最贵的掉落（图鉴 12 条 / 段④ 主内容），
        // 和普通法宝同一个声音等于把最值得庆祝的一刻藏起来。
        if (items.length > 0) pushCue(s, items.some((it) => it.legendary !== undefined) ? 'legendary' : 'drop');
      }
    }
  }
  s.battle.events = [];

  // 3) 掉落变老 + 自动拾取
  const delay = s.switches.pickupDelay ?? PICKUP_DELAY;
  for (const g of s.ground) {
    g.age += d;
    if (!g.picked && g.age >= delay) {
      g.picked = true;
      const res = pickup(s.character, s.bag, g.item);
      s.character = res.character;
      s.bag = res.bag;
      // 图鉴（D87）：拿到带传奇效果的法宝就收录。判定用掉落物本身而不是
      // 「装没装上」—— 包里躺着的传奇也算收集到了（换装是另一件事）。
      // D168：累计仙品件数（成就在 tick 末尾结算，这里只记账；不判「装没装上」）。
      if (g.item.rarity === 'xian') s.xianFound += 1;
      if (g.item.legendary) {
        const nextCodex = recordLegendary(s.codex, g.item.legendary);
        if (nextCodex !== s.codex) {
          s.codex = nextCodex;
          const def = getLegendary(g.item.legendary);
          if (def) pushLog(s, codexUnlockText('legendary', def.name), '#f0d264');
        }
      }
      if (res.equipped) {
        syncBattleFromCharacter(s);
        if (res.message) pushLog(s, res.message, '#8eeae2');
      }
    }
  }
  s.ground = s.ground.filter((g) => !g.picked);

  // 4) 清场 → 回气 → 下一波 / 下潜
  if (isCleared(s.battle)) {
    s.waveTimer += d;
    if (s.waveTimer >= WAVE_GAP) {
      // 波末回气：**清完一波只给一次**。
      // 曾经写在 isCleared 分支里每帧加 25% → gap 0.9s×54 帧 ≈ 每波满血，入伤预算被放大一倍。
      if (!s.battle.deathCleanup) regenAtWaveEnd(s);
      s.waveTimer = 0;
      // 一层 = BOSS_EVERY(10) 波，第 10 波清完下潜 1 层（逐层下潜；曾写 +3 导致 1→4→7→9 跳层）。
      // **不要在这里判 hasBossFloor**：无尽层（28+）只有 30/35/40/45 有镇守，
      // 若下潜也要求「这层有镇守」，层 28 就永远没有镇守波 → 永远下不去 = 硬天花板（ceshi 实测 6/6 种子卡 28）。
      // 主线 1~27 每层都有镇守且第 10 波就是镇守波，所以去掉这个判断后主线行为一位不变。
      const lockHolding =
        s.diveLock === true && s.character.diveLockUnlocked === true && s.floor < MAX_FLOOR;
      if (s.wave % BOSS_EVERY === 0 && s.floor < MAX_FLOOR && !lockHolding) {
        const cleared = s.floor;
        s.floor = Math.min(MAX_FLOOR, s.floor + 1);
        s.maxFloorReached = Math.max(s.maxFloorReached, s.floor);
        pushLog(s, `深入魔渊第 ${s.floor} 层`, '#6b3fa0');
        s.floorDeaths = 0;
        s.battle.floorDeaths = 0;
        if (!s.firstClearedFloors.includes(cleared)) {
          s.firstClearedFloors.push(cleared);
          // 首通给 2 点天赋，也要立刻花掉（否则点数攒着不生效）
          // D207：玩家手动点过天赋之后，自动分配必须停手 —— 否则玩家刚点完一条线，
        // 下一次突破就把点数接管走了，「手动」变成临时状态。
        if (s.autoTalents && s.character.manualTalents !== true) {
          s.character = autoAllocateTalents(s.character, s.firstClearedFloors.length);
        }
          syncBattleFromCharacter(s);
        }
      }
      startWave(s);
    }
  } else {
    s.waveTimer = 0;
  }

  // 4.5) 震动衰减（纯显示态；放在浮字之前，让本帧刚产生的事件不被同帧衰减）
  s.shake = decayShake(s.shake, dt);
  // D205：floorMinutes 之前只声明、从没累加过（注释说它算「本层真实击杀率」，
  // 但没人喂它 ⇒ 永远是 0，任何读它的诊断都在读假数）。这里与 playedSeconds 同口径累加。
  s.floorMinutes += Math.max(0, Math.min(0.25, Number.isFinite(dt) ? dt : 0));
  maybeStuckHint(s);
  s.playedSeconds += Math.max(0, Math.min(0.25, Number.isFinite(dt) ? dt : 0));

  // 5) 浮字与日志变老
  for (const f of s.floats) f.age += d;
  s.floats = s.floats.filter((f) => f.age < f.life);
  for (const l of s.log) l.age += d;

  // 6) 自动打造（记账式通货 → 花在战力最高的几件上）
  s.craftTimer += d;
  if (s.craftTimer >= CRAFT_TICK) {
    s.craftTimer = 0;
    runAutoCraft(s);
  }

  // 7) 成就结算（D87）
  // 放在 tick 末尾一次算完，而不是在「击杀/死亡/通关/拾取」四处各插一遍 ——
  // 四个入口各插一次，早晚会出现「打死了但成就没弹」的不一致（图鉴当年就是这么漏的）。
  syncAchievements(s);
}

/** 确定性抖动（-n..+n）：只给浮字错开位置用，不消耗 rng */
function jitter(seed: number | undefined, n: number): number {
  const v = Math.abs(Math.round((seed ?? 0) * 2654435761)) % 1000;
  return ((v / 1000) * 2 - 1) * n;
}

/** 波末回气：一次给满比例（25%） */
function regenAtWaveEnd(s: GameSession): void {
  const ratio = s.switches.waveEndRegen ?? WAVE_END_REGEN;
  const p = s.battle.player;
  if (p.hp <= 0) return;
  p.hp = Math.min(p.maxHp, p.hp + p.maxHp * ratio);
}

/** 地上放一件掉落（超上限就丢掉最老的，防止挂机一天堆几千件） */
function addGroundDrop(s: GameSession, item: Item, x: number, y: number): void {
  // 位置抖动：完全重叠只能看到一件，玩家会以为掉率低
  const jx = s.rng.float(-26, 26);
  const jy = s.rng.float(-16, 16);
  s.ground.push({
    id: uidCounter++,
    x: Math.max(24, Math.min(BATTLE_W - 24, x + jx)),
    y: Math.max(24, Math.min(BATTLE_H - 24, y + jy)),
    item,
    age: 0,
    picked: false,
  });
  if (s.ground.length > MAX_GROUND_DROPS) {
    // 先扔最老的（年龄大的），保留刚掉的
    const sorted = [...s.ground].sort((a, b) => a.age - b.age);
    s.ground = sorted.slice(0, MAX_GROUND_DROPS);
  }
}

/**
 * 把通货袋里的存量转成打造计划。
 *
 * 只按数量下料，什么时候打、打在哪件上由 runAutoCraft 决定 ——
 * 这样「计划」和「执行」分开，测试能直接验计划生成。
 */
export function craftPlanFromPocket(pocket: Readonly<Record<CurrencyId, number>>): CraftPlan {
  const counts: Partial<Record<CurrencyId, number>> = {};
  for (const id of ['huang', 'mie', 'xi'] as const) {
    const n = Math.floor(pocket[id] ?? 0);
    if (n > 0) counts[id] = n;
  }
  return { counts };
}

/** 自动打造：把袋子里的通货花掉（花不掉的留到下次，不硬花） */
function runAutoCraft(s: GameSession): void {
  const plan = craftPlanFromPocket(s.pocket);
  if (Object.keys(plan.counts).length === 0) return;
  const out = runCraftPlan(s.character, s.bag, plan, s.tables.affixes, s.rng, {
    fragment: s.fragmentAim,
  });
  s.character = out.character;
  s.bag = out.bag;
  for (const [id, n] of Object.entries(out.spent)) {
    const key = id as CurrencyId;
    s.pocket[key] = Math.max(0, (s.pocket[key] ?? 0) - (n ?? 0));
  }
  if (out.fragmentsUsed > 0 && s.fragmentAim) {
    const left = s.character.fragments?.[s.fragmentAim] ?? 0;
    pushLog(
      s,
      `定向打造 · 用掉 ${out.fragmentsUsed} 颗${FRAGMENT_TERM[s.fragmentAim]}行碎片（余 ${left}）`,
      '#7fb8a0',
    );
  }
  if (out.messages.length > 0) {
    pushLog(s, out.messages[out.messages.length - 1], '#d4a13c');
    syncBattleFromCharacter(s);
  }
}

/**
 * 把角色面板同步到战斗态。
 *
 * **保留当前血量和浊气**，只换上限和加成 —— 回满血等于换装备能当药吃。
 */
export function syncBattleFromCharacter(s: GameSession): void {
  const next = playerBattleFromCharacter(s.character);
  // D123：神通轮转必须跟着境界刷新。旧实现只在 createBattle 时算一次快照 ⇒
  // 第 4/9/18/27 重解锁的神通终生不进轮转（实测武器型神通伤害占比 0.00%）。
  // 冷却表用并集维护：新解锁的从 0 冷却开始，被移除的丢弃（不重置别的神通已就绪状态）。
  const rotationNext = unlockedSkills(s.character).filter((sk) => sk.cooldown > 0);
  const ids = new Set(rotationNext.map((sk) => sk.id));
  for (const id of Object.keys(s.battle.castCooldowns)) { if (!ids.has(id)) delete s.battle.castCooldowns[id]; }
  for (const id of Object.keys(s.battle.skillOverdue)) { if (!ids.has(id)) delete s.battle.skillOverdue[id]; }
  for (const id of ids) {
    if (!(id in s.battle.castCooldowns)) s.battle.castCooldowns[id] = 0;
    if (!(id in s.battle.skillOverdue)) s.battle.skillOverdue[id] = 0;
  }
  s.battle.skillRotation = rotationNext;
  const cur = s.battle.player;
  next.hp = Math.min(next.maxHp, Math.max(1, Math.round(cur.hp)));
  next.shield = Math.min(next.shieldMax, Math.max(0, Math.round(cur.shield)));
  next.mana = Math.min(next.maxMana, Math.max(0, Math.round(cur.mana)));
  next.x = cur.x;
  next.y = cur.y;
  s.battle.player = next;
}

/** 往右下角日志塞一行（新的在上面） */
export function pushLog(s: GameSession, text: string, color: string): void {
  s.log.unshift({ text, color, age: 0 });
  if (s.log.length > MAX_LOG_LINES) s.log.length = MAX_LOG_LINES;
}

/** 往画面上飘一个字 */
export function pushFloat(s: GameSession, spec: Omit<FloatText, 'age'>): void {
  s.floats.push({ ...spec, age: 0 });
}

/**
 * 同一层泡太久就给一次「往哪走」的提示（D205）。
 *
 * 只在**没有在等复活**、且这一层还没提示过时触发。文案刻意给三条具体动作，
 * 而不是「加油」：卡住的玩家需要的是出口，不是鼓励。
 */
export function maybeStuckHint(s: GameSession): void {
  if (s.floorMinutes < STUCK_HINT_SECONDS) return;
  if (s.stuckHintFloor === s.floor) return;
  // 死亡冷却里不算卡住 —— 那是「正在被劝退」，提示会显得像在嘲讽。
  if (s.battle.reviveCooldown > 0) return;
  s.stuckHintFloor = s.floor;
  pushLog(
    s,
    `第 ${s.floor} 层泡了 ${Math.floor(s.floorMinutes / 60)} 分钟：P 回浅层攒装备 · T 看周天图 · H 看操作`,
    '#6d665c',
  );
}

/**
 * 排一个音效。
 *
 * 超过 `MAX_SOUND_CUES` 就**丢弃新的**（保留先到的）：先到的通常是「打死怪」这种大事，
 * 后到的多是同一帧里的次要掉落；反过来丢弃旧的会让音效听起来在抽帧。
 */
export function pushCue(s: GameSession, name: SoundName): void {
  if (s.soundCues.length >= MAX_SOUND_CUES) return;
  s.soundCues.push(name);
}

/** 取走并清空音效队列（主循环每帧调一次）。 */
export function drainSoundCues(s: GameSession): SoundName[] {
  if (s.soundCues.length === 0) return [];
  const out = s.soundCues.slice();
  s.soundCues.length = 0;
  return out;
}

/** 身上穿了几件仙品（成就用；只数装备，不数背包 —— 收藏与战力分开看） */
function xianEquippedCount(ch: CharacterState): number {
  let n = 0;
  for (const item of Object.values(ch.equipment)) {
    if (item && item.rarity === 'xian') n += 1;
  }
  return n;
}

/** 从会话现算成就事实（纯读，无副作用；面板与结算共用同一份口径） */
export function sessionAchievementFacts(s: GameSession): AchievementFacts {
  return {
    kills: s.kills,
    maxFloor: Math.max(s.floor, s.maxFloorReached ?? 1),
    clearedFloors: s.firstClearedFloors.length,
    codexMonsters: s.codex.monsters.length,
    codexLegendaries: s.codex.legendaries.length,
    step: s.character.step,
    deaths: s.deaths,
    xianEquipped: xianEquippedCount(s.character),
    xianFound: s.xianFound,
    cycle: s.cycle,
  };
}

/**
 * 结算成就：新达成的奖励渊痕（一次性、有界，见 `data/achievements.ts` 纪律 2）。
 *
 * 奖励只加渊痕**不动修为/战力/掉率** —— 后三者会进 §2 供给表并触发 D64 棘轮刹车。
 */
export function syncAchievements(s: GameSession): void {
  const res = unlockAchievements(s.achievements, sessionAchievementFacts(s));
  if (res.state === s.achievements) return;
  s.achievements = res.state;
  let reward = 0;
  for (const def of res.unlocked) {
    reward += def.reward;
    pushLog(s, achievementUnlockText(def), '#d4a13c');
  }
  if (reward > 0) {
    s.character = { ...s.character, marks: (s.character.marks ?? 0) + reward };
    pushFloat(s, {
      text: `成就 +${reward} 渊痕`,
      x: BATTLE_W / 2,
      y: BATTLE_H / 2 - 110,
      color: '#d4a13c',
      life: 1.8,
      rise: 26,
    });
  }
}

/**
 * 突破日志的文案（纯函数，单测直接钉边界）。
 *
 * 为什么要单独一个函数：满级那一下如果和别的重数一样只写「突破 81 重」，
 * 玩家看到的是一句**不存在的境界**（只有九境九重 = 81 台阶，没有「第 81 重」），
 * 而且他不会知道这儿能按 N 轮回 —— 满级那一刻就变成「游戏结束了」而不是「另一条线开始了」。
 */
export function breakthroughLogText(step: number): string {
  if (isMaxStep(step)) return '渡劫圆满 · 第九境已成 —— 按 N 入轮回';
  const safe = Number.isFinite(step) ? Math.max(0, Math.floor(step)) : 0;
  return `突破 ${Math.min(TOTAL_STEPS, safe + 1)} 重`;
}

/**
 * 轮回条件：满级（第九境渡劫 = step 80）且不在死亡冷却中。
 *
 * 为什么只判满级、不要求「清完第 76 层」：满级是修为线的终点，层数是装备线；
 * 两条线不该互相阻塞（想刷装备的人可以随时轮回，反之亦然）。
 */
// D193：轮回不可撤销（清空境界与装备），必须二次确认。
// 判定抽成纯函数：内联在 main.ts 里既没法单测，也没法让按钮 / 手势入口复用同一套规则。
export const PRESTIGE_CONFIRM_MS = 6000;

/** 二次确认是否仍在窗口内。时钟倒退、未武装、脏值一律 false（宁可不执行，也不误删进度）。 */
export function prestigeConfirmArmed(params: {
  readonly armedAt: number;
  readonly nowMs: number;
  readonly windowMs?: number;
}): boolean {
  const a = Number.isFinite(params.armedAt) ? params.armedAt : 0;
  const t = Number.isFinite(params.nowMs) ? params.nowMs : 0;
  const wRaw = Number.isFinite(params.windowMs) ? params.windowMs : PRESTIGE_CONFIRM_MS;
  const w = Math.max(0, wRaw as number);
  if (a <= 0) return false;
  const dt = t - a;
  return dt >= 0 && dt <= w;
}

export function prestigeReady(s: GameSession): boolean {
  return isMaxStep(s.character.step) && s.battle.reviveCooldown <= 0;
}

/**
 * 轮回：保留「跨周目」的东西（渊痕、图鉴、成就、引导进度、死亡计数），
 * 重置「单周目」的东西（境界、属性、装备、背包、通货、波次、首通账本）。
 *
 * 三条硬纪律（见 src/data/cycles.ts 文件头）：不给修为、只给渊痕与品阶、
 * 倍率只乘怪不乘玩家。
 */
export function prestige(s: GameSession): boolean {
  if (!prestigeReady(s)) return false;
  const nextCycle = clampCycle(s.cycle + 1);
  const marks = s.character.marks ?? 0;
  const fresh = createCharacter(s.character.classId);
  s.character = { ...fresh, marks };
  s.cycle = nextCycle;
  s.bag = [];
  s.ground = [];
  s.pocket = { huang: 0, mie: 0, xi: 0 };
  s.gemPouch = {};
  s.floor = 1;
  s.wave = 0;
  s.waveTimer = 0;
  s.floorDeaths = 0;
  s.escapeValveCount = 0;
  s.floorKills = 0;
  s.floorMinutes = 0;
  s.dropsFound = 0;
  s.craftTimer = 0;
  s.fragmentAim = null;
  s.firstClearedFloors = [];
  s.maxFloorReached = 1;
  // 战斗态整体重建：player 从新角色派生，怪按新周目倍率生成
  s.battle = createBattle(playerBattleFromCharacter(s.character), s.character.turbid, s.character, s.switches);
  startWave(s);
  pushLog(s, '轮回 · ' + cycleName(nextCycle) + '：浊物更凶，渊痕更厚', '#6b3fa0');
  // 轮回是本作最大的一件事（一条时间线的终点 + 另一条的开头），必须有自己的声音。
  // 先清掉本帧残留的 cue：不然「满级那一下的 ascend」和「轮回的 ascend」会叠着播。
  s.soundCues.length = 0;
  pushCue(s, 'ascend');
  return true;
}

/**
 * 把背包第 index 件穿上（D189）。
 *
 * 为什么必须有：自动换装（`decideEquip`）只在「同部位战力比 ≥ 1.02」时动手，而玩家
 * 常常想穿一件「战力略低但有传奇 / 有对口词条」的法宝 —— 没有手动入口，那些件只能烂在包里。
 *
 * 语义（与装备坑的「戒指两坑」兼容）：
 * - 用 `slotForItem` 决定装哪一坑（戒指优先空坑，都满则换较弱那个）；
 * - **换下来的那件回背包**，不凭空消失（否则玩家会以为被吞了）；
 * - 穿上后立刻 `syncBattleFromCharacter`（否则面板变了、战斗里的属性没变）。
 */
export function equipFromBag(s: GameSession, index: number): { ok: boolean; message: string } {
  if (!Number.isInteger(index) || index < 0 || index >= s.bag.length) {
    return { ok: false, message: '这一格是空的' };
  }
  const item = s.bag[index];
  if (!item) return { ok: false, message: '这一格是空的' };
  const slot = slotForItem(s.character, item);
  if (!slot) return { ok: false, message: `不知道 ${item.name} 该装在哪` };
  const res = equip(s.character, slot, item);
  if (!res.ok) return { ok: false, message: res.message };
  const nextBag = s.bag.filter((_, i) => i !== index);
  if (res.replaced) nextBag.push(res.replaced);
  s.character = res.character;
  s.bag = nextBag;
  syncBattleFromCharacter(s);
  pushLog(s, `已装备 ${item.name}`, '#d4a13c');
  return { ok: true, message: res.message };
}

/**
 * 把背包第 index 件丢掉（D189）。**不给任何产出** —— 它只是「垃圾清理」通道。
 *
 * 为什么不给分解产出：掉率与通货供给都是 BALANCE 精确标定过的（§5 / §16），
 * 在这里凭空发钱等于给经济开第二套出口，会把段② 时长压出窗口而没人知道为什么。
 */
export function discardFromBag(s: GameSession, index: number): { ok: boolean; message: string } {
  if (!Number.isInteger(index) || index < 0 || index >= s.bag.length) {
    return { ok: false, message: '这一格是空的' };
  }
  const item = s.bag[index];
  if (!item) return { ok: false, message: '这一格是空的' };
  s.bag = s.bag.filter((_, i) => i !== index);
  pushLog(s, `丢弃 ${item.name}`, '#6d665c');
  return { ok: true, message: `已丢弃 ${item.name}` };
}


/**
 * 底栏「还有几波见到镇守」的文案（D194）。
 *
 * 一层 = BOSS_EVERY 波，第 BOSS_EVERY 波出镇守。玩家要自己心算「还差几波」太累，
 * 而挂机游戏里「离下一个里程碑多远」是最基本的反馈。
 *
 * 四态：本波镇守 / 距镇守 N 波 / 下潜中（层 28+ 的大多数层没有镇守，那里写
 * 「距镇守 7 波」是骗人）/ 渊底（末层既无镇守也无下一层，写「下潜中」会让玩家一直等
 * 一个不会来的东西）。脏值按第 1 波处理，绝不吐 NaN。
 */
export function bossWaveHint(s: GameSession): string {
  const wave = Number.isFinite(s.wave) && s.wave > 0 ? Math.floor(s.wave) : 1;
  const boss = hasBossFloor(Number.isFinite(s.floor) ? s.floor : 1);
  // 末层没有镇守也没有下一层：写「下潜中」会让玩家一直等一个不会来的东西。
  if (!boss) return (Number.isFinite(s.floor) ? s.floor : 1) >= MAX_FLOOR ? '渊底' : '下潜中';
  const rest = BOSS_EVERY - (wave % BOSS_EVERY);
  if (wave % BOSS_EVERY === 0) return '本波镇守';
  return `距镇守 ${rest} 波`;
}

/**
 * 手动点一个天赋节点（D207）。
 *
 * 天赋原本全自动（见 talents-auto.ts）：放置游戏不该让玩家手点 130 次。
 * 但"全自动"的副作用是周天图对玩家只是展示 —— 54 个节点没有一个是他选的。
 * 这里给一条手动的路：点成功一次就把角色标成 manualTalents，自动分配从此停手
 * （否则玩家刚点完，下一次突破点数又被系统接管，"手动"变成临时状态）。
 *
 * 失败（点数不够/前置未点/已达上限）不写角色，只回原因 —— 调用方拿去打日志。
 */
export function allocateTalentManually(s: GameSession, nodeId: string): { ok: boolean; reason: string } {
  const res = allocateTalent(s.character, nodeId, s.firstClearedFloors.length);
  if (!res.ok) return { ok: false, reason: res.reason };
  s.character = { ...res.character, manualTalents: true };
  // 天赋给的是属性修正器，战斗态必须跟着重算 —— 否则点了等于没点
  syncBattleFromCharacter(s);
  const node = getTalent(nodeId);
  pushLog(s, `周天图：点亮「${node ? node.name : nodeId}」（此后不再自动分配，空格继续点）`, '#d4a13c');
  return { ok: true, reason: '' };
}
