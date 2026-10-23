/**
 * 方案验证 sim（参数化）：一次跑完「方案 A/B/C/D」的对比表。
 *
 * 背景：EHP 危机（docs/DIAG-EHP.md）的候选修法都是「改全局乘数」——
 *   A 气血通道重标（life × k）      → --life-mul
 *   B 怪攻基准下调（怪物攻伐 × k）  → --atk-mul
 *   C 护甲曲线重标（护甲 × k）      → --armor-mul / --armor-floor-bonus
 *   D 各半                          → 两个乘数一起给
 *   B' 怪攻曲线封顶（层向天花板）    → --atk-cap-floor / --atk-cap-mul
 * 如果每个方案都要改进 src 再跑一遍，既慢又容易把「验证」变成「改代码」。
 * 所以本工具在**运行时**改数值，一行 src 都不动：
 *   - 玩家面板：同步后按 base × life-mul 重算上限；护甲 = base.armor × armor-mul × (1 + armor-floor-bonus×(层-1))
 *     （血量按比例保留，不白送满血）
 *   - 怪物攻伐：每波生成后 × atk-mul；若给了 --atk-cap-mul，则「层数曲线部分」先封顶（见下）
 *   - 波次规模：自己 spawnRing（--wave-size），默认 = session.WAVE_SIZE
 *   - 波末回气：自己按 --regen 结算（默认 = session.WAVE_END_REGEN）
 *
 * 口径（刻意与 diag-floor / sim-rate 一致，便于横向对比）：
 *   - 层 N → 境 ceil(N/3) → 台阶 (境-1)*9+4，裸装（下界）
 *   - 每层独立跑，种子固定，dt=1/60，拍数 = minutes*60*60
 *   - 死亡 = 重开本波（不推进进度），计数口径与 session 一致
 *   - 波末回气只在「真清完」时给，死亡重开不给（与 src/core/session.ts 一致）
 *   - 回气默认 once（与 src 现状一致：src 已修为「开新波那一帧一次性结算」，
 *     见 session.ts tickSession 末段 `waveTimer >= WAVE_GAP` 分支，先回气再 startWave）；
 *     `--regen-mode=session` 保留给「历史每帧结算口径」的对比（0.9s gap × 54 帧 ⇒ 等价满血）
 *
 * 攻伐封顶（--atk-cap-mul=M，配合 --atk-cap-floor=N）：层 ≥ N 时，怪攻里**层数曲线那部分**
 *   scaleOfFloor(floor).damage 取 min(实际, M)，即「从层 N 起攻伐不再随层涨、钉在 1.09^(N-1) 当量」。
 *   例：--atk-cap-floor=15 --atk-cap-mul=3.2 ⇒ 层 15+ 的攻伐曲线钉在 3.2×（当前层 27 是 1.09^26 = 9.4×），
 *   层 14 是 1.09^13 = 3.07 < 3.2，所以从这层起曲线连续、不会出现「越深越不疼」的倒挂。
 *
 *   例：「层 21+ 攻伐封顶」的正确取值要让曲线在封顶点**连续**（1.09^(f-1) 第一次超过 cap 的那层就是起点），
 *   否则层 20→21 会出现「越深越不疼」的倒挂。
 *
 * 判据（BALANCE v4 §16.9 + lead m01363 分档）：入伤/波 ≤ 层1~2 30%、层3~8 25%、层9+ 20%；死亡 **硬=典型装 ≤1/30 波**、**软=裸装 ≤3/30 波（仅记录）**；
 * 层 27 必须有击杀有掉落。清波时长只作参考（基准 = 每杀 4.29s × 波大小，v4 的 6 只 → 25.8s）。
 * 掉落 ≈4/min（法宝 1.6 + 通货 1.9 + 玉简 0.5）为参考值。
 *
 * 用法：
 *   node tools/validate-balance.mjs                       # 基线（全参数 1），层 1/9/18/27
 *   node tools/validate-balance.mjs --life-mul=4.2 --floors=13,18,27 --seeds=3
 *   node tools/validate-balance.mjs --atk-mul=0.5 --minutes=10 --json=tools/out.json
 *   node tools/validate-balance.mjs --armor-mul=2 --wave-size=18 --regen=0.4
 *   node tools/validate-balance.mjs --floors=21,24,27 --atk-cap-floor=15 --atk-cap-mul=3.2   # 层向攻伐封顶
 *   node tools/validate-balance.mjs --regen-mode=session                                  # 复现旧 bug 口径
 */
import { openSrc } from './vite-loader.mjs';

// ── 参数 ────────────────────────────────────────────────
function parseArgs(argv) {
  const out = {};
  for (const raw of argv.slice(2)) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(raw);
    if (!m) continue;
    out[m[1]] = m[2] === undefined ? 'true' : m[2];
  }
  return out;
}

const args = parseArgs(process.argv);
const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const int = (v, d) => Math.round(num(v, d));

const FLOORS = (args.floors ?? '1,9,18,27')
  .split(',')
  .map((s) => int(s, 0))
  .filter((n) => n > 0);
const MINUTES = num(args.minutes, 10);
const SEEDS = Math.max(1, int(args.seeds, 1));
const LIFE_MUL = num(args['life-mul'], 1);
const ATK_MUL = num(args['atk-mul'], 1);
const ARMOR_MUL = num(args['armor-mul'], 1);
const REGEN_OVERRIDE = args.regen === undefined ? null : num(args.regen, 0);
const ARMOR_FLOOR_BONUS = num(args['armor-floor-bonus'], 0);
const ATK_CAP_FLOOR = int(args['atk-cap-floor'], 0);
const ATK_CAP_MUL = num(args['atk-cap-mul'], 0);
// 镇守血量缩放（默认 1）：用于两点法反推 gross DPS / 自回抽水（BOSS_REGEN_RATIO 是 src 常量，跑时改不了）
const BOSS_HP_SCALE = num(args['boss-hp-mul'], 1);
// 装备口径（D24）：
//   bare    = 裸装（默认）——EHP / 入伤 判据用它（生存下界，保守）
//   typical = 典型装备——按层 N 的灵蕴生成 10 槽装备再算面板；节奏（击杀/掉落/清波）判据用它
//             （真实玩家有词条+天赋+玉简，裸装把层 19+ 的「磨波」放大成假象 → BALANCE §18.6）
const GEAR = args.gear === 'typical' ? 'typical' : 'bare';
const GEAR_RARITY_BONUS = num(args['gear-rarity-bonus'], 3); // 典型装品阶权重倾斜（3 = 灵/宝为主）
// 波末回气结算方式：
//   once    = 与 src 现状一致（session.ts tickSession 末段：waveTimer >= WAVE_GAP 那一帧一次性结算，死亡重开不给）
//   session = 历史口径（旧 src 的 bug：gap 期间**每帧**加 REGEN×maxHp ⇒ 实际=满血），只用于对比
const REGEN_MODE = args['regen-mode'] === 'session' ? 'session' : 'once';
const WAVE_SIZE_OVERRIDE = args['wave-size'] === undefined ? null : int(args['wave-size'], 0);
const JSON_OUT = args.json ?? null;
const DT = 1 / 60;
const BASE_SEED = 20261021;

// 判据（v4 §16.9 + lead m01363 分档口径）：
//   1. 入伤/波 ÷ 进入气血：层 1~2 ≤30%（新手紧张感）、层 3~8 ≤25%、层 9+ ≤20%（裸装档）
//   2. 死亡分两档（lead m01363，2026-10-22）：
//      · 典型装备档 ≤1 次/30 波 → **硬判据**（真实玩家口径，决定通过/不通过）
//      · 裸装档     ≤3 次/30 波 → **软判据/仅记录**（EHP 下界；裸装打到层 27 本来就该打不动，
//        超标只说明「纯裸装到不了该层」，不算游戏问题，不参与综合判定）
//   3. 名义 TTK 7.2s ±10%（静态算，不需要模拟）
//   4. 层 27 必须有击杀有掉落
// 清波时长不再作为硬判据：v4 定 WAVE_SIZE=6，BALANCE v2 的 77.4s 是「18 只/波」的产物，
// 换算基准 = 每杀 4.29s × 波大小（6 只 → 25.8s），可用 --target-wave 覆盖。
const SECONDS_PER_KILL = 4.29; // BALANCE v2 §3 实测：每杀 60/13.98
const TARGET_DEATHS_PER_30_WAVES_TYPICAL = 1; // 硬判据（典型装档）
const TARGET_DEATHS_PER_30_WAVES_BARE = 3; // 软判据（裸装下界，仅记录）
const TARGET_DMG_RATIO_BY_FLOOR = (floor) => (floor <= 2 ? 0.3 : floor <= 8 ? 0.25 : 0.2);
const TARGET_DROPS_PER_MIN = 4;
// BALANCE v2 表 B：层 1 目标 13.95 击杀/分；lead m01049 要求「掉出 13±20% 就报」
const TARGET_KILLS_PER_MIN = 13.95;
const KILL_TOLERANCE = 0.2;

// ── 主流程 ──────────────────────────────────────────────
const { load, close } = await openSrc();
try {
  const battleMod = await load('src/core/battle.ts');
  const sessionMod = await load('src/core/session.ts');
  const charMod = await load('src/core/character.ts');
  const progMod = await load('src/core/progression.ts');
  const monsters = await load('src/data/monsters.ts');
  const dropMod = await load('src/core/drop.ts');
  const { Rng } = await load('src/core/rng.ts');
  const { AFFIXES } = await load('src/data/affixes.ts');
  const { ITEM_BASES } = await load('src/data/bases.ts');
  const lootMod = await load('src/core/loot.ts');
  const { SLOT_IDS, SLOT_ID_TO_KIND } = await load('src/data/slots.ts');
  const TABLES = { bases: ITEM_BASES, affixes: AFFIXES };

  const WAVE_SIZE = WAVE_SIZE_OVERRIDE ?? sessionMod.WAVE_SIZE;
  const TARGET_WAVE_SECONDS = args['target-wave'] === undefined
    ? SECONDS_PER_KILL * WAVE_SIZE
    : num(args['target-wave'], SECONDS_PER_KILL * WAVE_SIZE);
  const WAVE_GAP = sessionMod.WAVE_GAP;
  const BOSS_EVERY = sessionMod.BOSS_EVERY;
  const REGEN = REGEN_OVERRIDE ?? sessionMod.WAVE_END_REGEN;
  const BASE_WAVE_SIZE = sessionMod.WAVE_SIZE;

  const THEORETICAL_HP_MUL = 1.1534 ** 27; // BALANCE 表 G：层 27 / 层 1 的怪血倍数

  const f = (n, d = 2) => (Number.isFinite(n) ? Number(n.toFixed(d)) : '—');
  const pct = (ratio) => `${(ratio * 100).toFixed(1)}%`;

  /** 层 N 的典型面板台阶（同 diag-floor / diag-boss） */
  function charAtFloor(floor) {
    const realm = Math.min(9, Math.ceil(floor / 3));
    const step = Math.min(80, (realm - 1) * 9 + 4);
    let ch = charMod.createCharacter('yujian');
    while (ch.step < step) ch = charMod.gainXp(ch, progMod.xpForStep(ch.step));
    return ch;
  }

  /**
   * 典型装备（D24）：按层 N 的灵蕴给 10 个法术位各生成一件法宝。
   * 口径说明：这是「已经在该层刷了一阵」的玩家会穿的东西，不是最优解；
   * 品阶权重用 `--gear-rarity-bonus` 倾斜（默认 3 = 灵/宝为主、少量仙器），
   * 词条由 loot.rollLoot 走真实灵纹池，所以 life/damage/crit 等词条都会出现。
   */
  function equipTypical(ch, floor, gearRng) {
    const ilvl = Math.max(1, Math.floor(dropMod.ilvlForFloor(floor)));
    const equipment = { ...ch.equipment };
    const picked = [];
    for (const slot of SLOT_IDS) {
      const res = lootMod.rollLoot(gearRng, ITEM_BASES, AFFIXES, {
        ilvl,
        slot: SLOT_ID_TO_KIND[slot],
        rarityBonus: GEAR_RARITY_BONUS,
      });
      if (res?.item) {
        equipment[slot] = res.item;
        picked.push(res.item);
      }
    }
    return { ch: { ...ch, equipment }, items: picked, ilvl };
  }

  function runFloor(floor, seed, gear = 'bare') {
    let ch = charAtFloor(floor);
    let gearInfo = null;
    if (gear === 'typical') {
      const gearRng = new Rng(seed * 31 + floor * 17 + 991);
      const equipped = equipTypical(ch, floor, gearRng);
      ch = equipped.ch;
      gearInfo = { ilvl: equipped.ilvl, count: equipped.items.length };
    }
    const rng = new Rng(seed * 7919 + floor * 104729);
    const battle = battleMod.createBattle(battleMod.playerBattleFromCharacter(ch), ch.turbid, ch);

    /** 把参数乘数落到玩家面板上：血按比例保留（不白送满血），护甲重算 */
    function applyPanelScale(keepRatio) {
      const p = battle.player;
      const base = battleMod.playerBattleFromCharacter(ch);
      if (LIFE_MUL !== 1) {
        const ratio = keepRatio ? Math.max(1, p.hp) / Math.max(1, p.maxHp) : 1;
        p.maxHp = Math.max(1, Math.round(base.maxHp * LIFE_MUL));
        p.hp = Math.min(p.maxHp, Math.max(1, ratio * p.maxHp));
      }
      if (ARMOR_MUL !== 1 || ARMOR_FLOOR_BONUS !== 0) {
        const floorBonus = 1 + ARMOR_FLOOR_BONUS * (floor - 1);
        p.armor = base.armor * ARMOR_MUL * floorBonus;
      }
    }

    /** 突破/换装后同步面板（同 session.syncBattleFromCharacter，保留血量与浊气） */
    function syncPanel() {
      const next = battleMod.playerBattleFromCharacter(ch);
      const cur = battle.player;
      next.hp = Math.min(next.maxHp, Math.max(1, cur.hp));
      next.shield = Math.min(next.maxHp * 0.3, cur.shield);
      next.x = cur.x;
      next.y = cur.y;
      battle.player = next;
      applyPanelScale(true);
    }

    applyPanelScale(false);

    const startStep = ch.step;
    const startMaxHp = battle.player.maxHp;
    const startArmor = battle.player.armor;

    let uid = 1;
    let waveNo = 0;
    let waveTimer = 0;
    let phase = 'spawn'; // spawn | fight | gap
    let attempts = 0;
    let clearedWaves = 0;
    let bossAttempts = 0;
    let deaths = 0;
    let kills = 0;
    let drops = 0;
    let takenWaves = 0; // 清完的波次累计入伤
    let clears = []; // 清波时长（只算真清完的普通波）
    let bossClears = [];
    let waveStartTime = 0;
    let waveStartTaken = 0;
    let waveSizeSpawned = 0;
    let waveIsBoss = false;
    let hpCapSum = 0; // ∫ maxHp dt：入伤/气血 的分母用时间平均面板，不是最后一帧
    let frameCount = 0;
    const deathLog = [];

    function spawnWave() {
      waveNo += 1;
      waveStartTime = battle.time;
      waveStartTaken = battle.damageTaken;
      attempts += 1;
      waveIsBoss = waveNo % BOSS_EVERY === 0;
      if (waveIsBoss) bossAttempts += 1;
      battle.monsters = [];
      if (waveIsBoss) {
        const def = monsters.bossOfTier(monsters.tierOfFloor(floor));
        if (def) {
          battle.monsters.push(
            battleMod.spawnMonster(def, floor, uid++, battleMod.BATTLE_W / 2 + 210, battleMod.BATTLE_H / 2, 'boss'),
          );
        }
      }
      if (battle.monsters.length === 0) {
        battle.monsters.push(
          ...battleMod.spawnRing(monsters.monstersOfTier(monsters.tierOfFloor(floor)), floor, WAVE_SIZE, rng, uid),
        );
        uid += WAVE_SIZE;
      }
      // 镇守血量缩放：只用于「两点法」反推玩家 gross DPS 与自回抽水速度（见 §v4.1 报告），
      // 因为 BOSS_REGEN_RATIO 是 src 常量、运行时改不了；缩放 maxHp 同时也等比缩放自回量。
      if (BOSS_HP_SCALE !== 1) {
        for (const m of battle.monsters) {
          if (m.rarity !== 'boss') continue;
          m.maxHp = Math.max(1, Math.round(m.maxHp * BOSS_HP_SCALE));
          m.hp = Math.min(m.maxHp, Math.max(1, Math.round(m.hp * BOSS_HP_SCALE)));
        }
      }
      waveSizeSpawned = battle.monsters.length;
      // 攻伐曲线封顶（B'）：层 ≥ ATK_CAP_FLOOR 时，层数曲线的 part 钉在 ATK_CAP_MUL
      if (ATK_CAP_FLOOR > 0 && ATK_CAP_MUL > 0 && floor >= ATK_CAP_FLOOR) {
        const scale = monsters.scaleOfFloor(floor).damage;
        const factor = Math.min(1, ATK_CAP_MUL / scale);
        if (factor < 1) for (const m of battle.monsters) m.damage = m.damage * factor;
      }
      if (ATK_MUL !== 1) {
        for (const m of battle.monsters) m.damage = m.damage * ATK_MUL;
      }
      phase = 'fight';
    }

    const steps = Math.round((MINUTES * 60) / DT);
    for (let i = 0; i < steps; i++) {
      if (phase === 'spawn') {
        spawnWave();
        continue;
      }
      if (phase === 'gap') {
        // 与 src 现状一致时（once）：gap 期间不回血，等 gap 走满、开新波那一帧一次性结算。
        // session 口径（历史 bug）保留：gap 内每帧结算（0.9s×54 帧 ⇒ 等价每波满血）。
        if (REGEN_MODE === 'session') {
          const p = battle.player;
          p.hp = Math.min(p.maxHp, p.hp + p.maxHp * REGEN);
        }
        waveTimer += DT;
        if (waveTimer >= WAVE_GAP) {
          if (REGEN_MODE === 'once') {
            const p = battle.player;
            p.hp = Math.min(p.maxHp, p.hp + p.maxHp * REGEN);
          }
          waveTimer = 0;
          spawnWave();
        }
        continue;
      }

      battleMod.tickBattle(battle, DT, rng);
      hpCapSum += battle.player.maxHp;
      frameCount += 1;

      // 消费事件（与 session.tickSession 的 2) 段等价，去掉 UI 浮字）
      let leveled = false;
      for (const e of battle.events) {
        if (e.kind === 'player-kill' && e.monster) {
          kills += 1;
          const item = dropMod.rollMonsterDrop(
            e.monster.defId,
            e.monster.tier,
            e.monster.rarity,
            rng,
            TABLES,
          );
          if (item) drops += 1;
          const before = ch.step;
          ch = charMod.gainXp(ch, e.monster.xp);
          if (ch.step > before) leveled = true;
        } else if (e.kind === 'player-died') {
          deaths += 1;
          deathLog.push({
            t: Number(battle.time.toFixed(1)),
            wave: waveNo,
            step: ch.step,
            maxHp: Math.round(battle.player.maxHp),
            monsters: battle.monsters.length,
            regen: REGEN,
          });
          // 死亡惩罚（session.ts:191-198）：掉当前台阶存量的 10%，不往下拉台阶
          const penalty = Math.floor(ch.xp * sessionMod.DEATH_XP_PENALTY);
          if (penalty > 0) ch = { ...ch, xp: ch.xp - penalty };
        }
      }
      if (leveled) syncPanel();

      // 死亡重开本波：清场、不推进进度、不给波末回气（同 session.ts:185-201）
      if (battle.deathCleanup) {
        battle.deathCleanup = false;
        battle.monsters = [];
        waveTimer = 0;
        spawnWave();
        continue;
      }

      // 真清完：进 gap（回气在 gap 阶段按 REGEN_MODE 结算）
      if (battleMod.isCleared(battle)) {
        const secs = battle.time - waveStartTime;
        if (waveIsBoss) bossClears.push(secs);
        else {
          clears.push(secs);
          takenWaves += battle.damageTaken - waveStartTaken;
        }
        clearedWaves += 1;
        phase = 'gap';
        waveTimer = 0;
      }
    }

    const p = battle.player;
    const avgMaxHp = frameCount > 0 ? hpCapSum / frameCount : p.maxHp;
    const avgClear = clears.length > 0 ? clears.reduce((a, b) => a + b, 0) / clears.length : NaN;
    const avgBossClear = bossClears.length > 0 ? bossClears.reduce((a, b) => a + b, 0) / bossClears.length : NaN;
    const dmgPerWave = clears.length > 0 ? takenWaves / clears.length : NaN;
    return {
      floor,
      seed,
      startStep,
      startMaxHp: Math.round(startMaxHp),
      startArmor: Math.round(startArmor),
      step: ch.step,
      maxHp: Math.round(p.maxHp),
      armor: Math.round(p.armor),
      avgMaxHp: Math.round(avgMaxHp),
      waves: attempts,
      cleared: clearedWaves,
      bossWaves: bossAttempts,
      waveSize: waveSizeSpawned,
      killPerMin: kills / MINUTES,
      dropPerMin: drops / MINUTES,
      kills,
      drops,
      deaths,
      deathPerMin: deaths / MINUTES,
      takenTotal: battle.damageTaken,
      dmgPerWave,
      // 入伤/气血：分母用 ∫maxHp/时间（面板会随突破涨，用终帧会低估早期脆弱）
      dmgRatio: Number.isFinite(dmgPerWave) ? dmgPerWave / Math.max(1, avgMaxHp) : NaN,
      avgClear,
      avgBossClear,
      deathLog,
      gear,
      gearInfo,
      qual: Number.isFinite(avgClear) && Math.abs(avgClear - TARGET_WAVE_SECONDS) / TARGET_WAVE_SECONDS <= 0.2,
    };
  }

  const med = (arr) => {
    const xs = arr.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
    if (xs.length === 0) return NaN;
    const mid = Math.floor(xs.length / 2);
    return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
  };

  const medOf = (perSeed) => ({
    startStep: med(perSeed.map((r) => r.startStep)),
    startMaxHp: med(perSeed.map((r) => r.startMaxHp)),
    startArmor: med(perSeed.map((r) => r.startArmor)),
    step: med(perSeed.map((r) => r.step)),
    avgMaxHp: med(perSeed.map((r) => r.avgMaxHp)),
    maxHp: med(perSeed.map((r) => r.maxHp)),
    armor: med(perSeed.map((r) => r.armor)),
    waves: med(perSeed.map((r) => r.waves)),
    cleared: med(perSeed.map((r) => r.cleared)),
    killPerMin: med(perSeed.map((r) => r.killPerMin)),
    dropPerMin: med(perSeed.map((r) => r.dropPerMin)),
    dmgPerWave: med(perSeed.map((r) => r.dmgPerWave)),
    dmgRatio: med(perSeed.map((r) => r.dmgRatio)),
    avgClear: med(perSeed.map((r) => r.avgClear)),
    avgBossClear: med(perSeed.map((r) => r.avgBossClear)),
    deaths: med(perSeed.map((r) => r.deaths)),
  });

  const rows = [];
  for (const floor of FLOORS) {
    const perSeed = [];
    const typPerSeed = [];
    for (let s = 0; s < SEEDS; s++) {
      const seed = BASE_SEED + s * 1013;
      perSeed.push(runFloor(floor, seed, 'bare'));
      // D24：典型装备档与裸装档各跑一遍 —— 生存(EHP)看裸装、节奏(击杀/掉落/清波)看典型装
      if (GEAR === 'typical') typPerSeed.push(runFloor(floor, seed, 'typical'));
    }
    rows.push({
      floor,
      perSeed,
      med: medOf(perSeed),
      deathsRange: perSeed.map((r) => r.deaths),
      typPerSeed,
      typMed: typPerSeed.length > 0 ? medOf(typPerSeed) : null,
      typDeathsRange: typPerSeed.map((r) => r.deaths),
      gearIlvl: typPerSeed[0]?.gearInfo?.ilvl ?? null,
    });
  }

  /** 节奏列口径：typical 档优先，没有就退回裸装 */
  const rhythmOf = (r) => r.typMed ?? r.med;
  const panelOf = (r) => r.typMed ?? r.med;
  const gearNote = GEAR === 'typical'
    ? `典型装备档（每层 ilvl=${rows.map((r) => r.gearIlvl).filter((x) => x !== null).join('/')} 的 10 槽法宝，品阶倾斜 ×${GEAR_RARITY_BONUS}）`
    : '裸装典型面板（层 N → 境 ceil(N/3) → 台阶 (境-1)*9+4）';

  // ── 输出 ────────────────────────────────────────────
  const label = [
    `life×${f(LIFE_MUL, 2)}`,
    `atk×${f(ATK_MUL, 2)}`,
    `armor×${f(ARMOR_MUL, 2)}`,
    `wave=${WAVE_SIZE}`,
    `regen=${f(REGEN, 2)}/${REGEN_MODE}`,
    `gear=${GEAR}`,
  ].join(' · ');
  console.log(`# 方案验证 sim · ${label}`);
  console.log(`# ${MINUTES} 分钟/层 · ${SEEDS} 种子 · ${gearNote} · dt=${f(DT, 4)}s`);
  if (GEAR === 'typical')
    console.log('# 口径：死亡/入伤 取裸装（EHP 下界，保守）；击杀/掉落/清波 取典型装备档（真实节奏）');
  if (WAVE_SIZE !== BASE_WAVE_SIZE) console.log(`# 注意：波次规模被覆盖为 ${WAVE_SIZE}（src 里 session.WAVE_SIZE=${BASE_WAVE_SIZE}）`);
  console.log('');

  console.log('## 表 1 · 主表（多种子中位数）');
  console.log('');
  if (GEAR === 'typical')
    console.log('> 口径：台阶/面板/波数/清波/镇守/击杀/掉落 = **典型装档**；入伤 = **裸装档**（EHP 下界）；死亡分两列（典型=硬判据 ≤1/30波、裸装=软判据 ≤3/30波）。\n');
  console.log(
    '| 层 | 台阶(进→终) | 面板血/护体(进→终·均) | 怪血倍数 | 波数(清/开) | 清波时长 | 镇守波时 | 击杀/min | 掉落/min | 入伤/波(裸) | 入伤/气血(裸) | 死亡(典型·硬) | 死亡(裸·软) | 判定 |',
  );
  console.log(
    '|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|',
  );
  for (const r of rows) {
    const m = r.med; // EHP / 入伤 口径（裸装）
    const rhythm = rhythmOf(r); // 节奏口径（typical 优先）
    const panel = panelOf(r);
    const scale = monsters.scaleOfFloor(r.floor);
    const dev = (rhythm.avgClear - TARGET_WAVE_SECONDS) / TARGET_WAVE_SECONDS;
    const waveOk = Math.abs(dev) <= 0.2;
    const dmgTarget = TARGET_DMG_RATIO_BY_FLOOR(r.floor);
    const dmgOk = m.dmgRatio <= dmgTarget;
    const deathPer30 = (m.deaths / Math.max(1, m.waves)) * 30;
    // 硬判据：典型装档；只有跑裸装档（--gear=bare）时才退回裸装值
    const typM = r.typMed;
    const deathPer30Typ = typM ? (typM.deaths / Math.max(1, typM.waves)) * 30 : NaN;
    const deathHard = Number.isFinite(deathPer30Typ) ? deathPer30Typ : deathPer30;
    const deathOk = deathHard <= TARGET_DEATHS_PER_30_WAVES_TYPICAL;
    const deathSoftOk = deathPer30 <= TARGET_DEATHS_PER_30_WAVES_BARE;
    const killOk = Math.abs(rhythm.killPerMin - TARGET_KILLS_PER_MIN) <= TARGET_KILLS_PER_MIN * KILL_TOLERANCE;
    console.log(
      `| ${r.floor} | ${Math.round(panel.startStep)}→${Math.round(panel.step)} | ` +
        `${Math.round(panel.startMaxHp)}/${Math.round(panel.startArmor)}→${Math.round(panel.maxHp)}/${Math.round(panel.armor)} ` +
        `(均 ${Math.round(panel.avgMaxHp)}) | ${f(scale.hp, 2)}× | ` +
        `${Math.round(rhythm.cleared)}/${Math.round(rhythm.waves)} | ` +
        `${Number.isFinite(rhythm.avgClear) ? `${f(rhythm.avgClear, 1)}s (${dev > 0 ? '+' : ''}${f(dev * 100, 1)}%)` : '未清完'} | ` +
        `${f(rhythm.avgBossClear, 1)}s | ${f(rhythm.killPerMin, 2)} | ${f(rhythm.dropPerMin, 2)} | ${f(m.dmgPerWave, 0)} | ` +
        `${pct(m.dmgRatio)} | ` +
        `${Number.isFinite(deathPer30Typ) ? f(deathPer30Typ, 1) : '—'} | ${Math.round(m.deaths)} (${f(deathPer30, 1)}) | ` +
        `${waveOk ? '波时✓' : '波时(参考)✗'} ${dmgOk ? '入伤✓' : `**入伤✗(>${(dmgTarget * 100).toFixed(0)}%)**`} ` +
        `${deathOk ? '死亡(典型)✓' : '**死亡(典型)✗**'} ${deathSoftOk ? '死亡(裸)✓软' : '死亡(裸)⚠软'} ` +
        `${killOk ? '击杀✓' : `**击杀✗(目标${TARGET_KILLS_PER_MIN}±${Math.round(KILL_TOLERANCE * 100)}%)**`} |`,
    );
  }

  console.log('');
  console.log('## 表 2 · 逐种子明细（看死亡离散度）');
  console.log('');
  console.log('| 层 | 档 | 种子 | 台阶(进→终) | 平均血/护体 | 清/开波 | 清波时长 | 击杀/min | 掉落/min | 入伤/波 | 入伤/气血 | 死亡 |');
  console.log('|---:|---|---|---|---|---|---:|---:|---:|---:|---:|---:|');
  for (const r of rows) {
    for (const s of r.perSeed) {
      console.log(
        `| ${r.floor} | 裸装 | ${s.seed} | ${s.startStep}→${s.step} | ${s.avgMaxHp}/${s.armor} | ${s.cleared}/${s.waves} | ${f(s.avgClear, 1)}s | ` +
          `${f(s.killPerMin, 2)} | ${f(s.dropPerMin, 2)} | ${f(s.dmgPerWave, 0)} | ${pct(s.dmgRatio)} | ${s.deaths} |`,
      );
    }
    for (const s of r.typPerSeed) {
      console.log(
        `| ${r.floor} | 典型装 | ${s.seed} | ${s.startStep}→${s.step} | ${s.avgMaxHp}/${s.armor} | ${s.cleared}/${s.waves} | ${f(s.avgClear, 1)}s | ` +
          `${f(s.killPerMin, 2)} | ${f(s.dropPerMin, 2)} | ${f(s.dmgPerWave, 0)} | ${pct(s.dmgRatio)} | ${s.deaths} |`,
      );
    }
  }

  console.log('');
  console.log('## 表 3 · 判定汇总（BALANCE v4 §16.9 验收口径）');
  console.log('');
  if (GEAR === 'typical') console.log('口径：入伤 = 裸装（EHP 下界）；击杀/掉落/清波 = 典型装备档；死亡分硬(典型)/软(裸)两档。');
  console.log('');
  console.log(
    `| 层 | 清波(参考 ${f(TARGET_WAVE_SECONDS, 1)}s±20%) | 入伤 ≤(30/25/20)% | 死亡/30波(典型) ≤${TARGET_DEATHS_PER_30_WAVES_TYPICAL} **硬** | 死亡/30波(裸) ≤${TARGET_DEATHS_PER_30_WAVES_BARE} 软 | 击杀 ${TARGET_KILLS_PER_MIN}±${Math.round(KILL_TOLERANCE * 100)}%/min | 掉落 ≥${TARGET_DROPS_PER_MIN / 2}/min | 达标所需 life× | 达标所需 atk× | 综合 |`,
  );
  console.log('|---:|---|---|---|---|---|---|---:|---:|---|');
  for (const r of rows) {
    const m = r.med;
    const rhythm = rhythmOf(r);
    const dev = (rhythm.avgClear - TARGET_WAVE_SECONDS) / TARGET_WAVE_SECONDS;
    const okWave = Number.isFinite(dev) && Math.abs(dev) <= 0.2;
    const dmgTarget = TARGET_DMG_RATIO_BY_FLOOR(r.floor);
    const okDmg = m.dmgRatio <= dmgTarget;
    const deathPer30 = (m.deaths / Math.max(1, m.waves)) * 30;
    const typM = r.typMed;
    const deathPer30Typ = typM ? (typM.deaths / Math.max(1, typM.waves)) * 30 : NaN;
    const okDeathTyp = Number.isFinite(deathPer30Typ)
      ? deathPer30Typ <= TARGET_DEATHS_PER_30_WAVES_TYPICAL
      : deathPer30 <= TARGET_DEATHS_PER_30_WAVES_TYPICAL;
    const okDeathBare = deathPer30 <= TARGET_DEATHS_PER_30_WAVES_BARE;
    const okKill = Math.abs(rhythm.killPerMin - TARGET_KILLS_PER_MIN) <= TARGET_KILLS_PER_MIN * KILL_TOLERANCE;
    const okDrop = rhythm.dropPerMin >= TARGET_DROPS_PER_MIN * 0.5;
    // 综合判定只看硬判据（入伤 + 典型装死亡 + 击杀）；裸装死亡只记录
    const pass = okDmg && okDeathTyp && okKill;
    const needLife = Number.isFinite(m.dmgRatio) ? m.dmgRatio / dmgTarget : NaN;
    const needAtk = Number.isFinite(m.dmgRatio) && m.dmgRatio > 0 ? dmgTarget / m.dmgRatio : NaN;
    console.log(
      `| ${r.floor} | ${Number.isFinite(rhythm.avgClear) ? (okWave ? '✓' : '✗') : '✗'} | ${okDmg ? '✓' : '✗'} | ` +
        `${okDeathTyp ? '✓' : '✗'} (${Number.isFinite(deathPer30Typ) ? f(deathPer30Typ, 1) : '—'}) | ${okDeathBare ? '✓' : '⚠'} (${f(deathPer30, 1)}) | ` +
        `${okKill ? '✓' : '✗'} (${f(rhythm.killPerMin, 1)}) | ${okDrop ? '✓' : '✗'} | ` +
        `${f(needLife, 2)}× | ${f(needAtk, 2)}× | ${pass ? '**通过**' : '不通过'} |`,
    );
  }

  console.log('');
  console.log('## 参照');
  console.log('');
  console.log(`- 怪血曲线倍数（层 27/层 1）理论值 = 1.1534^27 = ${f(THEORETICAL_HP_MUL, 1)}×`);
  console.log(
    `- 判据（BALANCE v4 §16.9 + lead m01363 分档）：入伤/波 ≤ 层1~2 30%、层3~8 25%、层9+ 20%；死亡 **硬=典型装 ≤${TARGET_DEATHS_PER_30_WAVES_TYPICAL} 次/30 波**、**软=裸装 ≤${TARGET_DEATHS_PER_30_WAVES_BARE} 次/30 波（仅记录，不参与综合）**；层 27 必须有击杀有掉落`,
  );
  console.log(`- 清波时长只作参考（v4 定 WAVE_SIZE=${WAVE_SIZE}，基准 = 每杀 ${SECONDS_PER_KILL}s × 波大小 = ${f(TARGET_WAVE_SECONDS, 1)}s；可用 --target-wave 覆盖）`);
  console.log(`- 波末回气 = ${f(REGEN, 2)} × 最大气血 · 结算方式 = ${REGEN_MODE}`);
  console.log('  · once 口径（= src 现状，session.ts tickSession 末段 `waveTimer >= WAVE_GAP` 分支）：开新波那一帧一次性结算，死亡重开不给');
  console.log('  · session 口径（旧 src 的 bug，仅作对比）：gap 0.9s 内每帧结算 ⇒ 等价「每波满血」');
  if (ARMOR_FLOOR_BONUS !== 0) console.log(`- 护甲层向加成 = ×(1 + ${ARMOR_FLOOR_BONUS}×(层-1))`);
  if (ATK_CAP_FLOOR > 0 && ATK_CAP_MUL > 0)
    console.log(`- 怪攻封顶：层 ≥ ${ATK_CAP_FLOOR} 时层数曲线钉在 ${ATK_CAP_MUL}×（层 ${ATK_CAP_FLOOR} 原本 = ${f(Math.pow(1.09, ATK_CAP_FLOOR - 1), 2)}×）`);
  console.log('- 入伤/气血 的分母用 ∫maxHp dt / 时长（时间平均面板），不用终帧血量：血条会被回气拉满、面板会随突破涨');
  console.log('- 本工具自己走 tickBattle + spawnRing，不走 session.startWave，所以 wave-size/regen 才能参数化；');
  console.log('  掉落仍走 drop.rollMonsterDrop（真掉率），修为仍走 character.gainXp（会突破并同步面板）。');

  if (process.env.VB_DEBUG) {
    console.log('');
    console.log('## DEBUG · 死亡时刻（VB_DEBUG=1）');
    for (const r of rows) {
      for (const s of r.perSeed) {
        console.log(`层 ${r.floor} 种子 ${s.seed}:`, s.deathLog.map((x) => `t=${x.t}s w${x.wave} step${x.step} hp${x.maxHp}`).join(' | '));
      }
    }
  }

  if (JSON_OUT) {
    const fs = await import('node:fs');
    const payload = {
      generatedAt: new Date().toISOString(),
      params: {
        floors: FLOORS,
        minutes: MINUTES,
        seeds: SEEDS,
        lifeMul: LIFE_MUL,
        atkMul: ATK_MUL,
        armorMul: ARMOR_MUL,
        armorFloorBonus: ARMOR_FLOOR_BONUS,
        atkCapFloor: ATK_CAP_FLOOR,
        atkCapMul: ATK_CAP_MUL,
        waveSize: WAVE_SIZE,
        regen: REGEN,
        regenMode: REGEN_MODE,
        gear: GEAR,
        gearRarityBonus: GEAR_RARITY_BONUS,
        dt: DT,
      },
      targets: {
        waveSeconds: TARGET_WAVE_SECONDS,
        dmgRatioByFloor: 'layer<=2:0.30, 3~8:0.25, >=9:0.20',
        deathsPer30WavesTypicalHard: TARGET_DEATHS_PER_30_WAVES_TYPICAL,
        deathsPer30WavesBareSoft: TARGET_DEATHS_PER_30_WAVES_BARE,
        dropsPerMin: TARGET_DROPS_PER_MIN,
        killsPerMin: TARGET_KILLS_PER_MIN,
      },
      floors: rows.map((r) => ({
        floor: r.floor,
        gearIlvl: r.gearIlvl,
        medianBare: r.med,
        perSeedBare: r.perSeed,
        medianTypical: r.typMed,
        perSeedTypical: r.typPerSeed,
      })),
    };
    fs.writeFileSync(JSON_OUT, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`\nJSON 已写入 ${JSON_OUT}`);
  }
} finally {
  await close();
}
