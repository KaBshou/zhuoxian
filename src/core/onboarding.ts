/**
 * 新手引导（引路）—— 纯状态机，不碰渲染、不碰 DOM、不读时间。
 *
 * 为什么它必须是一个「能被单测的纯函数」：
 * 引导的 bug 最难发现 —— 它不崩、不报错，只是「该出现的提示没出现」，
 * 玩家就那么糊里糊涂地玩下去了。所以这里只做一件事：
 *   给我一组事实，我告诉你现在该停在第几条。
 * 渲染层只负责把「第几条」画出来，main.ts 只负责把事实收集起来。
 *
 * 事实为什么是这些字段（都是从 session 上现取的，不多存一个数）：
 * - kills        累计击杀（s.kills）
 * - dropsFound   累计出货（s.dropsFound，含法宝/通货/玉简）
 * - step         境界台阶（突破过就知道「重」是什么）
 * - floor        当前层
 * - clearedFloors 已首通层数（第一次通关才教「怎么切层」）
 * - bossSeen     场上出现过镇守（rarity === 'boss'）
 * - keysUsed     玩家按过哪些键（面板类提示，按了就不用再教）
 * - elapsed      本条已经停了多久（给「看一眼就够」的条目兜底，挂机玩家不会卡死）
 *
 * 设计纪律：
 * 1. **文案说人话，一句一条。** 每条只教一件事，别把世界观塞进教程
 *    （世界观在选道统画面 `render/class-select.ts` 顶部两行，那里才有空让玩家慢慢读）。
 * 2. **不许阻塞（不暂停战斗、不锁输入）。** 这是放置游戏，玩家挂机时引导也要能走完。
 * 3. **顺序固定、只能往前走。** 不回头、不重播 —— 回档/清档才回到第 1 条。
 */

/** 玩家此刻的「事实快照」，全部由调用方从 session 现取 */
export interface TutorialFacts {
  readonly kills: number;
  readonly dropsFound: number;
  readonly step: number;
  readonly floor: number;
  readonly clearedFloors: number;
  readonly bossSeen: boolean;
  readonly keysUsed: ReadonlySet<string>;
  /** 当前这条已经显示了多久（秒） */
  readonly elapsed: number;
}

export interface TutorialStep {
  readonly id: string;
  /** 正文（一行内说完；渲染层会自己按宽度换行） */
  readonly text: string;
  /** 满足即「教完了」，进入下一条 */
  readonly done: (f: TutorialFacts) => boolean;
}

/**
 * 引导条目表。**顺序就是教学顺序**，改顺序等于改教学节奏。
 *
 * 十一条对应玩家前十分钟到前半小时的十一个「啊原来是这样」：
 * 会打 → 会掉 → 会换装 → 有神通 → 有周天图 → 浊气是什么 → 镇守是什么 →
 * 首通解锁下一层 → 怎么回到打过的层 → 阶是什么 → 四个面板在哪。
 */
export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: 'awake',
    text: '浊气入体，你还活着。它会替你出手 —— 你不必按任何键。',
    done: (f) => f.kills >= 1 || f.elapsed >= 7,
  },
  {
    id: 'first-kill',
    text: '第一只浊物散了。它们会一层层涌上来，杀得越多，你越不像人。',
    done: (f) => f.kills >= 3 || f.elapsed >= 9,
  },
  {
    id: 'first-drop',
    text: '地上那点光是法宝。它已经被自动收下了，更好的会顶掉更差的 —— 右上角看得见。',
    done: (f) => f.dropsFound >= 1 || f.elapsed >= 10,
  },
  {
    id: 'panel-skill',
    text: '按 G 看神通。你学的飞剑、护体、符箓都在那一页。',
    done: (f) => f.keysUsed.has('KeyG') || f.elapsed >= 14,
  },
  {
    id: 'panel-talent',
    text: '按 T 看周天图。每重境界给一点，点了才算数 —— 不点等于没涨。',
    done: (f) => f.keysUsed.has('KeyT') || f.elapsed >= 14,
  },
  {
    id: 'turbid',
    text: '顶上那管暗红是浊气。它越满，你打得越重、回得越慢 —— 这就是浊仙。',
    done: (f) => f.elapsed >= 9,
  },
  {
    id: 'boss',
    text: '接下来是镇守。它比普通浊物硬得多，血条上会写它的名字。',
    done: (f) => f.bossSeen || f.elapsed >= 10,
  },
  {
    id: 'floor',
    text: '这一层通了。镇守一倒，下一层自己开 —— 你只管往下走。',
    done: (f) => f.clearedFloors >= 1 || f.elapsed >= 12,
  },
  {
    // REQ §2 原话：「顺便告诉玩家怎么切换地图」。九幽魔渊的「地图」就是层与阶，
    // 切层的键是 ← →（D36-B 回刷）。这一条不教「往下走」，只教「回去刷」。
    id: 'switch-floor',
    text: '按 ← → 能回到打过的层。越深的浊物越凶，落下的东西也越好。',
    done: (f) => f.keysUsed.has('ArrowLeft') || f.keysUsed.has('ArrowRight') || f.elapsed >= 12,
  },
  {
    // REQ §2 原话：「打完第一张图的 boss，解锁第二张地图」。本作的「图」= 渊层阶位（按层号）。
    // 层 10 = 渊层阶位 黄 → 玄（`tierOfFloor`：1~9 / 10~18 / 19~27）。
    //
    // ⚠️ 措辞上有一个必须避开的坑（shuzhi v4.35）：项目里有**两套「阶」**，
    //   · 渊层阶位：按层号（1~9 黄 / 10~18 玄 / 19~27 地）
    //   · 灵纹阶：按灵蕴（1~15 黄 / 16~30 玄 / 31~45 地 / 46+ 天），而 `ilvlForFloor(10)=37`
    //   ⇒ 玩家在层 10 已经在洗**地阶**灵纹，却刚刚踏入**玄**渊层阶位，两者差约 5 层。
    //   所以这条文案**绝不能**写「玄阶的怪掉玄阶灵纹」，也不写「灵蕴也高一档」。
    id: 'tier',
    text: '第十层起进玄域 —— 渊层每 9 层一阶；灵纹阶看灵蕴，是另一套。',
    done: (f) => f.floor >= 10 || f.elapsed >= 14,
  },
  {
    id: 'outro',
    text: '往下的路自己走。E 看法宝、G 看神通、T 看周天图、D 看损伤详解，1/2/3 花渊痕。',
    done: (f) => f.elapsed >= 12,
  },
];

/** 引导总条数（UI 显示「第 n / N 条」用） */
export const TUTORIAL_LENGTH = TUTORIAL_STEPS.length;

/**
 * 把任意脏值夹成一个合法下标。
 *
 * 存档是玩家能改的东西（也是我们改 schema 时最容易漏的地方），
 * 所以读档时一律走这里：`null` / `NaN` / 字符串 / 越界 → 都落回 0。
 */
export function clampTutorialIndex(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : 0;
  if (n < 0) return 0;
  if (n > TUTORIAL_LENGTH) return TUTORIAL_LENGTH;
  return n;
}

/** 当前该显示哪一条（下标越界 = 已走完，返回 undefined） */
export function currentTutorialStep(index: number): TutorialStep | undefined {
  return TUTORIAL_STEPS[clampTutorialIndex(index)];
}

/**
 * 推进：《跳到第一条还没教完的》。
 *
 * 一次调用可能连跳多条（比如玩家一口气打了 5 只，前两条同时满足）；
 * 但**绝不会倒退**，也不会因为 elapsed 把后面的条目一起吃掉
 * —— 因为循环遇到第一条「还没满足」的就停，而 elapsed 只对当前这条有意义。
 */
export function advanceTutorial(index: number, facts: TutorialFacts): number {
  let i = clampTutorialIndex(index);
  while (i < TUTORIAL_LENGTH && TUTORIAL_STEPS[i].done(facts)) i += 1;
  return i;
}

/** 是否已经教完（不要再画任何东西） */
export function tutorialFinished(index: number): boolean {
  return clampTutorialIndex(index) >= TUTORIAL_LENGTH;
}

/** 「3 / 9」这种进度文本（渲染层直接用，不进存档） */
export function tutorialProgressText(index: number): string {
  const i = clampTutorialIndex(index);
  if (i >= TUTORIAL_LENGTH) return `${TUTORIAL_LENGTH} / ${TUTORIAL_LENGTH}`;
  return `${i + 1} / ${TUTORIAL_LENGTH}`;
}
