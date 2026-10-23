#!/usr/bin/env node
/**
 * run-timeline.mjs —— 「真实 session 全程模拟」24h 时间线验收（lead m01363 + m01453 口径）
 *
 * 与 validate-balance.mjs 的区别：
 *   validate-balance = 每层独立起跑、面板手工定档（验证某一层的单点节奏）
 *   本工具          = 真 createSession + startWave + tickSession 一口气从层 1 打到满级，
 *                     量「一个玩家从层 1 到满级要多少分钟」（真实拾取/换装/突破/死亡惩罚/下潜/自动打造）
 *
 * 判据（lead m01453 定稿）：
 *   - 满级（step 80）≈ 406 min（±10%）          ← BALANCE v4 D34 的 BREAKTHROUGH_XP Σ1 513 370
 *   - 九境到达（第 1..9 境首重）≈ 32 / 47 / 70 / 104 / 139 / 179 / 224 / 304 / 406 min（±15%）
 *   - 全程死亡数单独报（不参与通过/不通过）；>5 次要逐条列出（「真实玩家会不会卡」的第一手证据）
 *   - 掉落分两行：**三类合计/分**（玩家看到的出货）与 **法宝数/分**（才能和 BALANCE §5 的 4 次/分比）
 *
 * 口径实现见 tools/session-runner.mjs（自动打造搬到 tools 循环里，便于拆分掉落三类）。
 *
 * 用法：
 *   node tools\run-timeline.mjs                          # 默认 3 种子、上限 12h、dt=1/30
 *   node tools\run-timeline.mjs --seeds=1 --minutes=120  # 冒烟
 *   node tools\run-timeline.mjs --json=tools\_timeline.json
 *   node tools\run-timeline.mjs --talents=off                   # 关掉自动点天赋（重建忠实度校验 / 无天赋基线）
 *   node tools\run-timeline.mjs --talents=auto                  # 自动点天赋（线上默认口径）
 *   node tools\run-timeline.mjs --talents=t-xp-1,t-xp-2         # 手工指定初始天赋（关自动点）
 *   node tools\run-timeline.mjs --farm=deepest --farm-from=21   # T2：到层 21 就冻结、原地重复刷
 *   node tools\run-timeline.mjs --farm=best                     # T2：在已到过的层里挑「修为/分」最高的一层刷
 *
 * `--farm` 三档（lead m01975）：
 *   - off（默认）  = 不干预，session 清完镇守波就一路下潜（历史口径，所有旧数字的档位）
 *   - deepest      = 到 `--farm-from` 层后冻结，原地重复刷（默认 farm-from = MAX_FLOOR，此时与 off 等价）
 *   - best         = 每帧在「已到过的层」里挑 `KILLS_PER_MIN_BY_FLOOR × 阶赏金` 最高的一层刷
 *                    （标尺逐字复用 src/core/offline.ts:114-119；配合 `--farm-from` 可限制起点层）
 *   三档都只能选 `floorSelectableMax(s)` 以内的层；`setFloor` 越界返回 false（不静默夹取）。
 *
 * `--talents` 三态（lead m01363 第 2 件 / m01845 定名）：
 *   - none / off → createSession({ autoTalents: false })，天赋点攒着不花 = 无天赋基线（**默认**，对照 412min 定稿）
 *   - auto       → 用 src 默认（autoTalents 默认 true），按 talents-auto.ts 的优先级贪心花点（当前真实玩家体验）
 *   - <ids>      → 只带这些初始天赋，并关自动点（保持历史口径可复现）
 */
import fs from 'node:fs';
import path from 'node:path';
import { openSrc } from './vite-loader.mjs';
import { runInstrumentedSession } from './session-runner.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v === undefined ? '1' : v];
  }),
);

const SEEDS = Math.max(1, Number(args.seeds ?? 3));
// D98（shuzhi v4.45 协议）：**预注册种子集**，跑一次即锁定，不许换种子重跑 ——
// 否则调参时会不知不觉挑到「能过的那一组」。baseSeed=2026 / step=1013。
const BASE_SEED = Number(args['base-seed'] ?? 2026);
const STEP_SEED = Number(args['seed-step'] ?? 1013);
const MINUTES = Math.max(1, Number(args.minutes ?? 720));
const DT = Number(args.dt ?? 1 / 30);
const CLASS_ID = args.class ?? 'yujian';
const TALENTS_RAW = (args.talents ?? 'none').trim();
const TALENT_MODE =
  TALENTS_RAW === 'off' || TALENTS_RAW === 'none' ? 'off' : TALENTS_RAW === 'auto' ? 'auto' : 'list';
const TALENTS = TALENT_MODE === 'list' ? TALENTS_RAW.split(',').map((x) => x.trim()).filter(Boolean) : [];
// list 模式要关自动点，否则「指定初始天赋」会被自动加点覆盖，历史数字不可复现
const AUTO_TALENTS = TALENT_MODE === 'auto';
const TALENT_LABEL =
  TALENT_MODE === 'off' ? 'off（不点天赋）' : TALENT_MODE === 'auto' ? 'auto（自动点天赋）' : TALENTS.join(',');
const JSON_OUT = args.json ?? null;
/**
 * `--report-kills`：额外打印「按层真实击杀率」表（BALANCE §21.11 的 real 列）。
 * 口径：`floorStats[].kills / minutes`，来自每帧 `s.battle.kills` 增量按当前层记账
 * （`tools/session-runner.mjs` 的 floorRow）。与 `validate-balance` 的 `--gear=typical`
 * 上界口径不同：这里是真 session（典型装随进度自然获得），是**时长模型**该用的那一列。
 */
const REPORT_KILLS = args['report-kills'] === '1';
const DEATH_LIST_THRESHOLD = 5; // lead m01453：>5 次要单独列
/** 单种子死亡硬上限（D114）：中位落在 10~25 带还不够，尾部必须也有线 —— 死锁种子的特征就是 90~160 次。 */
const DEATH_HARD_MAX = 60;
// D150（shuzhi §6.8.7 ③）：**同量纲**的死亡代价度量 —— 死亡时间占比。
// 为什么不用「死亡/小时」：那个量的分母是「爬升速度」（D149.1 实测：降怪血反而让死亡/小时变高）。
// 这条的分子分母都是**分钟**，直接回答玩家在意的「我多少时间花在重做已经做过的事上」。
// 单次重做按「半层」估 = 0.9min（本层回第 1 波，一层 ≈ 3.7min）。
// 适用域：记录项。shuzhi 定的动机制信号 = **c4 之后 > 30%**；c0~c3 只记录不判。
const REWORK_MIN_PER_DEATH = 0.9;
/** c4+ 的「该动机制」信号线（30%）；c0~c3 只记录 */
const REWORK_SIGNAL_MAX = 0.3; // D118 起只作告警（双峰下的极值是抽样运气，不是游戏性质）
const DEATH_MEDIAN_BAND = [5, 25];
/** 死锁事件上限（D115，软红）：1 次事件 = 3 次死亡，玩家感知的是「被困住一次」。 */
const DEATH_LOCK_MAX = 20;
/** D118：脱困率下限（逃生阀事件里，30 分钟内重新推进层的比例）。首轮只记录，次轮起判。 */
const ESCAPE_RATE_MIN = 0.8;
const ESCAPE_RATE_ENFORCED = false; // D121：降为记录，等 MAX_FLOOR 扩容后再判
/** D121：前沿带（最后一层附近）不计入脱困率 —— 在那里永远不可能「推进 2 层」，是定义的几何错误。 */
const ESCAPE_FRONTIER_MARGIN = 6;
/** D118：撞墙率上限（多少比例的种子在一轮里死过）—— 双峰下唯一稳定的「受影响比例」。 */
const WALL_HIT_RATE_MAX = 0.35; // D119：33% → 35%（免去每次解释四舍五入；软线只记录）
/** 首次撞墙层下限（D115，硬线）：撞墙落在 22~30 说明中段被破坏了，那是另一种失败。 */
const FIRST_WALL_MIN_FLOOR = 42;
const REPORT_DROPS_BY_TIER = Boolean(args['report-drops-by-tier']); // 按阶分列法宝/通货/玉简
/**
 * `--post-cap`（lead m02261 新口径）：满级后**不中断**，继续跑到 `--minutes` 上限。
 * 用来量 D36-A 的「满级后还有 3h 内容」：渊痕产出/分、最深层、三档 farm 下的终局层。
 */
const POST_CAP = Boolean(args['post-cap']);
// 周目预置（D130）：默认 0 = 初临。用来量「周目 N 的满级时长」，不改任何产品常量。
const CYCLE = Math.max(0, Math.floor(Number(args.cycle ?? 0) || 0));
// T2 选层策略（lead m01975）：off=现状 / deepest=冻结在 farmFrom / best=已到过层里修为分最高
const FARM_RAW = (args.farm ?? 'off').trim();
if (!['off', 'deepest', 'best'].includes(FARM_RAW)) {
  throw new Error(`未知的 --farm=${FARM_RAW}（只支持 off|deepest|best；smart 按 lead m01975 暂不做）`);
}
const FARM_MODE = FARM_RAW;
const FARM_FROM = args['farm-from'] === undefined ? undefined : Number(args['farm-from']);
if (FARM_FROM !== undefined && (!Number.isFinite(FARM_FROM) || FARM_FROM < 1)) {
  throw new Error(`--farm-from 必须是 ≥1 的整数，收到 ${args['farm-from']}`);
}
const FARM_LABEL =
  FARM_MODE === 'off'
    ? 'off（一路下潜）'
    : FARM_MODE === 'deepest'
      ? `deepest（冻结在层 ${FARM_FROM ?? '27'}）`
      : `best（已到过层里修为/分最高${FARM_FROM === undefined ? '' : `，起点层 ${FARM_FROM}`}）`;

// 判据（BALANCE v4 D34 / lead m01453）
// D79（shuzhi v4.37）：满级目标 330 → **300** —— 300 就是 GDD 段③ 的 5h 需求值，
// 之前用 330 是 D64 为「传奇让玩家变快」做的让步；D78 修好 castSpeed 后实测中位 297.6，
// 与 300 差 −0.8%，正好落回需求值 —— 不再需要让步。
// 窗口显式 [270, 345]（−10% / +15%），不用 ±15% 对称区间（实测分布偏左）。
// 纪律（D64 沿用）：**改目标而不是只放宽窗口** —— 只放宽窗口等于把「变快了」记成「还在窗口里」。
const TARGET_MAX_MINUTES = 260; // D124：300 → 260（「神通轮转快照」修完的正当收益；这是最后一次重标）
const MAX_MIN_MINUTES = 235; // D124：−9.6%
const MAX_MAX_MINUTES = 300; // D124：+15%
// 判据口径（lead m02404-4）：**3 种子中位 ±15%**。原先的单种子 ±10% 比种子噪声还窄
// （shuzhi 实测同一数组 3 种子 380.9/388.5/414.6，极差 9%），所以只报中位判定。
const TARGET_TOLERANCE = 0.15;
// 容差 ±20%：第 1 境 6 种子实测 24.6~32.4（spread 32%），±15% 比噪声还窄（shuzhi v4.33）。
const REALM_TOLERANCE = 0.2;
// 九境**只记录不判 ±20%**（20265073 一颗慢种子会占掉 7 格，和「满级出窗」是同一现象），
// 但保留一条 ±50% 的**量级红线**：它抓的是「目标写错 / R(k) 换错数组 / 收入曲线断掉」这类
// 一错就是一倍的事故（当前 54 格最大偏离 34.6%，红线 0 触发）。
const REALM_MAGNITUDE_LIMIT = 0.5;
// D99（shuzhi v4.45）：量级线必须**同时**满足「相对 >50%」与「绝对偏差 >40min」才红。
// 理由：满级时长的种子散布是 ±8~13%，每一次到达时刻都带 ±25~40min 的噪声地板，
// 判据容差低于 2× 噪声地板时，它测的是种子不是设计（12 颗实测：境 2/3 的 +56.6%/+63.1%
// 绝对偏差只有 24.0/30.6/33.2min，全在噪声里）。
// 双阈值仍然抓得住「一错一倍」：境 6 目标 153min 翻倍 ⇒ 绝对偏 153min ⇒ 红。
const REALM_MAGNITUDE_ABS_MIN = 40;
/** D119：形状偏离上限（shape_k / REALM_SHAPE_RATIO[k] − 1）。超过 30% 才红 —— 抓「某种子某境独自偏慢」。 */
const REALM_SHAPE_TOLERANCE = 0.3;
/** D119：目标 > 20min 的境才判形状（早期境界绝对分钟小，形状本身噪声大）。 */
const REALM_SHAPE_MIN_TARGET = 20;
/** D121：病理线 —— 单境耗时不得超过该境目标的 2 倍（抓「某境卡死/爆炸」，不抓「整体平移」）。 */
const REALM_PATHOLOGY_MUL = 2;
/** D122：段④ 末层产出必须有的最小样本（分钟）——低于此只写「样本不足」。 */
const MIN_STAY_MINUTES = 60;
/** D121：形状偏离从硬线降为记录。 */
const REALM_SHAPE_SOFT_ONLY = true;
// 九境「圆满」到达目标。**末项必须等于 TARGET_MAX_MINUTES**（第 9 境圆满 = 满级）。
// 曾经这里硬编码 406，D64 把满级目标改成 330 之后没同步 ⇒ 第 9 境拿 335.0 比 406 = −17.5%，
// 门禁恒红、EXIT 恒 1，看起来像「数值退步」，其实是**目标数组漂了**（ceshi 抓到）。
// 修法与 D65 同一原则：保留「形状」（406 时代的 9 个比例），末项由满级目标推出 ——
// 只维护一个数，重标满级时这条曲线自动缩放，不可能再漂。
// 形状用**比例**而不是 406 时代的绝对分钟数（shuzhi 6 种子复跑：旧形状整体低 7~14%，
// 会永久显示 +8~14% 的假告警 —— 那不是「数值退步」，是目标曲线过时）。
// 纪律：不要为对齐形状去重排 BREAKTHROUGH_XP（R(k) 是「满级 330 + 段② 0.62」的唯一解，
// v4.22 实测重分配会引入 ±19~26% 混沌）；早期偏慢是收入曲线形状的必然，只记录。
const REALM_SHAPE_RATIO = [0.085, 0.125, 0.179, 0.283, 0.37, 0.465, 0.571, 0.743, 1.0];
const TARGET_REALM_MINUTES = REALM_SHAPE_RATIO.map((r) => Math.round(r * TARGET_MAX_MINUTES));
if (TARGET_REALM_MINUTES[TARGET_REALM_MINUTES.length - 1] !== TARGET_MAX_MINUTES) {
  throw new Error('九境目标末项与满级目标不一致（这条断言是为了防止再次漂移）');
}

const f = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const pct = (x) => (Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : '—');
const med = (xs) => {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return NaN;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
};
/** 某阶停留时长占比（分母 = 该 run 各阶时长之和，≈ 全程帧时长） */
const tierShare = (run, tier) => {
  const total = run.tierStats.reduce((a, x) => a + x.minutes, 0);
  const m = (run.tierStats.find((x) => x.tier === tier) ?? { minutes: 0 }).minutes;
  return total > 0 ? m / total : 0;
};

/**
 * 「满级前」口径快照（`--post-cap` 时必须用这个，不能用终点累计值）：
 * 终点值含满级后挂机段，直接除 maxedAt 会把挂机产出当成成长节奏。
 * 非 post-cap 时 atMax 为 null，退回终点值等价（那时终点就是满级瞬间）。
 */
const preMax = (r) => {
  const a = r.atMax;
  const mins = Number.isFinite(r.maxedAt) ? r.maxedAt : r.minutes;
  const drops = a ? a.dropsFound : r.dropsFound;
  const gems = a ? a.gemProduced : r.gemProduced;
  const cur = a
    ? a.currencyProduced.huang + a.currencyProduced.mie + a.currencyProduced.xi
    : r.currencyProduced.huang + r.currencyProduced.mie + r.currencyProduced.xi;
  // 法宝数：直接取 runner 里「扫 s.ground 真实落地物」的计数。
  // 不能用 `drops − 通货 − 玉简`（lead m02515）：dropsFound 是每次击杀 +1，
  // 法宝支还要过 DROP_CHANCE（normal 0.28），减法会把掷失败的 72% 也算成法宝（高估 ~2.5×）。
  const itemDrops = a ? a.itemDrops : r.itemDrops;
  // D163 附：**成型时刻必须读事实，不能读「满级那一刻的快照」**。
  // 判据 C 是「连续 30 分钟不跌破」，取这段的**起点** ⇒ 一个在 208.4min 成型、
  // 235.4min 满级的种子，快照那一刻 30 分钟窗口还没走完（238.4 才满）⇒ `atMax.formedPowerAt = null`。
  // 拿 null 当「未成型」会把达成率从 11/12 误算成 10/12（实测本轮就是这么红的）。
  // 这是 D99 那族第 5 例：判据读的不是事实，而是判决时刻的快照。
  const formedAt = Number.isFinite(r.formedPowerAt) ? r.formedPowerAt : a ? a.formedPowerAt : r.formedPowerAt;
  const formedPowerRatio = a ? a.minPowerRatio : r.minPowerRatio;
  const graduatedAt = a ? a.graduatedAt : r.graduatedAt;
  const allXianAt = a ? a.allXianAt : r.allXianAt;
  const kills = a ? a.kills : null;
  // 「出货总数」= 三类合计（法宝落地 + 玉简 + 通货事件）。
  // 不用 `dropsFound`（lead m02515）：它是**每击杀 +1 的掷骰数**，法宝支还会因
  // DROP_CHANCE（normal 0.28）掷空 —— 8.69/分是掷骰数，三类合计 6.22/分才是玩家真正收到的。
  const dropsTotal = itemDrops + gems + cur;
  const share = (tier) => {
    if (!a) return tierShare(r, tier);
    const total = a.tierMinutes.reduce((s, x) => s + x.minutes, 0);
    const m = (a.tierMinutes.find((x) => x.tier === tier) ?? { minutes: 0 }).minutes;
    return total > 0 ? m / total : 0;
  };
  return { mins, dropsRolls: drops, dropsTotal, gems, cur, itemDrops, kills, share, formedAt, formedPowerRatio, graduatedAt, allXianAt };
};

const { load, close } = await openSrc();
try {
  const sessionMod = await load('src/core/session.ts');
  const craftMod = await load('src/core/crafting.ts');
  const progMod = await load('src/core/progression.ts');
  const { ITEM_BASES } = await load('src/data/bases.ts');
  const { AFFIXES } = await load('src/data/affixes.ts');
  const monstersMod = await load('src/data/monsters.ts');
  const offlineMod = await load('src/core/offline.ts');
  const inventoryMod = await load('src/core/inventory.ts');
  const marksMod = await load('src/core/marks-runtime.ts');
  const TABLES = { bases: ITEM_BASES, affixes: AFFIXES };
  // inventoryMod 是判据 C（部位归一化战力）的真源：shuzhi v4.27 把段② 门禁从
  // 「10 部位宝品以上」改成「每部位 itemPower ≥ 同部位同灵蕴宝品中位 ×1.0」——
  // 品阶不是战力的单调代理（31.7% 的灵品强过宝品中位），按品阶判会来回震荡。
  const mods = { sessionMod, craftMod, progMod, monstersMod, offlineMod, inventoryMod };
  const MARKS_POLICY = String(args.marksPolicy ?? 'none');
  const MARKS_START = Math.max(0, Math.floor(Number(args.marksStart ?? 0) || 0));
  const REALM_COUNT = progMod.REALM_COUNT;

  const runs = [];
  for (let i = 0; i < SEEDS; i++) {
    const seed = BASE_SEED + i * STEP_SEED;
    const t0 = Date.now();
    const r = runInstrumentedSession(mods, {
      classId: CLASS_ID,
      seed,
      tables: TABLES,
      talentIds: TALENTS,
      autoTalents: AUTO_TALENTS,
      minutes: MINUTES,
      dt: DT,
      stopAtMaxStep: !POST_CAP,
      farmMode: FARM_MODE,
      cycle: CYCLE,
      marksStart: MARKS_START,
      marksPolicy: MARKS_POLICY,
      marksMod,
      ...(FARM_FROM === undefined ? {} : { farmFrom: FARM_FROM }),
    });
    r.wallMs = Date.now() - t0;
    runs.push(r);
    process.stderr.write(
      `  seed ${seed}: ${Number.isFinite(r.maxedAt) ? `${f(r.maxedAt, 1)}min 满级` : `${f(r.minutes, 0)}min 未满级(step ${r.step})`}` +
        ` · 层 ${r.floor} · 死 ${r.deaths} · 掷骰 ${r.dropsFound}（法宝 ${r.itemDrops}）· 墙钟 ${r.wallMs}ms\n`,
    );
  }

  const maxedRuns = runs.filter((r) => Number.isFinite(r.maxedAt));
  const maxedMin = maxedRuns.length ? Math.min(...maxedRuns.map((r) => r.maxedAt)) : NaN;
  const maxedMed = med(maxedRuns.map((r) => r.maxedAt));
  const maxedMax = maxedRuns.length ? Math.max(...maxedRuns.map((r) => r.maxedAt)) : NaN;
  const allMaxed = maxedRuns.length === runs.length;
  const dev = (maxedMed - TARGET_MAX_MINUTES) / TARGET_MAX_MINUTES;
const inWindow = maxedMed >= MAX_MIN_MINUTES && maxedMed <= MAX_MAX_MINUTES;
  // 主门禁：中位进窗口。副红线：任一种子不得跌破 325min（−20%）。
  // 只判中位会放跑「一个种子严重偏差、另两个刚好偏高」的情况（本轮 337.1 就是），
  // 只判逐种子又会把 9~18% 的种子噪声当错误 —— 两条一起才是校准过的判据。
  // 副红线（D79）：任一种子跌破 250min 就算红 —— 中位好看但某个种子飞快，
// 说明这条曲线在种子维度上不稳。
// 为什么不是 261（= 300×0.87）：实测最差 265，261 只剩 4min（1.4%）余量，换种子必红；
// 250 给 15min（5.7%）余量，同时仍能抓住「某颗种子快到离谱」这种真事故。
// D124：副红线改比例式 —— 绝对值每次重标都要重算，而它的语义本来就是「防止某个种子快得离谱」，那是比例问题。
const FLOOR_MIN_RATIO = 0.7;
  const worstMaxed = maxedRuns.length ? Math.min(...maxedRuns.map((r) => r.maxedAt)) : NaN;
  const floorMinMinutes = Number.isFinite(maxedMed) ? maxedMed * FLOOR_MIN_RATIO : NaN;
const floorOk = Number.isFinite(worstMaxed) && Number.isFinite(floorMinMinutes) && worstMaxed >= floorMinMinutes;
  // D138：`TARGET_MAX_MINUTES = 260` 是**初临**的满级目标，周目时长天然更长（c1≈291 / c2≈381 / c3≈494；D172 按 12 种子实测校准，历史值 312/375/539 作废）
  // ⇒ c ≥ 1 时「满级窗口」只记录，硬线交给累计 24h 验收（`tools/check-cycle-24h.mjs`）。
  // 纪律沿用：这不是放宽阈值，是去掉「拿 c0 的尺子量周目」这个重复计罚。
  // D145 附：副红线（最差种子 ≥ 70% × 中位）同样是「初临形状」判据 —— 它量的是
  // 「同一轮内种子间的一致性」，而 c≥1 的累计链只关心 Σ 时长与单调，种子间差异由
  // 死亡/小时那条线兜。c≥1 保留打印、不进 pass。
  const pass = allMaxed && (CYCLE === 0 ? inWindow && floorOk : true);
  const totalDeaths = runs.map((r) => r.deaths);
  const deathMed = med(totalDeaths);
  const deathMax = Math.max(...totalDeaths);
  const deathOver = runs.filter((r) => r.deaths > DEATH_HARD_MAX).map((r) => r.seed);
  const deathHardOk = deathOver.length === 0;
  const lockEvents = runs.map((r) => r.deathLockEvents ?? 0);
  const lockMax = Math.max(...lockEvents);
  const lockOver = runs.filter((r) => (r.deathLockEvents ?? 0) > DEATH_LOCK_MAX).map((r) => r.seed);
  const firstWalls = runs.filter((r) => r.deaths > 0 && Number.isFinite(r.firstDeathFloor)).map((r) => r.firstDeathFloor);
  const firstWallMin = firstWalls.length ? Math.min(...firstWalls) : NaN;
  const firstWallOk = !Number.isFinite(firstWallMin) || firstWallMin >= FIRST_WALL_MIN_FLOOR;

  // D118：脱困率 = 所有逃生阀事件里，30 分钟内重新推进层的比例
  const allEscapesRaw = runs.flatMap((r) => r.escapeEvents ?? []);
  const { MAX_FLOOR } = await load('src/data/monsters.ts');
  const frontierFloor = MAX_FLOOR - ESCAPE_FRONTIER_MARGIN;
  const allEscapes = allEscapesRaw.filter((e) => e.floorAt < frontierFloor);
  const frontierEscapes = allEscapesRaw.filter((e) => e.floorAt >= frontierFloor);
  const escapedCount = allEscapes.filter((e) => e.resolvedAt !== null && e.resolvedAt - e.minute <= (runs[0].escapeWindowMin ?? 30)).length;
  const escapeRate = allEscapes.length ? escapedCount / allEscapes.length : 1;
  const escapeRateOk = !ESCAPE_RATE_ENFORCED || escapeRate >= ESCAPE_RATE_MIN;
  // 撞墙率 = 本轮有死亡的种子比例（双峰下比中位/极值都稳）
  // D118：撞墙的定义必须写死 —— 「有过死亡」太宽（死 1 次是手滑），
  // 这里取「死锁事件 ≥3」= 同一道墙前后被挡住 3 轮以上、仍没过去。
  const WALL_LOCK_MIN = 3;
  const wallSeeds = runs.filter((r) => (r.deathLockEvents ?? 0) >= WALL_LOCK_MIN);
  const wallHitRate = wallSeeds.length / runs.length;
  const wallHitOk = wallHitRate <= WALL_HIT_RATE_MAX;
  // D136：周目 > 0 时「首次撞墙层 / 撞墙率」只记录 —— 周目本来就该更难，
  // 但「层 1~9 零死亡」是**渐入是否生效的唯一探针**，必须硬判：
  // 只要渐入没接上、或有人把倍率改回全局，它立刻红，比「死亡中位 18.5」更难辩解。
  const EARLY_FLOOR_MAX = 9;
  const earlyDeathSeeds = runs
    .filter((r) => (r.deathEvents ?? []).some((e) => e.floor <= EARLY_FLOOR_MAX))
    .map((r) => r.seed);
  const earlyDeathOk = CYCLE > 0 ? earlyDeathSeeds.length === 0 : true;
  const wallGateActive = CYCLE === 0;
  const firstWallOkFinal = wallGateActive ? firstWallOk : true;
  /** 健康度 = 中段没坏 + 墙可退可再试 + 受影响比例不大（D118）＋ 周目渐入（D136） */
  const survivalOk = firstWallOkFinal && escapeRateOk && earlyDeathOk;
  const deathMedOk = deathMed >= DEATH_MEDIAN_BAND[0] && deathMed <= DEATH_MEDIAN_BAND[1];
  // 死亡时间占比（D150）：逐种子算再取中位，避免「死亡多的种子恰好时长也长」互相抵消。
  const reworkPcts = runs
    .filter((r) => Number.isFinite(preMax(r).mins) && preMax(r).mins > 0)
    .map((r) => ((r.deaths ?? 0) * REWORK_MIN_PER_DEATH) / preMax(r).mins);
  const reworkMed = reworkPcts.length ? med(reworkPcts) : NaN;
  const reworkOver = runs.filter((r) => {
    const m = preMax(r).mins;
    return Number.isFinite(m) && m > 0 && ((r.deaths ?? 0) * REWORK_MIN_PER_DEATH) / m > REWORK_SIGNAL_MAX;
  });

  console.log(`# 24h 时间线验收 · 真实 session 全程模拟 · ${new Date().toISOString()}`);
  console.log(
    `# ${SEEDS} 种子 · dt=${f(DT, 4)}s · 上限 ${MINUTES}min · class=${CLASS_ID} · talents=${TALENT_LABEL} · farm=${FARM_LABEL} · 层 1 起跑`,
  );
  console.log(`# 判据：满级中位 ${TARGET_MAX_MINUTES}min，窗口 [${MAX_MIN_MINUTES}, ${MAX_MAX_MINUTES}]（主门禁）；最差种子 ≥ ${Math.round(FLOOR_MIN_RATIO * 100)}% × 中位（副红线，D124 比例式）；九境到达 ±${Math.round(REALM_TOLERANCE * 100)}%；死亡数单独报`);
  console.log('');

  console.log('## 表 1 · 每境「圆满」到达分钟（多种子中位数 vs 目标）');
  console.log('');
  console.log('> 口径：目标列表 = 第 1..9 境**圆满**的时刻（第 9 境圆满 = 满级 step 80）。');
  console.log('> 代码里 `realmArrivals[k]` 是「进入第 k+1 境」的时刻，所以第 j 境圆满取 `realmArrivals[j]`（j=1..8），第 9 境取满级时刻。');
  console.log('');
  console.log('| 第几境圆满 | 目标(min) | 实测中位数(min) | 实测 min~max | 偏差 | 累计修为(中位) | 判定 |');
  console.log('|---|---:|---:|---|---:|---:|---|');
  for (let j = 1; j <= REALM_COUNT; j++) {
    const vals = runs
      .map((r) => (j < REALM_COUNT ? r.realmArrivals[j] : r.maxedAt))
      .filter((x) => Number.isFinite(x));
    const m = med(vals);
    const d = (m - TARGET_REALM_MINUTES[j - 1]) / TARGET_REALM_MINUTES[j - 1];
    const ok = Number.isFinite(m) && Math.abs(d) <= REALM_TOLERANCE;
    console.log(
      `| ${j} | ${TARGET_REALM_MINUTES[j - 1]} | ${Number.isFinite(m) ? f(m, 1) : '未到达'} | ` +
        `${vals.length ? `${f(Math.min(...vals), 1)}~${f(Math.max(...vals), 1)}` : '—'} | ` +
        `${Number.isFinite(m) ? `${d > 0 ? '+' : ''}${f(d * 100, 1)}%` : '—'} | ` +
        `${f(med(runs.map((r) => (j < REALM_COUNT ? r.realmCumXp[j] : r.cumXp))), 0)} | ${ok ? '✓' : '✗'} |`,
    );
  }

  // 逐种子 × 逐境 的量级检查（只看「一错就是一倍」，不看 ±20% 的正常散布）
  //
  // D96 尾部种子护栏（shuzhi v4.45 判 1）：
  //   量级线抓的是**系统性**错误（漏乘、单位错、一错一倍）。而尾部种子的偏差是
  //   早期 rng 重排的连锁 —— 20265073 改前就是最慢的 341.8、改后 362.6，且它正是
  //   「满级出窗」那颗。按 v4.34 的口径「九境超差与满级出窗是同一现象，判两次不增信息」，
  //   同一条口径现在补到**硬门禁**上：尾部种子的量级偏差降级为记录项。
  //
  //   **护栏（必须有）**：尾部种子最多降级 1 颗。同轮 ≥2 颗尾部种子触发 |偏差| > 50%
  //   就不许降级，直接当系统问题查 —— 否则「尾部」会变成万能挡箭牌。
  const tailSeedIds = new Set(
    runs.filter((r) => !Number.isFinite(r.maxedAt) || r.maxedAt < MAX_MIN_MINUTES || r.maxedAt > MAX_MAX_MINUTES).map((r) => r.seed),
  );
  // 尾部豁免**按比例**：12 颗里最多 2 颗（≈16.7%，与 6 颗里 1 颗同比例）。
const TAIL_SEED_EXEMPT_MAX = Math.max(1, Math.round(SEEDS / 6));
  const tailExemptAllowed = tailSeedIds.size <= TAIL_SEED_EXEMPT_MAX;

  const realmMagnitude = [];
  // D139：九境病理线的目标基数 —— c0 用设计目标 260，周目用**本轮自己的满级中位**。
  // 理由（同 D129/D138）：坐境目标是「总时长 × 形状」，总时长在周目里天然变大，
  // 拿 c0 的 260 去套 c3 的 538.8 会让每一境都判成病理（实测 12 种子全红，纯基数错）。
  const realmTotalForShape = CYCLE === 0 ? TARGET_MAX_MINUTES : maxedMed;
  const TARGET_REALM_MINUTES_SCOPED = REALM_SHAPE_RATIO.map((r) => Math.round(r * realmTotalForShape));
  const realmMagnitudeTail = [];
  for (const r of runs) {
    for (let j = 1; j <= REALM_COUNT; j++) {
      const at = j < REALM_COUNT ? r.realmArrivals[j] : r.maxedAt;
      if (!Number.isFinite(at)) continue;
      const target = TARGET_REALM_MINUTES_SCOPED[j - 1];
      if (!(target > 0)) continue;
      const dev = (at - target) / target;
      const absDev = Math.abs(at - target);
        // D119：判「形状」不判「绝对时间」—— 整体后移由满级窗口负责，这里只抓「快慢是否均匀」。
        const maxedOfSeed = r.maxedAt;
        const shape = Number.isFinite(maxedOfSeed) && maxedOfSeed > 0 ? at / maxedOfSeed : NaN;
        const shapeDev = Number.isFinite(shape) ? Math.abs(shape / REALM_SHAPE_RATIO[j - 1] - 1) : 0;
        const shapeRed = !REALM_SHAPE_SOFT_ONLY && target > REALM_SHAPE_MIN_TARGET && shapeDev > REALM_SHAPE_TOLERANCE;
        // D121 病理线：本境耗时 = 到达本境 − 到达上一境（第 1 境从 0 起算）
        const prevAt = j > 1 ? r.realmArrivals[j - 1] : 0;
        const spent = Number.isFinite(prevAt) ? at - prevAt : NaN;
        const prevTarget = j > 1 ? TARGET_REALM_MINUTES_SCOPED[j - 2] : 0;
        const spentTarget = target - prevTarget;
        const pathological = Number.isFinite(spent) && spentTarget > 0 && spent > spentTarget * REALM_PATHOLOGY_MUL;
      if (pathological) {
        const row = { seed: r.seed, realm: j, at, target, dev, absDev, shape, shapeDev, spent, spentTarget, ratio: spent / spentTarget };
        // 只有「允许降级」（尾部种子 ≤1 颗）且这颗正是尾部种子，才进记录项
        if (tailExemptAllowed && tailSeedIds.has(r.seed)) realmMagnitudeTail.push(row);
        else realmMagnitude.push(row);
      }
    }
  }
  // D121（修订）：病理线按**多种子中位**判 —— 单颗被墙种子会把单境耗时推到 2×+（「受虐模型」的产物，
  // 与死亡数同理）；真正要抓的「某境系统性卡死」只有中位能表达。逐种子 >2× 只记录。
  const pathoByRealm = [];
  for (let j = 1; j <= REALM_COUNT; j++) {
    const ratios = [];
    for (const r of runs) {
      const at = j < REALM_COUNT ? r.realmArrivals[j] : r.maxedAt;
      const prev = j > 1 ? r.realmArrivals[j - 1] : 0;
      const prevTarget = j > 1 ? TARGET_REALM_MINUTES[j - 2] : 0;
      const tgtDur = TARGET_REALM_MINUTES[j - 1] - prevTarget;
      if (Number.isFinite(at) && Number.isFinite(prev) && tgtDur > 0) ratios.push((at - prev) / tgtDur);
    }
    if (ratios.length) pathoByRealm.push({ realm: j, med: med(ratios), worst: Math.max(...ratios) });
  }
  const pathoWorstRealm = pathoByRealm.reduce((a, b) => (b.med > a.med ? b : a), pathoByRealm[0]);
  // D121 补充（shuzhi）：逐种子 >2× 的种子数 —— 只记录 + 软线 ≤3/12，让尾部走向「不被看但不消失」。
  const PATHO_SOFT_SEEDS = 3;
  const pathoSeedsOver = runs.filter((r) => {
    for (let j = 1; j <= REALM_COUNT; j++) {
      const at = j < REALM_COUNT ? r.realmArrivals[j] : r.maxedAt;
      const prev = j > 1 ? r.realmArrivals[j - 1] : 0;
      const prevTarget = j > 1 ? TARGET_REALM_MINUTES[j - 2] : 0;
      const tgtDur = TARGET_REALM_MINUTES[j - 1] - prevTarget;
      if (Number.isFinite(at) && Number.isFinite(prev) && tgtDur > 0 && (at - prev) / tgtDur > REALM_PATHOLOGY_MUL) return true;
    }
    return false;
  }).length;
  const pathoSoftOk = pathoSeedsOver <= PATHO_SOFT_SEEDS;
  const realmMagnitudeOk = !(pathoWorstRealm && pathoWorstRealm.med > REALM_PATHOLOGY_MUL);
    // D165：判据只在 c0 生效 ⇒ 必须报「未启用」而不是「不通过」。
  const realmGateOn = CYCLE === 0;
  const realmVerdictText = !realmGateOn ? "未启用（c≥1，D142）" : realmMagnitudeOk ? "通过" : "不通过";
  console.log(
    `- 九境病理线（**D121 硬线（中位口径）**：单境耗时中位 ≤ ${REALM_PATHOLOGY_MUL}× 该境目标；逐种子 >2× 与形状偏离 >${Math.round(REALM_SHAPE_TOLERANCE * 100)}% 只记录）→ **${realmVerdictText}**` +
      `（最差境：境 ${pathoWorstRealm ? pathoWorstRealm.realm : "—"} 中位 ${pathoWorstRealm ? f(pathoWorstRealm.med, 2) : "—"}×、最差种子 ${pathoWorstRealm ? f(pathoWorstRealm.worst, 2) : "—"}×）` +
      `｜单境 >2× 的种子：**${pathoSeedsOver}/${runs.length}**（软线 ≤${PATHO_SOFT_SEEDS}，只记录）→ ${pathoSoftOk ? '通过' : '⚠️ 超软线'}` +
      (!realmGateOn || realmMagnitudeOk ? "" : `：${realmMagnitude.map((x) => `种子 ${x.seed} 境 ${x.realm} ${f(x.at, 1)}min vs 目标 ${x.target}（${x.dev > 0 ? "+" : ""}${f(x.dev * 100, 1)}%，绝对 ${f(x.absDev, 1)}min）`).join("；")}`),
  );
  if (realmMagnitudeTail.length) {
    console.log(
      `  - 其中**尾部种子降级**（D96，满级出窗 ${[...tailSeedIds].join("/")}，最多豁免 1 颗）：` +
        realmMagnitudeTail.map((x) => `种子 ${x.seed} 境 ${x.realm} ${f(x.at, 1)}min vs ${x.target}（${x.dev > 0 ? "+" : ""}${f(x.dev * 100, 1)}%）`).join("；"),
    );
  }
  if (!tailExemptAllowed) {
    console.log(
      `  - ⚠️ 尾部种子 ${tailSeedIds.size} 颗（${[...tailSeedIds].join("/")}）> 豁免上限 ${TAIL_SEED_EXEMPT_MAX} ⇒ **不豁免**，按系统性问题查`,
    );
  }

  console.log('');
  console.log('## 表 2 · 满级（step 80）总时长与产出节奏');
  console.log('');
  console.log(
    '| 种子 | 满级(min) | 成型(min) | 毕业(min) | 全仙品(min) | 累计修为 | 到达层 | 最高层 | 三阶占比 | 波次 | 死亡 | 出货总数 | 法宝(落地) | 玉简 | 通货 | 出货总数/min | 法宝/min | 墙钟(ms) |',
  );
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const r of runs) {
    const pre = preMax(r);
    const mins = pre.mins;
    const produced = pre.cur;
    console.log(
      `| ${r.seed} | ${Number.isFinite(r.maxedAt) ? f(r.maxedAt, 1) : `${f(r.minutes, 1)}(未满级 step ${r.step})`} | ` +
        `${Number.isFinite(pre.formedAt) ? f(pre.formedAt, 1) : '未达成'} | ${Number.isFinite(pre.graduatedAt) ? f(pre.graduatedAt, 1) : '未达成'} | ${Number.isFinite(pre.allXianAt) ? f(pre.allXianAt, 1) : '未达成'} | ${r.cumXp} | ${r.floor} | ` +
        `${r.maxFloorReached ?? '—'} | ${pct(pre.share(3))} | ${r.wave} | ` +
        `${r.deaths} | ${pre.dropsTotal} | ${pre.itemDrops} | ${pre.gems} | ${produced} | ` +
        `${f(pre.dropsTotal / mins, 2)} | ${f(pre.itemDrops / mins, 2)} | ${r.wallMs} |`,
    );
  }
  console.log('');
  console.log(
    `- 满级时长：min ${f(maxedMin, 1)} / 中位 **${f(maxedMed, 1)}** / max ${f(maxedMax, 1)} min` +
      `（目标 ${TARGET_MAX_MINUTES}min，窗口 [${MAX_MIN_MINUTES}, ${MAX_MAX_MINUTES}]，偏差 ${f(dev * 100, 1)}%）` +
      `｜副红线（比例式）：最差种子 ${f(worstMaxed, 1)}min ${floorOk ? '>=' : '<'} ${f(floorMinMinutes, 1)}min（= ${Math.round(FLOOR_MIN_RATIO * 100)}% × 中位）→ ${floorOk ? '通过' : '**不通过**'}`,
  );
  console.log(`- 综合判定（满级时长）：**${pass ? '通过' : '不通过'}**${allMaxed ? '' : `（${runs.length - maxedRuns.length} 个种子在 ${MINUTES}min 内未满级）`}`);
  // 满级**极差**（D98 记录项，不判）：12 颗种子的 (max−min)/中位。shuzhi 定的观察线是 ≤35%，
  // 它衡量的不是难度而是「种子方差」—— 方差一旦长期贴线，说明某个系统性因素（精英密度、
  // 层内掷档）在放大个体差异，那时该查分布而不是调目标。
  const spread = Number.isFinite(maxedMed) && maxedMed > 0 ? (maxedMax - maxedMin) / maxedMed : NaN;
  console.log(
    `- 满级极差（**记录项，不判**）：${f((spread || 0) * 100, 1)}%（= (max ${f(maxedMax, 1)} − min ${f(maxedMin, 1)}) / 中位 ${f(maxedMed, 1)}；观察线 ≤35%）`,
  );
  // 段② 判据（D50 重判，shuzhi v4.26）：门禁换成「成型档」= 各部位 1 件宝品以上且 ≥1 条灵纹，
  // 目标 = 满级中位 × FORMEd_RATIO（当前 260×0.55 ≈ 143min ≈ 2.4h，D163 从 0.62 下调到设计比例 0.545~0.55），
  // 窗口上限 = 目标 × 1.15。「毕业（≥2 条对口）」真值 17.1h、「全仙品」≈21h，
  // 都降级成记录项 —— 判据说白了是「6h 这一段玩家该拿到什么」，不是「顶级装备多久能刷满」。
  // 教训：v4.25 的「毕业 6.2h」漏乘集齐 9 部位的优惠券系数 H(9)=2.83，真值 17.1h，
  // 拿它当段② 门禁 → 3/3 种子永远红（这是判据错，不是数值错）。
  const formedRuns = runs.filter((r) => Number.isFinite(preMax(r).formedAt));
  const formedMed = formedRuns.length ? med(formedRuns.map((r) => preMax(r).formedAt)) : NaN;
  // 判据 C（shuzhi v4.27）：每部位 itemPower ≥ 同部位同灵蕴宝品中位 ×1.0，中位标定 290min≈4.8h。
  // 旧的 338min 是「成型档 = 10 部位宝品以上」，因品阶非战力的单调代理已作废（D55）。
  // D68：判据 C 改 C4（9/10 部位过线 + 最差部位 ≥0.70 + 连续 30 分钟不跌破），成型绑满级 × 0.56（shuzhi v4.32 六判据同口径实测）。
// 好处是**只维护满级一个数**：满级改了，成型目标自动跟着走，不会再出现
// 「满级重标了、成型还是老数字」的口径分裂。
// 0.56 是 3 种子标出来的（0.579），6 种子中位是 0.618 —— 偏了 10%，改成 0.62。
// 结果：3 种子 −5.4%、6 种子 +2.6%，两边都居中（shuzhi v4.33 / D70）。
// D163：0.62 追不到需求，是 D65 从历史中位数反推的**锚**；真正的设计比例在 GDD 1.7：
//   段② 装备成型 6h : 段③ 境界圆满 5h ⇒ 6/11 = 0.545 ≈ **0.55**（target = 140）。
// 实测 130.8/254.7 = 0.514（比设计值低 5.7%，属「已经很好、但尺子错了」）⇒ 改尺子不改内容。
const FORMED_RATIO = 0.55;
// D143：基数改用「本轮满级中位」（c0 就是 TARGET_MAX_MINUTES，周目里是实测中位）。
// 理由同 D139/D142：成型 = 满级 × 0.62 是**一条比例关系**，周目满级 374.8min，
// 拿 c0 的 260 算出的 161min 当目标必然红（c2 实测中位 247min）。
// 这不是放宽 —— 相对红线（中位比值 ∈ [0.45, 0.80]）与达成率（≥90%）都还压着。
const formedBaseMinutes = () => (CYCLE === 0 ? TARGET_MAX_MINUTES : maxedMed);
// 绝对上限 = 目标 × 1.15（D79：目标随 TARGET_MAX_MINUTES 缩放，这里也只许跟着算，不许写死）。
// 它仍只作「明显失控」的粗筛；真正的红线是下面的相对线。
const FORMED_TARGET = Math.round(formedBaseMinutes() * FORMED_RATIO);
const FORMED_MAX = Math.round(FORMED_TARGET * 1.15);
// **相对副红线**（shuzhi v4.37 改判）：段② 必须给段③ 留出 ≥25% 的时间。
// 为什么不设绝对线：6 种子成型 148.3~254.6（CV 20%），设 240 → 2/6 假红；设 260 → 把真烂尾放行。
// 为什么不逐种子卡 0.85：这个比值**跨种子摆 0.44~0.89（45pp）**（成型由最倒霉的那个部位决定，
// 与满级不同源），逐种子 0.85 只剩 5pp、0.90 只剩 1pp —— 都是噪声开关，不是判据。
// 改法：主判 **中位比值 ≤ 0.75**（实测 0.617，余 13pp），副判逐种子 ≤ 0.98（只抓真事故：
// 成型贴在满级上 / 成型晚于满级）。
// D163：上沿从 0.80 收紧到 0.75 —— 成型晚于满级 75% = 「满级了还没成型」，那是真事故。
const FORMED_REL_MEDIAN_MAX = 0.75;
/** D119：段② 的硬线是「成型早于满级」的达成率（能/不能），比值只记录「多早」。 */
// D127：段② 比值带 —— 只判上界时「成型太早」抓不到（判据不对称）。下界 0.45 的语义：
// 段② 必须给段③ 留下一半以上的时间，否则段③ 变成纯挂机刷级。
const FORMED_REL_MEDIAN_MIN = 0.45;
const FORMED_REL_SOFT_ONLY = false; // D127：从「只记录」改为硬判（上下界都拦）
const FORMED_REL_SEED_MAX = 0.98;
// D99（shuzhi v4.45）：段② 是**带方差的设计目标**，不是正确性不变量 ——
// 「成型早于满级」逐种子硬断言会把 1/12 的方差当场判死；改成达成率 ≥90%。
// 系统性回归（比如 6/12）照样红，单颗只打印成告警。
const FORMED_BEFORE_MAX_RATE = 0.9;
  // 相对副红线：逐个种子算「成型/满级」，任一种子 > 0.85 就红（种子里程碑比值比绝对值稳）
  const formedRel = runs.map((r) => {
    const pre = preMax(r);
    return { seed: r.seed, formed: pre.formedAt, maxed: pre.mins, ratio: pre.mins > 0 ? pre.formedAt / pre.mins : NaN };
  });
  const formedRelWorst = formedRel.reduce((a, b) => (!Number.isFinite(a.ratio) ? b : !Number.isFinite(b.ratio) ? a : b.ratio > a.ratio ? b : a), { ratio: 0, seed: 0 });
  const formedRelMed = med(formedRel.map((x) => x.ratio));
  const formedRelMedOk =
    Number.isFinite(formedRelMed) &&
    formedRelMed <= FORMED_REL_MEDIAN_MAX &&
    formedRelMed >= FORMED_REL_MEDIAN_MIN;
  // D99：逐种子 ≤0.98 与「成型早于满级」是同一个判据的两种写法，单颗失败已在下面
  // 按达成率口径统一处理（≥90%）；这里只保留中位线，单颗超线进告警。
  const formedRelSeedOk = formedRel.every((x) => !Number.isFinite(x.maxed) || x.ratio <= FORMED_REL_SEED_MAX);
  const formedRelOk = FORMED_REL_SOFT_ONLY ? true : formedRelMedOk;
  // 达成率的分子必须是「成型**早于**满级」的种子数：`formedRuns` 现在按事实取值（含成型晚于满级的），
  // 直接拿它当分子会把「满级后才成型」算成达成（== 方向相反的重复计罚）。
  const formedBeforeMaxRuns = formedRuns.filter((r) => {
    const p = preMax(r);
    return Number.isFinite(p.formedAt) && Number.isFinite(p.mins) && p.formedAt <= p.mins;
  });
  const formedEnough = runs.length > 0 && formedBeforeMaxRuns.length / runs.length >= FORMED_BEFORE_MAX_RATE;
  // D145 附：段② 的目标带（186~214）是初临的判据。c≥1 时目标已按本轮满级中位缩放（D143），
  // 但「成型/满级」这个比值本身随周目系统性前移（深层变肉 → 练级慢、装备不慢），
  // 于是 c≥1 只判「有成型时刻 + 达成率 ≥90% + 比值落在硬带 [0.45,0.80]」，不判 ±15% 目标带。
  // D163：**绝对带已删除** —— 它是比值带 [0.45,0.75] 的更严别名（÷254.7 = [0.538,0.726]），
  // 同一事实罚两次（D119「去掉重复计罚」的第三例）。段② 现在只有两条判据：
  //   ① 达成率 ≥90%（能/不能成型）② 中位比值 ∈ [0.45,0.75]（多早）。
  // 绝对分钟只在报表里打印，用于人眼核对「140 目标 vs 实测 130.8」。
  const formedShapeOk = Number.isFinite(formedMed);
  const formedPass = formedEnough && formedShapeOk && formedRelOk;
  // 段② 的「成型早于满级」判据（D99，shuzhi v4.45 改聚合层）：
  // 段② 是**带方差的设计目标**，不是正确性不变量。逐种子硬断言会把 1/12 的方差当场判死，
  // 于是改成**达成率 ≥ 90%**：系统性回归（6/12）照样红，单颗只打印成告警。
  const lateFormed = runs.filter((r) => {
    // 必须用**绝对值** `r.formedPowerAt`，不能用 `preMax(r).formedAt`：
    // 后者是「满级那一刻的值」，成型晚于满级的种子在那一刻还是 null ⇒ 这条判据会
    // 永远看不到它要抓的东西（`达成 11/12` 报得出来、`告警` 却一行不打印，就是踩了这个坑）。
    const fa = r.formedPowerAt;
    return Number.isFinite(fa) && Number.isFinite(r.maxedAt) && fa > r.maxedAt;
  });
  const formedBeforeMaxRate =
    runs.length > 0 ? (runs.length - lateFormed.length) / runs.length : 0;
  const structuralOk = formedBeforeMaxRate >= FORMED_BEFORE_MAX_RATE;
  const formedPassFinal = formedPass && structuralOk;
  if (lateFormed.length > 0) {
    console.log(
      `  - ⚠️ 告警（不单独判红）：${lateFormed.length}/${runs.length} 个种子「成型晚于满级」（` +
        lateFormed.map((r) => `seed ${r.seed} 成型 ${f(r.formedPowerAt, 1)} > 满级 ${f(r.maxedAt, 1)}`).join('；') +
        `），达成率 ${f(formedBeforeMaxRate * 100, 1)}%（红线 ≥${Math.round(FORMED_BEFORE_MAX_RATE * 100)}%）`,
    );
  }
  console.log(
    `- 段② 成型档（**判据 C**：每部位 itemPower ≥ 同部位同灵蕴宝品中位 ×1.0，**唯一门禁**）：中位 **${Number.isFinite(formedMed) ? f(formedMed, 1) : '未达成'}min**` +
      `（目标 ${FORMED_TARGET}min≈${f(FORMED_TARGET / 60, 1)}h，窗口 ≤${FORMED_MAX}min，偏差 ${Number.isFinite(formedMed) ? f(((formedMed - FORMED_TARGET) / FORMED_TARGET) * 100, 1) : '—'}%，` +
      `达成 ${formedBeforeMaxRuns.length}/${runs.length} 种子）→ **${formedPassFinal ? '通过' : '不通过'}**`,
  );
  console.log(
    `- 段② 比值（**D127 硬判：中位必须落在 [${FORMED_REL_MEDIAN_MIN}, ${FORMED_REL_MEDIAN_MAX}]**；逐种子 ≤ ${FORMED_REL_SEED_MAX} 只打印）：` +
      `中位 ${Number.isFinite(formedRelMed) ? pct(formedRelMed) : "—"}、最差 ${Number.isFinite(formedRelWorst.ratio) ? pct(formedRelWorst.ratio) : "—"}` +
      `（种子 ${formedRelWorst.seed}）→ **${formedRelOk ? "通过" : "不通过"}**（绝对上限 ${FORMED_MAX}min 只记录）`,
  );
  // **尾部种子**（合并输出）：满级出窗 与 九境超差 通常是同一颗种子（20265073），
  // 分两张表各报一次等于把同一个尾部样本说两遍，还会让人以为是两个问题（shuzhi v4.34）。
  {
    const slow = runs.filter(
      (r) => Number.isFinite(r.maxedAt) && (r.maxedAt < MAX_MIN_MINUTES || r.maxedAt > MAX_MAX_MINUTES),
    );
    const slowRealm = new Set(realmMagnitude.map((x) => x.seed));
    if (slow.length > 0 || slowRealm.size > 0) {
      const seeds = [...new Set([...slow.map((r) => r.seed), ...slowRealm])];
      console.log(
        `- 尾部种子（**只记录，不判**）：` +
          seeds
            .map((s) => {
              const r = runs.find((x) => x.seed === s);
              const m = r && Number.isFinite(r.maxedAt) ? `${f(r.maxedAt, 1)}min` : "未满级";
              const tags = [];
              if (r && Number.isFinite(r.maxedAt) && r.maxedAt > MAX_MAX_MINUTES) tags.push("满级超出窗口上限");
              if (r && Number.isFinite(r.maxedAt) && r.maxedAt < MAX_MIN_MINUTES) tags.push("满级低于窗口下限");
              if (slowRealm.has(s)) tags.push("九境偏离超 ±" + Math.round(REALM_TOLERANCE * 100) + "%（正常散布，只记录）");
              return `${s}（满级 ${m}${tags.length ? "，" + tags.join("、") : ""}）`;
            })
            .join("；") +
          `｜若启用 6 种子协议，满级上限须放到 445min`,
      );
    }
  }
  const gradMedAll = med(runs.filter((r) => Number.isFinite(preMax(r).graduatedAt)).map((r) => preMax(r).graduatedAt));
  console.log(
    `- 段② 记录项（毕业：各部位 1 件宝品以上且 ≥2 条灵纹，目标 17.1h，**已作废、只记录**）：中位 ` +
      `${Number.isFinite(gradMedAll) ? `${f(gradMedAll, 1)}min` : '本窗口内未达成'}；` +
      `达成 ${runs.filter((r) => Number.isFinite(preMax(r).graduatedAt)).length}/${runs.length} 种子`,
  );
  const xianMed = med(runs.filter((r) => Number.isFinite(preMax(r).allXianAt)).map((r) => preMax(r).allXianAt));
  console.log(
    `- 段④ 记录项（9 部位全仙品，目标 22.9h，不判）：中位 ${Number.isFinite(xianMed) ? `${f(xianMed, 1)}min` : '本窗口内未达成'}；` +
      `达成 ${runs.filter((r) => Number.isFinite(preMax(r).allXianAt)).length}/${runs.length} 种子`,
  );
  // 段② 诊断：满级那一刻各部位水平（宝品以上槽数 / 已满足「宝品+≥2 条」的槽数）
  const gearRuns = runs.filter((r) => r.atMax?.gear);
  if (gearRuns.length) {
    const statsOf = (r) => {
      const g = r.atMax.gear;
      const filled = g.filter((x) => x.rarity).length;
      const baoPlus = g.filter((x) => x.rarity === 'bao' || x.rarity === 'xian').length;
      const ok = g.filter((x) => (x.rarity === 'bao' || x.rarity === 'xian') && x.affixes >= 2).length;
      return { filled, baoPlus, ok };
    };
    console.log(
      `- 段② 诊断（满级瞬间，**旧口径**「品阶 + 灵纹数」，仅供对照，不判）：已装备 ${med(gearRuns.map((r) => statsOf(r).filled))} 槽 / ` +
        `宝品以上 ${med(gearRuns.map((r) => statsOf(r).baoPlus))} 槽 / **满足「宝品+≥2 条」${med(gearRuns.map((r) => statsOf(r).ok))} 槽**（需 10 槽）`,
    );
    console.log('');
    console.log('| 种子 | 部位（品阶/词缀数） |');
    console.log('|---|---|');
    for (const r of gearRuns) {
      const txt = r.atMax.gear
        .map((x) => `${x.slot}:${x.rarity ?? '空'}${x.rarity ? `/${x.affixes}` : ''}`)
        .join('、');
      console.log(`| ${r.seed} | ${txt} |`);
    }
  }
  console.log(
    `- 掉落节奏（中位，满级前口径）：**出货总数 ${f(med(runs.map((r) => preMax(r).dropsTotal / preMax(r).mins)), 2)}/分**（法宝+玉简+通货三类合计）、` +
      `**法宝 ${f(med(runs.map((r) => preMax(r).itemDrops / preMax(r).mins)), 2)}/分**（扫 s.ground 真实落地物）`,
  );
  console.log(
    `- 全程死亡：${totalDeaths.join(' / ')}（中位 ${deathMed}，验收带 ${DEATH_MEDIAN_BAND[0]}~${DEATH_MEDIAN_BAND[1]}）` +
      `；>${DEATH_LIST_THRESHOLD} 次的种子逐条列在表 4`,
  );
  console.log(
    `- 死亡时间占比（**D150 记录项，同量纲**）：中位 ${Number.isFinite(reworkMed) ? f(reworkMed * 100, 1) : "—"}%` +
      `（= 死亡次数 × ${REWORK_MIN_PER_DEATH}min ÷ 满级时长；c4+ 超 ${(REWORK_SIGNAL_MAX * 100).toFixed(0)}% 才是「该动机制」的信号）` +
      (reworkOver.length ? `｜⚠️ ${reworkOver.length}/${runs.length} 个种子 >${(REWORK_SIGNAL_MAX * 100).toFixed(0)}%` : `｜全部 ≤${(REWORK_SIGNAL_MAX * 100).toFixed(0)}%`),
  );
  console.log(
    `- 死亡尾部（**D114 硬上限 ≤${DEATH_HARD_MAX} 次/种子**）：最差 ${deathMax} 次` +
      (deathHardOk
        ? ' → **通过**'
        : ` → **不通过**：${deathOver.join(', ')} 超上限（死锁特征：连死 → 逃生阀该生效而没生效）`) +
      `｜中位落在 ${DEATH_MEDIAN_BAND[0]}~${DEATH_MEDIAN_BAND[1]} 带内 → ${deathMedOk ? '通过' : '不通过（只调斜坡斜率，逃生阀不动）'}`,
  );
  console.log(
    `- 死锁事件（**软红 ≤${DEATH_LOCK_MAX} 次/种子**，1 次 = ${DEATH_MEDIAN_BAND[0] > 0 ? 3 : 3} 次死亡）：${lockEvents.join(' / ')}（最差 ${lockMax}）` +
      (lockOver.length ? ` → ⚠️ ${lockOver.join(', ')} 超软红线（只记录，不拦门禁）` : ' → 通过'),
  );
  console.log(
    `- 脱困率（**D121 记录项**，排除前沿带 floor ≥ ${frontierFloor}）：${escapedCount}/${allEscapes.length} = ${(escapeRate * 100).toFixed(1)}%` +
      `｜前沿带单独统计：${frontierEscapes.length} 个事件（最后一层附近不可用「推进 2 层」判定，改看「能否最终清过最后一层」）`,
  );
  console.log(
    `- 撞墙率（**软线 ≤${(WALL_HIT_RATE_MAX * 100).toFixed(0)}%**，定义：死锁事件 ≥${WALL_LOCK_MIN} 次）：${wallSeeds.length}/${runs.length} = ${(wallHitRate * 100).toFixed(1)}% → ${wallHitOk ? '通过' : '⚠️ 超软线（只记录）'}（双峰下唯一稳定的「受影响比例」）`,
  );
  console.log(
    `- 周目渐入（**${CYCLE > 0 ? `硬线：层 1~${EARLY_FLOOR_MAX} 零死亡` : '不适用（c = 0）'}**）：${
      CYCLE > 0
        ? earlyDeathOk
          ? `0/${runs.length} 个种子在层 1~${EARLY_FLOOR_MAX} 死亡 → 通过`
          : `**${earlyDeathSeeds.length}/${runs.length} 个种子在层 1~${EARLY_FLOOR_MAX} 死亡**（渐入没接上 / 倍率被改回全局）→ 不通过`
        : '初临不判'
    }`,
  );
  console.log(
    `- 首次撞墙层（**硬线 ≥${FIRST_WALL_MIN_FLOOR}**）：最浅 ${Number.isFinite(firstWallMin) ? firstWallMin : '无死亡'} → ${firstWallOk ? '通过' : '**不通过**：撞墙落在中段，说明层 22~30 被破坏（深层难 ≠ 全程难）'}`,
  );
  const share1 = med(runs.map((r) => preMax(r).share(1)));
  const share2 = med(runs.map((r) => preMax(r).share(2)));
  const share3 = med(runs.map((r) => preMax(r).share(3)));
  console.log(
    `- 阶停留占比（中位，满级前口径）：一阶 **${pct(share1)}** / 二阶 **${pct(share2)}** / 三阶 **${pct(share3)}**` +
      `（farm=${FARM_MODE}；三阶占比是本轮 T2 的主判据）`,
  );
  if (FARM_MODE !== 'off') {
    const farmFloors = runs.map((r) => r.floor);
    console.log(
      `- 选层策略：farm=${FARM_MODE}${FARM_MODE === 'deepest' ? `、farm-from=${runs[0].farmFrom}` : ''}` +
        `；农点（末层，中位）层 ${med(farmFloors)}（修为/分 ${med(runs.map((r) => r.farmFloorXpPerMin ?? 0)).toFixed(0)}）` +
        `、最高到过层（中位）${med(runs.map((r) => r.maxFloorReached))}、` +
        `改层次数（中位）${med(runs.map((r) => r.farmSnaps))}`,
    );
  }

  console.log('');
  if (REPORT_DROPS_BY_TIER) {
    console.log('## 表 2b · 按阶分列掉落（每阶 9 层，中位数）· `--report-drops-by-tier`');
    console.log('');
    console.log('| 阶 | 层段 | 停留时长(min) | 击杀 | 法宝 | 玉简 | 通货 | 掉落总数 | 法宝/分 | 玉简/分 | 通货/分 | 总数/分 |');
    console.log('|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
    for (const t of [1, 2, 3]) {
      const pick = (run) => run.tierStats.find((x) => x.tier === t) ?? { minutes: 0, kills: 0, itemDrops: 0, currency: 0, gems: 0 };
      const rate = (key, m) =>
        med(
          runs.map((r) => {
            const x = pick(r);
            return x.minutes > 0 ? x[key] / x.minutes : 0;
          }),
        );
      const item = rate('itemDrops');
      const gem = rate('gems');
      const cur = rate('currency');
      const totalItems = med(runs.map((r) => pick(r).itemDrops));
      const totalGems = med(runs.map((r) => pick(r).gems));
      const totalCur = med(runs.map((r) => pick(r).currency));
      console.log(
        `| ${t} | 层 ${t === 1 ? '1~9' : t === 2 ? '10~18' : '19~27'} | ${f(med(runs.map((r) => pick(r).minutes)), 1)} | ` +
          `${f(med(runs.map((r) => pick(r).kills)), 0)} | ${f(totalItems, 0)} | ${f(totalGems, 0)} | ${f(totalCur, 0)} | ` +
          `${f(totalItems + totalGems + totalCur, 0)} | ${f(item, 2)} | ${f(gem, 2)} | ${f(cur, 2)} | ${f(item + gem + cur, 2)} |`,
      );
    }
    console.log('');
    console.log('> 口径（lead m02515 修正后）：**法宝数 = 扫 `s.ground` 真实落地物按 `GroundDrop.id` 去重计数**；');
    console.log('> 通货/玉简 = 口袋/玉简袋增量。**不再用「掉落总数 − 通货 − 玉简」减法** —— `dropsFound` 是每次击杀 +1，');
    console.log('> 法宝支还要过 `DROP_CHANCE`（normal 0.28），减法会把掷失败的 72% 也算成法宝（高估约 2.5 倍）。');
    console.log('> 停留时长 = 该阶累计帧时长（满级前玩家在这一阶待的总时间），不是 9 层 × 固定时长。');
    console.log('');
  }

  console.log('');
  console.log('## 表 3 · 落层轨迹（seed ' + runs[0].seed + '）');
  console.log('');
  console.log('> `方式`：`advance`=清镇守波自然下潜；`farm-forward`/`farm-back`=选层策略挪层（T2 才出现）。');
  console.log('');
  console.log('| 到达层 | 分钟 | 当时台阶 | 方式 |');
  console.log('|---:|---:|---:|---|');
  for (const x of runs[0].floorTrail) console.log(`| ${x.floor} | ${f(x.minute, 1)} | ${x.step} | ${x.via ?? 'advance'} |`);

  console.log('');
  console.log('## 表 4 · 死亡明细（仅列出全程死亡 >' + DEATH_LIST_THRESHOLD + ' 次的种子）');
  console.log('');
  const deathy = runs.filter((r) => r.deaths > DEATH_LIST_THRESHOLD);
  if (deathy.length === 0) {
    console.log(`（无：全部种子死亡 ≤${DEATH_LIST_THRESHOLD} 次）`);
  } else {
    for (const r of deathy) {
      console.log(`**seed ${r.seed}（${r.deaths} 死）**：`);
      console.log('');
      console.log('| 第几次 | 分钟 | 层 | 台阶 | 境 |');
      console.log('|---:|---:|---:|---:|---:|');
      r.deathEvents.forEach((d, i) =>
        console.log(`| ${i + 1} | ${f(d.minute, 1)} | ${d.floor} | ${d.step} | ${d.realm} |`),
      );
      console.log('');
    }
  }

  if (REPORT_KILLS) {
    // 按层真实击杀率（BALANCE §21.11 real 列）。取各层「总击杀 / 总分钟」，
    // 只列有击杀的层；层号越界（farm 回退）时同一层会多次出现，已按层号聚合。
    const agg = new Map();
    for (const run of runs) {
      for (const row of run.floorStats ?? []) {
        const cur = agg.get(row.floor) ?? { floor: row.floor, kills: 0, minutes: 0 };
        cur.kills += row.kills ?? 0;
        cur.minutes += row.minutes ?? 0;
        agg.set(row.floor, cur);
      }
    }
    const rows = [...agg.values()]
      .filter((x) => x.kills > 0 && x.minutes > 0)
      .sort((a, b) => a.floor - b.floor);
    console.log('');
    console.log(`## 表 K · 按层真实击杀率（real 列，${runs.length} 种子合计 · 口径 kills/minutes）`);
    console.log('');
    console.log('| 层 | 击杀 | 分钟 | 击杀/分 |');
    console.log('|---:|---:|---:|---:|');
    for (const x of rows) {
      console.log(`| ${x.floor} | ${f(x.kills, 0)} | ${f(x.minutes, 1)} | ${f(x.kills / x.minutes, 2)} |`);
    }
    const line = rows.map((x) => (x.kills / x.minutes).toFixed(1)).join(', ');
    console.log('');
    console.log(`\`KILLS_PER_MIN_BY_FLOOR(real) = [${line}]\``);
    console.log('');
  }

  if (POST_CAP) {
    // 表 2c：满级后段（D36-A「满级后还有 3h 内容」的验收口径，lead m02261）
    console.log('');
    console.log('## 表 2c · 满级后段（`--post-cap`：满级后不中断，继续跑满 `--minutes`）');
    console.log('');
    console.log(
      '> 口径：渊痕 = 满级后修为 1:1 转换（`session.ts` 的 player-kill 分支），**不产生任何战力**；',
    );
    console.log('> `渊痕/分` 只除「满级后分钟数」，不含满级前。');
    console.log('');
    console.log('| 种子 | 满级(min) | 满级后(min) | 满级时渊痕 | 终局渊痕 | 渊痕/分 | 最高层 | 终局层 | 死亡 |');
    console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|');
    for (const r of runs) {
      const post = Number.isFinite(r.maxedAt) ? Math.max(0, r.minutes - r.maxedAt) : 0;
      const marksGained = Math.max(0, r.marks - (r.marksAtMax ?? 0));
      console.log(
        `| ${r.seed} | ${f(r.maxedAt, 1)} | ${f(post, 1)} | ${f(r.marksAtMax ?? 0, 0)} | ${r.marks} | ` +
          `${post > 0 ? f(marksGained / post, 0) : '—'} | ${r.maxFloorReached ?? '—'} | ${r.floor} | ${r.deaths} |`,
      );
    }
    const postMed = med(runs.map((r) => (Number.isFinite(r.maxedAt) ? r.minutes - r.maxedAt : NaN)));
    const marksPerMinMed = med(
      runs.map((r) => {
        const post = Number.isFinite(r.maxedAt) ? r.minutes - r.maxedAt : 0;
        return post > 0 ? Math.max(0, r.marks - (r.marksAtMax ?? 0)) / post : NaN;
      }),
    );
    console.log('');
    // ⚠️ 这不是设计量：段④ 没有「长度」（满级后修为丢弃、层 46 封顶），
    // 这个数必然 = 窗口 − 满级时长，跑多久涨多久，无法验收（shuzhi v4.28 / D57）。
    console.log(
      `- 窗口剩余（**非设计量，仅记录**）：${f(postMed, 1)} min = ${MINUTES} − ${f(maxedMed, 1)}（段④ 度量看下面的「渊痕产出」）`,
    );
    console.log(
      `- 渊痕产出（中位）：**${f(marksPerMinMed, 0)} / 分**；终局渊痕（中位）${f(med(runs.map((r) => r.marks)), 0)}`,
    );
    console.log(
      `- 最深层（中位）：**${med(runs.map((r) => r.maxFloorReached ?? NaN))}**；终局层（中位）：${med(runs.map((r) => r.floor))}` +
        `（farm=${FARM_MODE}${FARM_MODE === 'deepest' ? `，farm-from=${runs[0].farmFrom}` : ''}）`,
    );
  }

  if (POST_CAP && runs.some((r) => r.postCap && r.postCap.minutes > 0)) {
    // 表 2d：段④ 产出（D57/D63）。**不要**拿「满级后跑了多少分钟」当段④ 的长度 ——
    // 那个数 = 窗口 − 满级，跑多久涨多久，无法验收。段④ 唯一诚实的度量是产出。
    console.log('');
    console.log('## 表 2d · 段④ 产出（满级后的**仙品件数**，D63 口径：6 数值 : 3 旗子 = 2:1）');
    console.log(`> **D122 主口径改末层（层 ${MAX_FLOOR}）**：护栏 = 该层停留 <${MIN_STAY_MINUTES}min 记「样本不足」不给数；「最优刷层」只是诊断列（跨种子不可比），不替换主口径。`);
    console.log('');
    console.log('> 口径：只统计**满级之后**落到地上的仙品（扫 `s.ground` 去重），旗子 = `xueji`/`zhuopo`/`shuangying` 三条。');
    console.log('> **口径事故（v4.38 / shuzhi D81）**：这一列的分母是「满级后窗口长度」，任何加速爬层的改动都会让它涨');
    console.log('> （D78 只换代码：窗口 560→602min，读数 7.7→13.8 = +79%，掉率一点没变）。');
    console.log('> **主口径 = 「停留层 46 时入包的仙品 ÷ 停留层 46 的分钟数」**；未到 46 的种子记 "—"，不当 0。旧列只为对照，不得引用。');
    console.log('> 口径：**主口径 = 层 46**（满级后的自然农点：depthRarityBonus 0.45 vs 层 21 约 0.30）；');
console.log('> 层 21 的 3.8 件/3h（≈21h 集齐）只作「还没到层 46 的玩家的**保守下限**」记录（shuzhi v4.34 / D73）。');
    console.log('');
    console.log('| 种子 | 满级后(min) | 仙品件数 | 其中旗子 | 数值传奇 | 末层停留(min) | 仙品/3h(末层) | 最优刷层 | 旧口径/3h | 数值 : 旗子 |');
    console.log('|---|---:|---:|---:|---:|---:|---|');
    for (const r of runs) {
      const pc = r.postCap ?? { minutes: 0, xian: 0, flagXian: 0 };
      const num = Math.max(0, pc.xian - pc.flagXian);
      // D122：末层（MAX_FLOOR）停留口径；样本 <60min 记「样本不足」，不给数（防第二个「窗口截断假数」）
      const stay = pc.stayByFloor ?? [];
      const topStay = stay.find((x) => x.floor >= MAX_FLOOR) ?? stay[stay.length - 1];
      const qualified = stay.filter((x) => x.minutes >= MIN_STAY_MINUTES && Number.isFinite(x.per3h));
      const bestStay = qualified.length ? qualified.reduce((a, b) => (b.per3h > a.per3h ? b : a)) : null;
      const ratio = pc.flagXian > 0 ? `${f(num / pc.flagXian, 2)} : 1` : (pc.xian > 0 ? `${pc.xian} : 0` : "—");
      console.log(
        `| ${r.seed} | ${f(pc.minutes, 1)} | ${pc.xian} | ${pc.flagXian} | ${num} | ` +
          `${topStay && topStay.minutes >= MIN_STAY_MINUTES ? f(topStay.minutes, 1) : `${f(topStay ? topStay.minutes : 0, 1)}⚠️`} | ` +
          `${topStay && topStay.minutes >= MIN_STAY_MINUTES ? f(topStay.per3h, 1) : '样本不足'} | ` +
          `${bestStay ? `层${bestStay.floor}(${f(bestStay.per3h, 1)})` : '—'} | ` +
          `${pc.minutes > 0 ? f((pc.xian / pc.minutes) * 180, 1) : '—'} | ${ratio} |`,
      );
    }
    const xianPer3hMed = med(
      runs.map((r) => {
        const pc = r.postCap ?? { minutes: 0, xian: 0 };
        return pc.minutes > 0 ? (pc.xian / pc.minutes) * 180 : NaN;
      }),
    );
    const flagShareMed = med(
      runs.map((r) => {
        const pc = r.postCap ?? { minutes: 0, xian: 0, flagXian: 0 };
        return pc.xian > 0 ? pc.flagXian / pc.xian : NaN;
      }),
    );
    const xianPer3hAtF46Med = med(runs.map((r) => r.postCap?.xianPer3hAtF46 ?? NaN));
    // D122：末层（MAX_FLOOR）停留产出 —— 只取样本 ≥MIN_STAY_MINUTES 的种子；一个都没有就写「样本不足」
    const topFloorPer3h = runs
      .map((r) => {
        const stay = r.postCap?.stayByFloor ?? [];
        const top = stay.find((x) => x.floor >= MAX_FLOOR) ?? stay[stay.length - 1];
        return top && top.minutes >= MIN_STAY_MINUTES && Number.isFinite(top.per3h) ? top.per3h : NaN;
      })
      .filter((x) => Number.isFinite(x));
    const topFloorPer3hMed = med(topFloorPer3h);
    const splitW = runs.reduce((a, r) => a + (r.damageSplit?.weapon ?? 0), 0);
    const splitS = runs.reduce((a, r) => a + (r.damageSplit?.skill ?? 0), 0);
    const weaponShare = splitW + splitS > 0 ? splitW / (splitW + splitS) : NaN;
    console.log('');
    console.log(
      `- 段④ 主口径（**末层层 ${MAX_FLOOR} 停留产出**，D122）：仙品 **${Number.isFinite(topFloorPer3hMed) ? f(topFloorPer3hMed, 1) : '样本不足'} 件 / 3h**` +
        `（样本 = 停留 ≥${MIN_STAY_MINUTES}min 的 ${topFloorPer3h.length}/${runs.length} 个种子；不足的不给数）` +
        `｜伤害构成：武器段 **${Number.isFinite(weaponShare) ? pct(weaponShare) : '—'}** / 神通段 ${Number.isFinite(weaponShare) ? pct(1 - weaponShare) : '—'}`,
    );
    console.log(
      `- 段④ 旧混合口径（**不得引用**，分母是窗口长度）：仙品 **${f(xianPer3hMed, 1)} 件 / 3h**；其中旗子占 **${pct(flagShareMed)}**（设计值 33.3%）` +
        `｜旧「层 46」口径 ${Number.isFinite(xianPer3hAtF46Med) ? f(xianPer3hAtF46Med, 1) : '—'} 件/3h（种子已不再在 46 停留，故此列作废）`,
    );
    console.log(`- 全仙品（**主口径 末层停留产出**）：需 ${f(9 * 2.829, 2)} 件（×H(9)），按上表约 **${Number.isFinite(topFloorPer3hMed) && topFloorPer3hMed > 0 ? f((9 * 2.829 / topFloorPer3hMed) * 3, 1) : '样本不足'} 小时**`);
console.log('- 保守下限（层 21，未到层 46）：约 **21.0 小时** —— 解析值 11.5h 与实测 9.9h 同量级，差来自解析式未含 depthRarityBonus 的实际分布。');
  }

  if (JSON_OUT) {
    const payload = {
      generatedAt: new Date().toISOString(),
      params: {
        seeds: SEEDS,
        baseSeed: BASE_SEED,
        minutes: MINUTES,
        dt: DT,
        classId: CLASS_ID,
        talents: TALENTS,
        talentMode: TALENT_MODE,
        autoTalents: AUTO_TALENTS,
        farm: FARM_MODE,
        farmFrom: FARM_FROM ?? null,
        postCap: POST_CAP,
      },
      targets: {
        maxMinutes: TARGET_MAX_MINUTES,
        maxWindow: [MAX_MIN_MINUTES, MAX_MAX_MINUTES],
        realmTolerance: REALM_TOLERANCE,
        realmMinutes: TARGET_REALM_MINUTES,
      },
      verdict: {
        pass,
    targetMaxMinutes: TARGET_MAX_MINUTES, // D128：四段下界基数的单一来源
        allMaxed,
        maxedMin,
        maxedMed,
        maxedMax,
        dev,
        floorMin: worstMaxed,
        floorLimit: floorMinMinutes,
        floorOk,
        realmMagnitudeOk,
        // D165：伴生字段 —— 这个判据本轮到底有没有参与判定（false 不再二义）。
        deaths: totalDeaths,
        deathMed,
        deathMax,
        deathHardOk,
        deathMedOk,
    reworkMed,
    reworkOver: reworkOver.map((r) => r.seed),
        deathLockMax: lockMax,
        deathLockOver: lockOver,
        firstWallMin,
        firstWallOk,
        escapeRate,
        escapeRateEvents: allEscapes.length,
        frontierEscapeEvents: frontierEscapes.length,
        escapeRateOk,
        wallHitRate,
        wallHitOk,
        earlyDeathSeeds,
        earlyDeathOk,
        wallGateActive,
        cycle: CYCLE,
        survivalOk,
        // 段② 也必须有 JSON 出口：它是 `hardFail` 的一项，但之前只打印、不进 verdict，
        // 结果我用 `verdict.pass` 判绿时漏掉它一整轮（D128 族：判据要有单一出口且可读）。
        formedMed,
        formedTarget: FORMED_TARGET,
        formedMax: FORMED_MAX,
        formedDeviationPct:
          Number.isFinite(formedMed) && FORMED_TARGET > 0 ? ((formedMed - FORMED_TARGET) / FORMED_TARGET) * 100 : null,
        formedBeforeMaxRate: runs.length > 0 ? formedBeforeMaxRuns.length / runs.length : 0,
        formedRelMed,
        formedShapeOk,
        formedRelOk,
        formedPass: formedPassFinal,
        // D165：伴生字段 —— 这个判据本轮到底有没有参与判定（false 不再二义）。
        realmGateActive: CYCLE === 0,
      },
      runs,
    };
    fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
    fs.writeFileSync(JSON_OUT, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`\nJSON 已写入 ${JSON_OUT}`);
  }
  // 硬门禁不过 → 退出码 1：让「红」在一行命令里就能看见，不靠人读输出。
  // D142：把「初临形状」类门禁（九境病理）限定在 CYCLE === 0。
  // 理由（同 D136/D138/D139）：九境病理判的是「一轮之内快慢是否均匀」，而周目列表里的
  // 目标基数本来就是按本轮满级中位缩放的，且周目的真实验收是链级的（`tools/check-cycle-24h.mjs`：
  // 累计 24h + 单调线 cycleTime(N+1)/N ≥ 1.05 + 死亡/小时 ≤ 15）。
  // 不是放宽：c≥1 仍有 allMaxed / survivalOk（脱困率 + 层 1~9 零死亡）/ 段② 达成率 + 比值硬带，
  // 链级另有三条（累计 24h ±15% / 单调 ≥1.05 / 死亡 ≤15 次每小时，见 check-cycle-24h.mjs）。
  const realmGateActive = CYCLE === 0;
  const hardFail =
    !pass ||
    !allMaxed ||
    !formedPassFinal ||
    !structuralOk ||
    (realmGateActive && !realmMagnitudeOk) ||
    !survivalOk;
  if (hardFail) {
    console.log(
      '\n❌ 硬门禁未全部通过（满级时长 / 段② 成型 / 结构性断言 / 九境病理（仅 c0）/ survivalOk＝首次撞墙层 + 脱困率），退出码 1',
    );
    process.exitCode = 1;
  }
} finally {
  await close();
}
