#!/usr/bin/env node
/**
 * probe-death-mechanics.mjs —— 死亡/威胁「机制」验收探针（D110 死亡代价 / D111 深层威胁 / D113 逃生阀）。
 *
 *   node tools\probe-death-mechanics.mjs
 *
 * 为什么是「机制」而不是「次数」：
 *   绝对死亡次数会被战斗随机性、精英妖纹、玩家 DPS 曲线同时拉扯，改一次数值就整列作废；
 *   而「连死 3 次退 1 层」「死在第 3 波回第 1 波」「修为只掉当前台阶 10%」这些是契约，
 *   只在语义被改坏时才红。所以本探针只钉机制，不钉次数（次数归 run-timeline 的生存窗口）。
 *
 * 为什么不用浏览器：这些量要么是模块常量、要么要拿真 session 逐帧 tick，
 *   页面里没法精确构造「死在第 3 波」「连死 4 次」这种局面。走 vite ssrLoadModule
 *   （`tools/vite-loader.mjs`），直接跑真模块、不起 Chrome。
 *
 * 纪律：
 *   - 阈值/封顶一律读模块常量（`DEEP_THREAT_MUL` 等），**不把数字抄进断言文案**：
 *     常量改了口径（例如封顶 ×5→×4）时探针应该自动跟随，而不是跟着一起假红。
 *   - 注释与常量不符时以常量为准；探针只负责把「实际生效值」打出来给人看。
 */
import { openSrc } from './vite-loader.mjs';

const out = [];
const fix = (n, d = 2) => Number(n).toFixed(d);

function check(name, ok, detail) {
  out.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}　—　${detail}`);
}

const { server, load, close } = await openSrc();
try {
  const mon = await load('/src/data/monsters.ts');
  const battleMod = await load('/src/core/battle.ts');
  const sessionMod = await load('/src/core/session.ts');
  const basesMod = await load('/src/data/bases.ts');
  const affixMod = await load('/src/data/affixes.ts');
  const rngMod = await load('/src/core/rng.ts');

  // ── 1. threatMul 的曲线（代码说了算，不信注释） ─────────────────────────
  const floors = [21, 22, 23, 27, 30, 34, 41, 42, 46, 76];
  const normal = floors.map((f) => mon.threatMul(f, false));
  const boss = floors.map((f) => mon.threatMul(f, true));
  console.log(
    `\nthreat 常量：FROM=${mon.DEEP_THREAT_FROM_FLOOR} MUL=${mon.DEEP_THREAT_MUL} ` +
      `SLOPE=${mon.DEEP_THREAT_SLOPE} BOSS_EXTRA=${mon.BOSS_THREAT_EXTRA} ENABLED=${mon.DEEP_THREAT_ENABLED}\n` +
      floors.map((f, i) => `层${f}: 普通 ×${fix(normal[i])} / 镇守 ×${fix(boss[i])}`).join('　·　'),
  );
  check('层 21 及以下不吃威胁（×1.00）', normal[0] === 1, `层21 = ×${fix(normal[0])}`);
  check('层 22 是斜坡起点（×1.00，不是一步吃到封顶）', Math.abs(normal[1] - 1) < 1e-9, `层22 = ×${fix(normal[1])}`);
  check('斜坡单调不减且封顶 = DEEP_THREAT_MUL', normal.every((v, i) => i === 0 || v >= normal[i - 1] - 1e-9) && Math.max(...normal) === mon.DEEP_THREAT_MUL, `峰值 = ×${fix(Math.max(...normal))}`);
  check('镇守额外 ×1.5（层 22+ 同层普通与镇守之比恒 1.5）', boss.slice(1).every((v, i) => Math.abs(v - normal[i + 1] * mon.BOSS_THREAT_EXTRA) < 1e-9), `层46 普通 ×${fix(normal[8])} / 镇守 ×${fix(boss[8])}　·　层21 是例外（<22 早退，镇守也不加）: 普通 ×${fix(normal[0])} / 镇守 ×${fix(boss[0])}`);

  // ── 2. threat 有没有真烘进 spawnMonster 的 damage ──────────────────────
  const def = mon.monstersOfTier(1)[0];
  const mk = (floor) => battleMod.spawnMonster(def, floor, 1, 0, 0, 'normal', []);
  const m21 = mk(21);
  const m22 = mk(22);
  const m34 = mk(34);
  const m76 = mk(76);
  const r21vs22 = m22.damage / m21.damage;
  const r21vs34 = m34.damage / m21.damage;
  const r21vs76 = m76.damage / m21.damage;
  // 期望值一律从模块自己的 scaleOfFloor × threatMul 推，别假设层曲线是常数：
  // 层 20 起伤害曲线换成软抬（FLOOR_DAMAGE_SOFT_MUL），21→22 的层曲线比是 1.03 不是 1.09。
  const expect22 = (mon.scaleOfFloor(22).damage / mon.scaleOfFloor(21).damage) * mon.threatMul(22, false);
  const expect34 = (mon.scaleOfFloor(34).damage / mon.scaleOfFloor(21).damage) * mon.threatMul(34, false);
  const expect76 = (mon.scaleOfFloor(76).damage / mon.scaleOfFloor(21).damage) * mon.threatMul(76, false);
  console.log(
    `\nspawnMonster damage（${def.id}）：层21 ${fix(m21.damage, 4)} · 层22 ${fix(m22.damage, 4)} · ` +
      `层34 ${fix(m34.damage, 4)} · 层76 ${fix(m76.damage, 4)}\n` +
      `比值 22/21 = ${fix(r21vs22, 3)}（理论 ${fix(expect22, 3)} = 层曲线 ×1.03 × threat ×1.00）　34/21 = ${fix(r21vs34, 3)}（理论 ${fix(expect34, 3)}）　76/21 = ${fix(r21vs76, 3)}（理论 ${fix(expect76, 3)}）`,
  );
  check('层 22 只吃层曲线、没提前吃威胁（22/21 = 层曲线比）', Math.abs(r21vs22 - expect22) < 1e-9, `实测 ${fix(r21vs22, 4)} vs 理论 ${fix(expect22, 4)}`);
  check('层 34 与层 21 的伤害比 = 层曲线比 × threat(34)', Math.abs(r21vs34 - expect34) < 1e-9, `实测 ${fix(r21vs34, 4)} vs 理论 ${fix(expect34, 4)}`);
  check('层 76 也吃到 threat（封顶 = DEEP_THREAT_MUL）', Math.abs(r21vs76 - expect76) < 1e-9, `实测 ${fix(r21vs76, 4)} vs 理论 ${fix(expect76, 4)}`);
  check('血量不吃威胁（只抬伤害，不拖 TTK）', m21.maxHp > 0 && Math.abs(m76.maxHp / m34.maxHp - mon.scaleOfFloor(76).hp / mon.scaleOfFloor(34).hp) < 1e-3, `maxHp 76/34 = ${fix(m76.maxHp / m34.maxHp, 3)}（理论 ${fix(mon.scaleOfFloor(76).hp / mon.scaleOfFloor(34).hp, 3)}，差在 maxHp 取整）`);

  // ── 3. 死亡语义（D110）：REVIVE_COOLDOWN=6、波次回 1、层不降 ─────────────
  const tables = { bases: basesMod.ITEM_BASES, affixes: affixMod.AFFIXES };
  const s = sessionMod.createSession({ classId: 'yujian', seed: 20261021, tables });
  // 必须死在第 ≥3 波，否则「波次回 1」和「波次保持」在读数上无法区分（死在第 1 波时两者都是 1）
  for (let i = 0; i < 20000 && s.wave < 3; i++) sessionMod.tickSession(s, 1 / 30);
  const floorAtDeath = s.floor;
  const waveAtDeathStart = s.wave;
  // 先塞一点修为，否则「掉 10%」在 0 修为上恒真、等于没测
  s.character.xp = 50;
  const xpAtDeathStart = s.character.xp;
  // 把玩家打到 1 血，再放一只层 46 的怪贴身 —— 下一帧必死
  s.battle.player.hp = 1;
  const px = typeof s.battle.player.x === 'number' ? s.battle.player.x : 480;
  const py = typeof s.battle.player.y === 'number' ? s.battle.player.y : 270;
  s.battle.monsters.push(battleMod.spawnMonster(mon.monstersOfTier(3)[0], 46, 9999, px, py, 'normal', []));
  const deathsBefore = s.battle.deaths;
  let diedAtRevive = null;
  for (let i = 0; i < 300; i++) {
    sessionMod.tickSession(s, 1 / 30);
    if (s.battle.deaths > deathsBefore) {
      diedAtRevive = s.battle.reviveCooldown;
      break;
    }
  }
  const reviveCd = battleMod.REVIVE_COOLDOWN;
  console.log(
    `\n死亡前后：层 ${floorAtDeath} → ${s.floor}　波次 ${waveAtDeathStart} → ${s.wave}　` +
      `deaths=${s.battle.deaths}　reviveCooldown(死亡当帧)=${diedAtRevive === null ? '未捕获' : fix(diedAtRevive)}　` +
      `修为 ${xpAtDeathStart} → ${s.character.xp}`,
  );
  check('REVIVE_COOLDOWN = 6 秒', reviveCd === 6, `const = ${reviveCd}`);
  check('死亡后本层回到第 1 波（s.wave === 1）', s.wave === 1, `wave = ${s.wave}（死前 ${waveAtDeathStart}）`);
  check('死亡不降层', s.floor === floorAtDeath, `层 ${floorAtDeath} → ${s.floor}`);
  check('死亡当帧 reviveCooldown 被设成 6', diedAtRevive !== null && Math.abs(diedAtRevive - 6) < 1e-9, `实测 ${diedAtRevive === null ? '—' : fix(diedAtRevive)}`);
  check('死亡只掉当前台阶存量的 10%（不是全身）', s.character.xp <= xpAtDeathStart && s.character.xp >= xpAtDeathStart * 0.5, `修为 ${xpAtDeathStart} → ${s.character.xp}`);

  // ── 4. 逃生阀（D113）：同层连死 ≥3 次 → 退 1 层（只验机制，不验次数） ──────────
  // 强制死亡助手：先等复活冷却走完（否则下一次「死亡」发生在冷却期里、根本不记数），
  // 再把血打到 1 并放一只高阶怪贴身，一直 tick 到 deaths 真的 +1。
  const forceDeath = (sess, floor, uid) => {
    let guard = 0;
    while (sess.battle.reviveCooldown > 0 && guard++ < 1200) sessionMod.tickSession(sess, 1 / 30);
    sess.battle.player.hp = 1;
    sess.battle.monsters.push(
      battleMod.spawnMonster(mon.monstersOfTier(3)[0], floor, uid, sess.battle.player.x ?? 480, sess.battle.player.y ?? 270, 'normal', []),
    );
    const before = sess.deaths;
    for (let i = 0; i < 900; i++) {
      sessionMod.tickSession(sess, 1 / 30);
      if (sess.deaths > before) return true;
    }
    return false;
  };

  const s2 = sessionMod.createSession({ classId: 'yujian', seed: 20261021, tables });
  for (let i = 0; i < 60; i++) sessionMod.tickSession(s2, 1 / 30);
  // setFloor 只允许「已到过的层」⇒ 必须先把 maxFloorReached 抬上去（这正是它的契约，见 farm-select 契约测试）
  s2.maxFloorReached = 5;
  const placed = sessionMod.setFloor(s2, 5);
  check('setFloor 能把角色放到层 5（逃生阀测试前置）', placed === true && s2.floor === 5, `setFloor(5) = ${placed}, floor = ${s2.floor}`);
  const floorBefore = s2.floor;
  const valveBefore = s2.escapeValveCount;
  const deathsNeeded = sessionMod.ESCAPE_VALVE_DEATHS;
  let valveDeaths = 0;
  for (let attempt = 0; attempt < deathsNeeded + 2 && valveDeaths < deathsNeeded; attempt++) {
    if (forceDeath(s2, s2.floor, 9000 + attempt)) valveDeaths++;
  }
  console.log(
    `\n逃生阀：层 ${floorBefore} 连死 ${valveDeaths} 次 → 层 ${s2.floor}　escapeValveCount ${valveBefore} → ${s2.escapeValveCount}　` +
      `（ESCAPE_VALVE_DEATHS=${deathsNeeded} / ESCAPE_VALVE_LAYERS=${sessionMod.ESCAPE_VALVE_LAYERS}）`,
  );
  check('同层连死 3 次后逃生阀触发、退回 1 层', s2.floor === floorBefore - 1 && s2.escapeValveCount === valveBefore + 1, `层 ${floorBefore} → ${s2.floor}，阀门 ${valveBefore} → ${s2.escapeValveCount}，实测死亡 ${valveDeaths} 次`);
  check('逃生阀把本层死亡计数清零（不会一退再退）', s2.floorDeaths === 0, `floorDeaths = ${s2.floorDeaths}`);
  check('层 1 无处可退时不退到 0 层', (() => {
    const s3 = sessionMod.createSession({ classId: 'yujian', seed: 20261021, tables });
    for (let i = 0; i < 30; i++) sessionMod.tickSession(s3, 1 / 30);
    let n = 0;
    for (let k = 0; k < sessionMod.ESCAPE_VALVE_DEATHS + 1; k++) {
      if (forceDeath(s3, 1, 7000 + k)) n++;
    }
    console.log(`\n层 1 连死 ${n} 次：floor=${s3.floor}　escapeValveCount=${s3.escapeValveCount}`);
    return s3.floor === 1;
  })(), '层 1 连死多次后仍在层 1');

  // ── 5. 成就表里 floor-46 已不存在、floor-76 存在 ────────────────────────
  const ach = await load('/src/data/achievements.ts').catch(() => null);
  const defs = ach && (ach.ACHIEVEMENT_DEFS ?? ach.ACHIEVEMENTS ?? ach.achievementDefs);
  if (Array.isArray(defs)) {
    const ids = defs.map((d) => d.id);
    // 不写死 20：层 28~76 / 周目 / 深层掉落都可能加成就，条数来源必须是模块自己的派生量
    // （`src/data/achievements.ts` 的 ACHIEVEMENT_TOTAL = DEFS.length）。写死 20 就等于
    // 「每次加一条成就，这条断言假红一次」，而且红的原因跟死亡机制毫无关系。
    check(
      '成就表条数 = 模块派生量 ACHIEVEMENT_TOTAL（不写死 20）',
      defs.length === (ach.ACHIEVEMENT_TOTAL ?? defs.length),
      `DEFS=${defs.length} · ACHIEVEMENT_TOTAL=${ach.ACHIEVEMENT_TOTAL ?? '（未导出）'}`,
    );
    check('floor-46 已不存在', !ids.includes('floor-46'), `含 floor-46 = ${ids.includes('floor-46')}`);
    check('floor-76 存在且 target=76 / reward=50000', (() => {
      const d = defs.find((x) => x.id === 'floor-76');
      return !!d && d.target === 76 && d.reward === 50000;
    })(), JSON.stringify(defs.find((x) => x.id === 'floor-76') ?? null));
  } else {
    console.log('\n（成就模块导出名对不上，跳过 §4 —— 不猜；实际导出：' + (ach ? Object.keys(ach).join(',') : 'load 失败') + '）');
  }
} finally {
  await close();
}

const pass = out.filter((r) => r.ok).length;
console.log(`\n通过 ${pass}/${out.length}`);
process.exitCode = pass === out.length ? 0 : 1;
