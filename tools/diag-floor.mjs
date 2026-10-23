/**
 * 逐层扫（层 1 / 5 / 9 / 13 / 18 / 27）：验证 FLOOR_HP_MUL=1.1534 的 27 层曲线
 * 在「玩家侧供给」上是否成立 —— 即 BALANCE §3 表 B 的「DPS 富余恒 = 1.00、一波 ≈ 75s」。
 *
 * 为什么按「一波时长」验：表 B 的设计目标是 TTK 恒定、一波恒定 75s；
 * 深层一波明显变长 ⇒ 玩家 DPS 供给 < 怪血增长（曲线对玩家侧不成立）。
 *
 * 典型面板口径（同 diag-boss）：层 N → 境 ceil(N/3) → 台阶 (境-1)*9+4，裸装。
 * 裸装是**下界**：真实玩家还有装备/神通槽，本脚本只验「曲线形状」。
 *
 * 顺带回答「21 死/10min 的死亡根因」：按普通波 / 镇守波拆分，并记录死亡后重开时是否满血。
 *
 * 用法：node tools/diag-floor.mjs [每层分钟数]
 */
import { openSrc } from './vite-loader.mjs';

const MINUTES_PER_FLOOR = Number(process.argv[2] ?? 10);
const FLOORS = [1, 5, 9, 13, 18, 27];
const DT = 1 / 60;
const SEED = 20261021;
const TARGET_WAVE_SECONDS = 75; // BALANCE §3 表 A：一波 18 只、目标 75 秒
const TARGET_KPM = 6.4; // 8 只 / 75 秒… 表 A 的击杀率口径（18 只口径下等于 14.4）
const TARGET_DPM = 4; // 法宝 1.6 + 通货 1.9 + 玉简 0.5

const { load, close } = await openSrc();
try {
  const session = await load('src/core/session.ts');
  const battleMod = await load('src/core/battle.ts');
  const { createCharacter, characterStats } = await load('src/core/character.ts');
  const monsters = await load('src/data/monsters.ts');
  const { Rng } = await load('src/core/rng.ts');
  const { AFFIXES } = await load('src/data/affixes.ts');
  const { ITEM_BASES } = await load('src/data/bases.ts');
  const TABLES = { bases: ITEM_BASES, affixes: AFFIXES };

  const f = (n, d = 2) => (Number.isFinite(n) ? Number(n.toFixed(d)) : '—');
  const pct = (a, t) => `${f(((a - t) / t) * 100, 1)}%`;

  /** @type {any[]} */
  const rows = [];

  /** 玩家侧 DPS 标定：单怪血池拉大、不还手，量 30 秒真实输出（含普攻+神通+暴击+浊气） */
  function measureDpsAtFloor(floor, ch) {
    const p = battleMod.playerBattleFromCharacter(ch);
    const b = battleMod.createBattle({ ...p, hp: p.maxHp, shield: 0 }, ch.turbid, ch);
    const def = monsters.monstersOfTier(monsters.tierOfFloor(floor))[0];
    if (!def) throw new Error(`层 ${floor} 无普通怪定义`);
    const m = battleMod.spawnMonster(def, floor, 1, p.x + 60, p.y);
    m.maxHp = m.hp * 50;
    m.hp = m.maxHp;
    m.damage = 0;
    m.attackInterval = 1e9;
    m.cooldown = 1e9;
    b.monsters = [m];
    b.player.x = 480;
    b.player.y = 270;
    m.x = 540;
    m.y = 270;

    const rng = new Rng(SEED);
    const seconds = 30;
    const steps = Math.round(seconds / DT);
    for (let i = 0; i < steps; i++) {
      battleMod.tickBattle(b, DT, rng);
      b.player.hp = b.player.maxHp; // 只量输出，不考虑被打死
    }
    return { dps: (m.maxHp - m.hp) / seconds, seconds };
  }

  for (const floor of FLOORS) {
    const realm = Math.ceil(floor / 3);
    const step = (realm - 1) * 9 + 4;
    const ch = { ...createCharacter('yujian'), step };
    const st = characterStats(ch);

    const s = session.createSession({ classId: 'yujian', seed: SEED, tables: TABLES });
    s.character = ch;
    s.battle = battleMod.createBattle(battleMod.playerBattleFromCharacter(ch), ch.turbid, ch);
    s.floor = floor;
    s.wave = 0;
    session.startWave(s);

    /** @type {{waveNo:number, boss:boolean, seconds:number, died:boolean, hpAtStart:number, hpAtEnd:number, waveEndRegen:number}[]} */
    const waveRecords = [];
    let waveStartTime = 0;
    let waveStartHp = s.battle.player.hp;
    let waveStartDeaths = s.battle.deaths;
    let reviveFullHeals = 0;
    let prevHp = s.battle.player.hp;
    let prevWave = s.wave;

    const steps = Math.round((MINUTES_PER_FLOOR * 60) / DT);
    for (let i = 0; i < steps; i++) {
      session.tickSession(s, DT);
      const t = (i + 1) * DT;

      // 死亡后 3 秒复活会把血拉满（battle.ts:418-421）
      if (s.battle.player.hp > prevHp + 1e-9 && s.battle.reviveCooldown > 0) reviveFullHeals++;
      prevHp = s.battle.player.hp;

      if (s.wave !== prevWave) {
        const died = s.battle.deaths > waveStartDeaths;
        waveRecords.push({
          waveNo: prevWave,
          boss: prevWave > 0 && prevWave % session.BOSS_EVERY === 0,
          seconds: t - waveStartTime,
          died,
          hpAtStart: waveStartHp,
          hpAtEnd: s.battle.player.hp,
          waveEndRegen: s.battle.player.hp - waveStartHp,
        });
        waveStartTime = t;
        waveStartHp = s.battle.player.hp;
        waveStartDeaths = s.battle.deaths;
        prevWave = s.wave;
      }
    }

    const deaths = s.battle.deaths;
    const normalWaves = waveRecords.filter((w) => !w.boss);
    const bossWaves = waveRecords.filter((w) => w.boss);
    const avgWave = waveRecords.reduce((a, w) => a + w.seconds, 0) / Math.max(1, waveRecords.length);
    const avgNormalWave = normalWaves.reduce((a, w) => a + w.seconds, 0) / Math.max(1, normalWaves.length);
    const avgBossWave = bossWaves.reduce((a, w) => a + w.seconds, 0) / Math.max(1, bossWaves.length);
    // 「清波时长」只算没人死的波：死亡会截断波形，混进来会把均值拉低成假象
    const clearedNormal = normalWaves.filter((w) => !w.died);
    const clearedBoss = bossWaves.filter((w) => !w.died);
    const avgClearNormal = clearedNormal.reduce((a, w) => a + w.seconds, 0) / Math.max(1, clearedNormal.length);
    const avgClearBoss = clearedBoss.reduce((a, w) => a + w.seconds, 0) / Math.max(1, clearedBoss.length);
    const avgDiedNormal = normalWaves.filter((w) => w.died).reduce((a, w) => a + w.seconds, 0) / Math.max(1, normalWaves.filter((w) => w.died).length);
    const deathsNormal = normalWaves.filter((w) => w.died).length;
    const deathsBoss = bossWaves.filter((w) => w.died).length;
    const waveEndHeals = waveRecords.filter((w) => w.waveEndRegen > 0).length;

    rows.push({
      floor,
      step,
      st,
      dps: measureDpsAtFloor(floor, ch),
      deaths,
      deathsNormal,
      deathsBoss,
      normalWaves: normalWaves.length,
      bossWaves: bossWaves.length,
      avgWave,
      avgNormalWave,
      avgBossWave,
      avgClearNormal,
      avgClearBoss,
      avgDiedNormal,
      clearedNormal: clearedNormal.length,
      clearedBoss: clearedBoss.length,
      kills: s.battle.kills,
      drops: s.dropsFound,
      taken: s.battle.damageTaken,
      reviveFullHeals,
      waveEndHeals,
      stepGain: s.character.step - step,
      hpAtBossStart: bossWaves.length > 0 ? bossWaves[0].hpAtStart : null,
      playerHp: st.life,
      armor: st.armor,
    });
  }

  console.log(`# 逐层扫 · 每层 ${MINUTES_PER_FLOOR} 分钟 · seed ${SEED} · 裸装典型面板（下界）`);
  console.log('');
  console.log('## 主表');
  console.log('');
  console.log(
    '| 层 | 台阶 | 玩家血/护体 | 波数(普通/镇守) | 平均波时 | 普通波时 | 镇守波时 | 偏差(75s) | 击杀/min | 掉落/min | 入伤/波 | 台阶增幅 |',
  );
  console.log('|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const r of rows) {
    console.log(
      `| ${r.floor} | ${r.step} | ${Math.round(r.playerHp)}/${Math.round(r.armor)} | ${r.normalWaves}/${r.bossWaves} | ` +
        `${f(r.avgWave, 1)} | ${f(r.avgNormalWave, 1)} | ${f(r.avgBossWave, 1)} | ${pct(r.avgWave, TARGET_WAVE_SECONDS)} | ` +
        `${f(r.kills / MINUTES_PER_FLOOR, 2)} | ${f(r.drops / MINUTES_PER_FLOOR, 2)} | ` +
        `${f(r.taken / Math.max(1, r.normalWaves + r.bossWaves), 1)} | +${r.stepGain} |`,
    );
  }

  console.log('');
  console.log('## 判定一：清波时长（只算没人死的普通波；死亡会截断波形，混入会伪造「越来越快」）');
  console.log('');
  console.log('| 层 | 清波时长 | 偏差(75s) | 被截断的普通波均值 | 判定 | 读法 |');
  console.log('|---:|---:|---:|---:|---|---|');
  for (const r of rows) {
    const dev = (r.avgClearNormal - TARGET_WAVE_SECONDS) / TARGET_WAVE_SECONDS;
    const ok = Math.abs(dev) <= 0.2;
    const note = dev > 0.2 ? '掉速：玩家供给 < 怪血曲线' : dev < -0.2 ? '清太快：怪血偏低 / 面板偏强' : '节奏对齐';
    console.log(
      `| ${r.floor} | ${f(r.avgClearNormal, 1)} | ${pct(r.avgClearNormal, TARGET_WAVE_SECONDS)} | ${f(r.avgDiedNormal, 1)} | ${ok ? '合格' : '不合格'} | ${note} |`,
    );
  }

  console.log('');
  console.log('## 判定一之二：玩家侧 DPS 标定（单怪不还手，量 30 秒真实输出）');
  console.log('');
  console.log('| 层 | 实测DPS(裸装) | 表B期望DPS | 比值 | 普通怪血 | 单只TTK | 一波18只TTK | 表A目标 TTK≈9.2s |');
  console.log('|---:|---:|---:|---:|---:|---:|---:|---|');
  for (const r of rows) {
    const scale = monsters.scaleOfFloor(r.floor);
    const expect = 9.8 * scale.hp;
    const dev = r.dps.dps / expect;
    const monHp = Math.round(
      monsters.BASE_MONSTER_HP * (monsters.monstersOfTier(monsters.tierOfFloor(r.floor))[0]?.hpMul ?? 1) * scale.hp,
    );
    console.log(
      `| ${r.floor} | ${f(r.dps.dps, 1)} | ${f(expect, 1)} | ${f(dev, 2)}× | ${monHp} | ${f(monHp / r.dps.dps, 1)}s | ` +
        `${f((monHp * 18) / r.dps.dps, 1)}s | ${dev >= 0.8 ? '接近/超过' : '**供给不足**'} |`,
    );
  }

  console.log('');
  console.log('## 判定二：死亡结构（21 死/10min 是集中在镇守吗？）');
  console.log('');
  console.log('| 层 | 总死亡 | 普通波死亡 | 镇守波死亡 | 镇守波占比 | 镇守波数 | 镇守波开场血量 | 死亡重开满血复活次数 | 波末回气触发 |');
  console.log('|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const r of rows) {
    const share = r.deaths > 0 ? `${f((r.deathsBoss / r.deaths) * 100, 1)}%` : '—';
    console.log(
      `| ${r.floor} | ${r.deaths} | ${r.deathsNormal} | ${r.deathsBoss} | ${share} | ${r.bossWaves} | ` +
        `${r.hpAtBossStart === null ? '—' : Math.round(r.hpAtBossStart)} | ${r.reviveFullHeals} | ${r.waveEndHeals} |`,
    );
  }

  console.log('');
  console.log('## 参照：怪侧曲线与表 B 期望供给');
  console.log('');
  console.log('| 层 | 普通怪血(层1当量×) | 普通怪攻 | 镇守血 | 表B期望DPS(层1=9.8) |');
  console.log('|---:|---:|---:|---:|---:|');
  for (const r of rows) {
    const scale = monsters.scaleOfFloor(r.floor);
    const boss = monsters.bossOfTier(monsters.tierOfFloor(r.floor));
    const bossHp = Math.round(monsters.BASE_MONSTER_HP * (boss?.hpMul ?? 1) * scale.hp);
    console.log(
      `| ${r.floor} | ${f(scale.hp, 2)} | ${f(monsters.BASE_MONSTER_DAMAGE * scale.damage, 2)} | ${bossHp} | ${f(9.8 * scale.hp, 2)} |`,
    );
  }

  console.log('');
  console.log('## 说明');
  console.log('');
  console.log(`- 目标口径：一波 ${TARGET_WAVE_SECONDS}s、击杀 ${TARGET_KPM}/min（表 A 的 8 只口径）、掉落 ${TARGET_DPM}/min。`);
  console.log('- 每层新建 session 并把 `floor` 置为目标层，`startWave` 走真实逻辑（第 10 波镇守）。');
  console.log(`- 每层跑 ${MINUTES_PER_FLOOR} 分钟游戏时间，dt=${f(DT, 4)}s；裸装 ⇒ 深层偏悲观。`);
  console.log('- 死亡重开后 3s 复活直接满血（`battle.ts:418-421`），所以「死亡重开不吃波末回气」不构成连续死亡的机制。');
} finally {
  await close();
}
