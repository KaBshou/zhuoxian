// D105 生存性度量：给战斗态加四个**运行时**计数（不入档、不改玩法），并让模拟器支持
// 「首次到达指定层时开一个 N 分钟观测窗」。
//
// 为什么必须加产物代码里的计数器（而不是在模拟器里从外面推）：
//   `damageTaken` 是累计量、可以外面差分；但「护盾吸收了多少」与「护盾回充触发了几次」
//   只发生在 `damagePlayer` 与回充分支内部 —— 外面拿 `shield` 快照差分会被「同帧吸收+回充」抵消，
//   拿到的是净变化而不是事件。`maxHit` 同理（单次最大入伤是「离死亡多远」的代理）。
//
// 纪律：
//   - 四个字段全部标 `运行时态`，**不许进 save.ts**；
//   - `incomingMul` 默认 1，只给度量脚本扫 atk-mul 用（K 值），玩法路径永远不设它；
//   - 一行写全：漏一处就是「有字段没读者」那一族的第 7 例。
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const ROOT = 'F:\\dsh-work\\zhuoxian\\';

function patch(rel, edits) {
  const path = ROOT + rel;
  const raw = readFileSync(path, 'utf8');
  const crlf = raw.includes('\r\n');
  let text = raw.replace(/\r\n/g, '\n');
  const before = text.length;
  // 幂等：如果所有改动都已经在文件里，直接跳过（这个补丁要能重跑，不然改一处失败就得手工回滚）
  if (edits.every(([, , newText]) => text.includes(newText))) {
    console.log(`SKIP ${rel}（已是目标状态）`);
    return;
  }
  for (const [tag, oldText, newText] of edits) {
    const hits = text.split(oldText).length - 1;
    if (hits !== 1) throw new Error(`${rel} [${tag}] 锚点命中 ${hits} 次（要求恰好 1 次）`);
    text = text.replace(oldText, newText);
  }
  const delta = text.length - before;
  if (delta < 200 || delta > 6000) throw new Error(`${rel} 改动量异常：${delta}`);
  mkdirSync(ROOT + 'tools/_bak', { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const bak = `${ROOT}tools/_bak/${rel.replace(/[\\/]/g, '_')}.${stamp}.bak`;
  if (existsSync(path)) copyFileSync(path, bak);
  writeFileSync(path, crlf ? text.replace(/\n/g, '\r\n') : text, 'utf8');
  console.log(`OK ${rel} ${before} → ${text.length}（+${delta}），快照 ${bak}`);
}

patch('src/core/battle.ts', [
  [
    'state-fields',
    `  damageTaken: number;\n`,
    `  damageTaken: number;\n` +
      `  /**\n` +
      `   * 累计被护盾吸收的伤害（D105 护盾活性度量）。\n` +
      `   * 为什么不能从外面拿 \`shield\` 快照差分：同一帧里可能既吸收又回充，差分拿到的是净变化，\n` +
      `   * 而「吸收占比」要的是事件量。运行时态，不入档。\n` +
      `   */\n` +
      `  shieldAbsorbed: number;\n` +
      `  /** 护盾回充的**段数**（不是帧数）：从「被打断」到「回满/再次被打断」算一段。D105 的专属验收。 */\n` +
      `  shieldRecharges: number;\n` +
      `  /** 当前是否处在回充段内（内部标记，配合 shieldRecharges 用；不入档） */\n` +
      `  shieldRecharging?: boolean;\n` +
      `  /** 单次最大入伤（D105 的「致死距离」代理：lifeMax / maxHit = 还能挨几下最重的） */\n` +
      `  maxHit: number;\n` +
      `  /** 度量用入伤倍率（默认 1）。只有 tools/measure-survival.mjs 会设它扫 atk-mul，玩法路径永不设置。 */\n` +
      `  incomingMul?: number;\n`,
  ],
  [
    'state-init',
    `    damageTaken: 0,\n`,
    `    damageTaken: 0,\n    shieldAbsorbed: 0,\n    shieldRecharges: 0,\n    maxHit: 0,\n`,
  ],
  [
    'absorb-accumulate',
    `  const absorbed = Math.min(p.shield, res.amount);\n  p.shield -= absorbed;\n`,
    `  const absorbed = Math.min(p.shield, res.amount);\n  p.shield -= absorbed;\n  if (absorbed > 0) state.shieldAbsorbed += absorbed;\n`,
  ],
  [
    'max-hit',
    `  state.damageTaken += dealt;\n`,
    `  state.damageTaken += dealt;\n  if (res.amount > state.maxHit) state.maxHit = res.amount;\n`,
  ],
  [
    'incoming-mul',
    `    externalMore: turbidTakenMultiplier(state.turbid),\n`,
    `    // 度量用倍率（D105 的 K 值扫描）：默认 1，玩法路径不设 ⇒ 与线上完全一致。\n    externalMore: turbidTakenMultiplier(state.turbid) * (state.incomingMul ?? 1),\n`,
  ],
  [
    'recharge-episode',
    `    const rate = shieldRechargeRate(p.shieldMax, p.maxHp);\n    p.shield = Math.min(p.shieldMax, p.shield + rate * d);\n`,
    `    const rate = shieldRechargeRate(p.shieldMax, p.maxHp);\n    if (!state.shieldRecharging) {\n      state.shieldRecharging = true;\n      state.shieldRecharges += 1;\n    }\n    p.shield = Math.min(p.shieldMax, p.shield + rate * d);\n`,
  ],
  [
    'recharge-break',
    `  p.shieldIdle = 0;\n  const dealt = res.amount - absorbed;\n`,
    `  p.shieldIdle = 0;\n  state.shieldRecharging = false;\n  const dealt = res.amount - absorbed;\n`,
  ],
]);

patch('tools/session-runner.mjs', [
  [
    'survival-decl',
    `  let prevDeaths = 0;\n`,
    `  let prevDeaths = 0;\n\n` +
      `  // ── D105 生存性观测窗 ──\n` +
      `  // 为什么是「首次到达那一层的 N 分钟」而不是「在那一层随便挑一段时间」：\n` +
      `  //   「典型装备」的唯一定义是**玩家第一次走到这里时的装备**；事后回到层 27 时玩家已经\n` +
      `  //   是满级装备，量出来的 μ 会小一个量级，那种数只能证明「后期很安全」，谁都早知道。\n` +
      `  // 为什么按时间积分不按波平均：按波平均会漏掉死亡波（`+"`floorDeaths`"+` 只记次数，`+"`takenWaves`"+` 只统计清完的非镇守波）。\n` +
      `  const SURVIVAL_WINDOWS = Array.isArray(opts.survivalWindows) ? opts.survivalWindows.filter((f) => Number.isFinite(f)) : [];\n` +
      `  const SURVIVAL_MINUTES = Number.isFinite(opts.survivalMinutes) ? opts.survivalMinutes : 3;\n` +
      `  const INCOMING_MUL = Number.isFinite(opts.incomingMul) ? opts.incomingMul : 1;\n` +
      `  const survivalSamples = [];\n` +
      `  const survivalOpen = new Map();\n` +
      `  let prevTakenForWindow = 0;\n`,
  ],
  [
    'survival-tick',
    `    sessionMod.tickSession(s, dt);\n    t += dt;\n`,
    `    sessionMod.tickSession(s, dt);\n    t += dt;\n\n` +
      `    // D105：观测窗（首次到达 → 连续 SURVIVAL_MINUTES 分钟）\n` +
      `    if (SURVIVAL_WINDOWS.length) {\n` +
      `      const b = s.battle;\n` +
      `      if (b) {\n` +
      `        const taken = b.damageTaken;\n` +
      `        const dTaken = Math.max(0, taken - prevTakenForWindow);\n` +
      `        for (const floor of SURVIVAL_WINDOWS) {\n` +
      `          let w = survivalOpen.get(floor);\n` +
      `          if (!w && s.floor === floor && !survivalSamples.some((x) => x.floor === floor)) {\n` +
      `            w = { floor, startT: t, minutes: 0, taken: 0, lifeSeconds: 0, hits: 0, maxHit: 0, shieldAbsorbed: 0, shieldRecharges: 0, deaths: 0, waves: 0 };\n` +
      `            survivalOpen.set(floor, w);\n` +
      `            // 开窗那一帧把累积量对齐，避免把「到这一层之前挨的打」算进来\n` +
      `            w.baselineTaken = taken;\n` +
      `            w.baselineAbsorbed = b.shieldAbsorbed ?? 0;\n` +
      `            w.baselineRecharges = b.shieldRecharges ?? 0;\n` +
      `            w.baselineDeaths = s.floorDeaths;\n` +
      `            w.baselineWave = s.wave;\n` +
      `          }\n` +
      `          if (w && s.floor === floor) {\n` +
      `            w.minutes += dt / 60;\n` +
      `            w.lifeSeconds += b.player.maxHp * dt;\n` +
      `            w.taken = Math.max(0, taken - w.baselineTaken);\n` +
      `            w.shieldAbsorbed = Math.max(0, (b.shieldAbsorbed ?? 0) - w.baselineAbsorbed);\n` +
      `            w.shieldRecharges = Math.max(0, (b.shieldRecharges ?? 0) - w.baselineRecharges);\n` +
      `            w.deaths = Math.max(0, s.floorDeaths - w.baselineDeaths);\n` +
      `            w.waves = Math.max(0, s.wave - w.baselineWave);\n` +
      `            if (b.maxHit > w.maxHit) w.maxHit = b.maxHit;\n` +
      `            if (w.minutes >= SURVIVAL_MINUTES) {\n` +
      `              survivalSamples.push({\n` +
      `                floor, minutes: w.minutes, taken: w.taken, lifeMax: b.player.maxHp,\n` +
      `                muPctPerSec: w.lifeSeconds > 0 ? (w.taken / w.lifeSeconds) * 100 : NaN,\n` +
      `                waves: w.waves, deaths: w.deaths, maxHit: w.maxHit,\n` +
      `                hitsPerWave: w.waves > 0 ? w.taken / w.waves : NaN,\n` +
      `                shieldAbsorbed: w.shieldAbsorbed,\n` +
      `                shieldShare: w.taken + w.shieldAbsorbed > 0 ? w.shieldAbsorbed / (w.taken + w.shieldAbsorbed) : NaN,\n` +
      `                shieldRecharges: w.shieldRecharges,\n` +
      `                shieldPerWave: w.waves > 0 ? w.shieldRecharges / w.waves : NaN,\n` +
      `                hitsToDie: w.maxHit > 0 ? b.player.maxHp / w.maxHit : NaN,\n` +
      `              });\n` +
      `              survivalOpen.delete(floor);\n` +
      `            }\n` +
      `          }\n` +
      `        }\n` +
      `        prevTakenForWindow = taken;\n` +
      `      }\n` +
      `    }\n`,
  ],
  [
    'survival-init-mul',
    `  sessionMod.startWave(s);\n`,
    `  sessionMod.startWave(s);\n` +
      `  // D105：扫描入伤倍率（默认 1 = 线上）。只影响玩家受到的伤害，不改怪的血/攻。\n` +
      `  if (INCOMING_MUL !== 1) {\n` +
      `    for (const st of [s.battle]) if (st) st.incomingMul = INCOMING_MUL;\n` +
      `  }\n`,
  ],
  [
    'survival-return',
    `    farmSnaps,\n`,
    `    farmSnaps,\n    survival: survivalSamples,\n`,
  ],
]);
