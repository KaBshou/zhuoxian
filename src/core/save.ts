// ────────────────────────────────────────────────────────────
// 存档 —— 序列化 / 反序列化（纯函数，不碰 localStorage）
// ────────────────────────────────────────────────────────────
//
// 【三条铁律（继承自 idle-grim 的血泪，见 b-块：xpNext 事故）】
// 1. 能从别的字段算出来的值，一律不入档。
//    - 不存修为门槛（xpForStep(step) 随时能算）
//    - 不存面板属性（characterStats 全派生）
//    - 不存余额（talentPointsAvailable = earned - spent）
// 2. 运行时态不入档：怪、地面掉落、浮字、日志、Boss 阶段、
//    血量/真元/浊气瞬时值（回来从满状态开始，放置游戏的惯例）。
// 3. rngState 必须入档。不存的话每次刷新都从同一种子重摇，
//    掉落序列完全一致 —— 玩家发现"关页面再开，出货顺序一样"就是事故。

import type { CharacterState } from './character';
import type { Item } from './item';
import type { RngState } from './rng';
import type { CurrencyId } from '../data/currency';
import { sanitizeFragments } from '../data/fragments';

export const SAVE_VERSION = 1;

/** 存档里的玩家态：CharacterState 全量 + 背包（装备已在 equipment 里） */
export interface PlayerSave {
  readonly classId: string;
  readonly step: number;
  readonly xp: number;
  readonly ascendancyId?: string;
  readonly gemLoadouts?: Record<string, readonly string[]>;
  readonly talentIds?: readonly string[];
  /** 渊痕（满级后的积累物，D36-A）。可选：老档没有它，读回来按 0 处理。 */
  readonly marks?: number;
  /** D137：定渊是否已解锁（一次性永久，不入档就会每次刷新吞掉玩家花的 720k） */
  readonly diveLockUnlocked?: boolean;
  /**
   * 五行碎片（REQ §3 第 7 条，D104）。可选：老档没有它，读回来按 0 处理。
   * **必须入档** —— 它不入档就等于每次刷新吞掉玩家攒的定向工具。
   */
  readonly fragments?: { readonly metal?: number; readonly fire?: number; readonly water?: number };
  /** D181：音效静音（玩家偏好，可选；老档没有 = 不静音） */
  readonly muted?: boolean;
  readonly volume?: number;
  readonly equipment: Partial<Record<string, Item>>;
  readonly bag: readonly Item[];
}

export interface ProgressSave {
  readonly floor: number;
  /** 当前层的第几波（回来从头打这一波，不清零进度感） */
  readonly wave: number;
  readonly firstClearedFloors: readonly number[];
  /**
   * 到过的最高层（含没通关的）。**必须入档**：
   * 不入档的话重开页面后回刷到低层，深层进度会永久丢失（选层上限掉回去）。
   */
  readonly maxFloorReached?: number;
  /**
   * 新手引导走到第几条（0~TUTORIAL_LENGTH）。**必须入档**：
   * 不进档的话每次刷新都从第一条重讲，老玩家会被反复念第一句。
   * 老档没有这个字段 → 按 0 处理（等于"当新号教一遍"，可接受）。
   */
  readonly tutorialStep?: number;
  /**
   * 图鉴（D87）：已收录的浊物 / 传奇 id。
   *
   * **必须入档**：收集进度是"回不去的进度"，从别的字段算不出来
   * （地上会消失、背包会被换掉）。只存 id —— 名字/描述/百分比全由数据表算（存档铁律）。
   * 读档时由 save-bridge 过 `sanitizeCodex` 洗一遍，脏值安静丢弃。
   */
  readonly codex?: {
    readonly monsters?: readonly string[];
    readonly legendaries?: readonly string[];
    readonly variants?: readonly string[];
  };
  /**
   * 成就（D87）：已达成的成就 id 列表。
   *
   * **必须入档**：达成过就是达成过 —— 回刷低层不该把「到过第 46 层」这条收回去。
   * 只存 id；阈值/文案/奖励全在数据表（存档铁律）。老档没有 → 空列表，
   * 下一次 tick 会用现有事实补上（`unlockAchievements` 幂等）。
   */
  readonly achievements?: { readonly unlocked?: readonly string[] };
  /** 累计死亡次数（成就用；与 `floorDeaths` 不同：后者是「本层死了几次」） */
  readonly deaths?: number;
  /** 周目数（D36-A；缺省 = 初临，老档自动视为 0） */
  readonly cycle?: number;
  /** D168：累计获得过的仙品件数 */
  readonly xianFound?: number;
}

export interface EconomySave {
  readonly pocket: Record<CurrencyId, number>;
  readonly gemPouch: Record<string, number>;
}

export interface SaveState {
  readonly version: number;
  readonly savedAt: number;
  readonly player: PlayerSave;
  readonly progress: ProgressSave;
  readonly economy: EconomySave;
  readonly rngState: RngState;
}

/** 序列化失败的原因（给 UI 显示，给测试断言） */
export type LoadError = 'wrong-version' | 'bad-shape' | 'unknown-class';

export function serialize(input: {
  character: CharacterState;
  bag: readonly Item[];
  floor: number;
  wave: number;
  firstClearedFloors: readonly number[];
  maxFloorReached?: number;
  tutorialStep?: number;
  codex?: {
    readonly monsters?: readonly string[];
    readonly legendaries?: readonly string[];
    readonly variants?: readonly string[];
  };
  achievements?: { readonly unlocked?: readonly string[] };
  deaths?: number;
  cycle?: number;
  xianFound?: number;
  pocket: Record<CurrencyId, number>;
  gemPouch: Record<string, number>;
  rngState: RngState;
}): SaveState {
  const { character: ch } = input;
  return {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    player: {
      classId: ch.classId,
      step: ch.step,
      xp: ch.xp,
      ascendancyId: ch.ascendancyId ?? undefined,
      gemLoadouts: ch.gemLoadouts ? { ...ch.gemLoadouts } : undefined,
      talentIds: ch.talentIds ? [...ch.talentIds] : undefined,
      marks: Math.max(0, Math.floor(ch.marks ?? 0)),
      diveLockUnlocked: ch.diveLockUnlocked === true,
      muted: ch.muted === true,
      volume: ch.volume,
      fragments: {
        metal: Math.max(0, Math.floor(ch.fragments?.metal ?? 0)),
        fire: Math.max(0, Math.floor(ch.fragments?.fire ?? 0)),
        water: Math.max(0, Math.floor(ch.fragments?.water ?? 0)),
      },
      equipment: JSON.parse(JSON.stringify(ch.equipment)) as Partial<Record<string, Item>>,
      bag: JSON.parse(JSON.stringify(input.bag)) as Item[],
    },
    progress: {
      floor: input.floor,
      wave: input.wave,
      firstClearedFloors: [...input.firstClearedFloors],
      maxFloorReached: Math.max(1, Math.floor(input.maxFloorReached ?? input.floor)),
      tutorialStep: Math.max(0, Math.floor(input.tutorialStep ?? 0)),
      // 图鉴：只写 id 数组；缺省就是空图鉴（老档没有这个字段 = 什么都没收集到）
      codex: {
        monsters: Array.isArray(input.codex?.monsters) ? [...input.codex.monsters] : [],
        legendaries: Array.isArray(input.codex?.legendaries) ? [...input.codex.legendaries] : [],
        variants: Array.isArray(input.codex?.variants) ? [...input.codex.variants] : [],
      },
      // 成就：同样只写 id 数组；缺省 = 还没达成任何一条
      achievements: {
        unlocked: Array.isArray(input.achievements?.unlocked) ? [...input.achievements.unlocked] : [],
      },
      deaths: Math.max(0, Math.floor(input.deaths ?? 0)),
      cycle: Math.max(0, Math.floor(input.cycle ?? 0)),
    xianFound: Math.max(0, Math.floor(input.xianFound ?? 0)),
    },
    economy: {
      pocket: { ...input.pocket },
      gemPouch: { ...input.gemPouch },
    },
    rngState: { ...input.rngState },
  };
}

/**
 * 反序列化：只做形状校验 + 浅合法性检查，不重建派生值。
 * 派生值（面板/修为门槛/战力）由调用方用现有纯函数重建。
 * 未知字段忽略（向前兼容），缺失字段按最小档处理而不是报错
 * （老档 + 新代码 = 新字段用默认值；反过来才是灾难）。
 */
export function deserialize(raw: unknown): { ok: true; state: SaveState } | { ok: false; error: LoadError } {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'bad-shape' };
  const o = raw as Record<string, unknown>;
  if (o.version !== SAVE_VERSION) return { ok: false, error: 'wrong-version' };
  const p = o.player as Record<string, unknown> | undefined;
  const pr = o.progress as Record<string, unknown> | undefined;
  const ec = o.economy as Record<string, unknown> | undefined;
  if (!p || !pr || !ec || typeof p.classId !== 'string' || typeof p.step !== 'number' ||
      typeof p.xp !== 'number' || !p.equipment || !Array.isArray(p.bag) ||
      typeof pr.floor !== 'number' || typeof pr.wave !== 'number' ||
      !Array.isArray(pr.firstClearedFloors) || !ec.pocket || !ec.gemPouch ||
      !o.rngState || typeof (o.rngState as Record<string, unknown>).seed !== 'number') {
    return { ok: false, error: 'bad-shape' };
  }
  return {
    ok: true,
    state: {
      version: SAVE_VERSION,
      savedAt: typeof o.savedAt === 'number' ? o.savedAt : 0,
      player: {
        classId: p.classId,
        step: Math.max(0, Math.floor(p.step)),
        xp: Math.max(0, p.xp),
        ascendancyId: typeof p.ascendancyId === 'string' ? p.ascendancyId : undefined,
        gemLoadouts: (p.gemLoadouts ?? undefined) as PlayerSave['gemLoadouts'],
        talentIds: Array.isArray(p.talentIds) ? (p.talentIds as string[]) : undefined,
        // 渊痕（D36-A）：deserialize 是逐字段重建的，漏一个字段 = 静默清零。
        // 这条曾经真的漏了（探针「刷新后渊痕还在」红），所以这里宁可按 0 兜底也要显式写出来。
        marks: typeof p.marks === 'number' && Number.isFinite(p.marks) ? Math.max(0, Math.floor(p.marks)) : 0,
        diveLockUnlocked: p.diveLockUnlocked === true,
        muted: p.muted === true,
        volume:
          typeof p.volume === 'number' && Number.isFinite(p.volume)
            ? Math.min(1, Math.max(0, p.volume))
            : undefined,
        // 五行碎片（D104）：与 marks 同理，逐字段重建，漏了就是静默清零。
        fragments: sanitizeFragments(p.fragments),
        equipment: p.equipment as Partial<Record<string, Item>>,
        bag: p.bag as Item[],
      },
      progress: {
        floor: Math.max(1, Math.floor(pr.floor)),
        wave: Math.max(1, Math.floor(pr.wave)),
        firstClearedFloors: (pr.firstClearedFloors as unknown[]).filter((f): f is number => typeof f === 'number'),
        maxFloorReached:
          typeof pr.maxFloorReached === 'number'
            ? Math.max(1, Math.floor(pr.maxFloorReached))
            : Math.max(1, Math.floor(pr.floor)),
        // 引导进度：deserialize 是逐字段重建的，漏一个字段 = 静默归零（重讲一遍）。
        tutorialStep:
          typeof pr.tutorialStep === 'number' && Number.isFinite(pr.tutorialStep)
            ? Math.max(0, Math.floor(pr.tutorialStep))
            : 0,
        // 图鉴：同样是逐字段重建（漏一行 = 静默清零，和渊痕/引导是同一类事故）。
        // 这里只做"是不是数组"的形状校验，id 合不合法交给 sanitizeCodex（它知道数据表）。
        codex: {
          monsters: Array.isArray((pr.codex as { monsters?: unknown } | undefined)?.monsters)
            ? ((pr.codex as { monsters: unknown[] }).monsters.filter((x): x is string => typeof x === 'string'))
            : [],
          legendaries: Array.isArray((pr.codex as { legendaries?: unknown } | undefined)?.legendaries)
            ? ((pr.codex as { legendaries: unknown[] }).legendaries.filter((x): x is string => typeof x === 'string'))
            : [],
          variants: Array.isArray((pr.codex as { variants?: unknown } | undefined)?.variants)
            ? ((pr.codex as { variants: unknown[] }).variants.filter((x): x is string => typeof x === 'string'))
            : [],
        },
        // 成就：与图鉴同一条「逐字段重建」纪律（漏一行 = 静默清零）。
        achievements: {
          unlocked: Array.isArray((pr.achievements as { unlocked?: unknown } | undefined)?.unlocked)
            ? ((pr.achievements as { unlocked: unknown[] }).unlocked.filter((x): x is string => typeof x === 'string'))
            : [],
        },
        deaths:
          typeof pr.deaths === 'number' && Number.isFinite(pr.deaths) ? Math.max(0, Math.floor(pr.deaths)) : 0,
    xianFound: typeof pr.xianFound === 'number' && Number.isFinite(pr.xianFound) ? Math.max(0, Math.floor(pr.xianFound)) : 0,
        cycle:
          typeof pr.cycle === 'number' && Number.isFinite(pr.cycle) ? Math.max(0, Math.floor(pr.cycle)) : 0,
      },
      economy: {
        pocket: ec.pocket as Record<CurrencyId, number>,
        gemPouch: ec.gemPouch as Record<string, number>,
      },
      rngState: o.rngState as RngState,
    },
  };
}
