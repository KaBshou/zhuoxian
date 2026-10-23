/**
 * 镇守专项：层 1 / 9 / 18 的镇守，按「第 N 层典型面板」算单场击杀耗时。
 *
 * 判据（Lead m00654 / BALANCE §11.2 D6）：镇守单场 **60~180 秒**。
 *   < 60s  = 太软（限时 DPS 检查形同虚设）
 *   > 180s = 卡关
 *
 * 「典型面板」怎么来：27 层 = 9 境 × 3 层，层 N 属于第 ceil(N/3) 境；
 * 按 BALANCE 表 C 的时长分配，玩家到该境时大约走到该境**中段**台阶（表 C2：每境 9 台阶），
 * 所以 step = (realm-1)*9 + 4。装备不计（实测 10 分钟只穿 2~5 件，供给模型还没定稿），
 * 因此本表是**下界**：真实面板略强于这里。
 *
 * 两轮对战都跑真实 tickBattle：
 *   A) 现状（含自回 bug：计时器写在 `m.cooldown === 0` 分支里，见 battle.ts:466）
 *   B) 自回按设计生效（每 10s 回 10% 最大气血，脚本手工模拟，标注为「假设修好后」）
 *
 * 用法：node tools/diag-boss.mjs
 */
import { openSrc } from './vite-loader.mjs';

const DT = 1 / 60;
const FLOORS = [1, 9, 18];
const CAP_SECONDS = 600;
const TARGET_MIN = 60;
const TARGET_MAX = 180;
/** BALANCE 表 A 层 1 标定 DPS（9.8）+ 表 B「DPS 富余恒 = 1.00」→ 层 N 期望 DPS */
const BALANCE_DPS_F1 = 9.8;
const FLOOR_HP_MUL = 1.1534;

const { load, close } = await openSrc();
try {
  const battle = await load('src/core/battle.ts');
  const monsters = await load('src/data/monsters.ts');
  const { character, characterStats, createCharacter, baseDamage } = await load('src/core/character.ts');
  void character;
  const { Rng } = await load('src/core/rng.ts');

  const f = (n, d = 2) => (Number.isFinite(n) ? Number(n.toFixed(d)) : '—');

  console.log('# 镇守专项 · 层 1 / 9 / 18（真实 tickBattle）');
  console.log('');

  /** @type {any[]} */
  const rows = [];

  for (const floor of FLOORS) {
    const realm = Math.ceil(floor / 3);
    const step = (realm - 1) * 9 + 4;
    const ch = { ...createCharacter('yujian'), step };
    const st = characterStats(ch);
    const p = battle.playerBattleFromCharacter(ch);

    const def = monsters.bossOfTier(monsters.tierOfFloor(floor));
    if (!def) throw new Error(`层 ${floor} 找不到镇守定义`);
    const m = battle.spawnMonster(def, floor, 1, p.x + 70, p.y, 'boss');

    const panelDps = baseDamage() * (1 + st.damage / 100) * st.attackSpeed * (1 + st.critChance * (st.critMulti - 1));
    const balanceDps = BALANCE_DPS_F1 * Math.pow(FLOOR_HP_MUL, floor - 1);
    const hp = m.hp;

    // ── A) 现状：真实 tickBattle，自回 bug 原样保留 ──
    const runA = runFight({ battle, Rng, ch, p, m, emulateRegen: false });
    // ── B) 假设自回按设计生效 ──
    const runB = runFight({ battle, Rng, ch, p, m, emulateRegen: true });
    // ── C) 纯 DPS 标定：镇守不还手，量真实输出（含神通轮转） ──
    const dpsRun = measureDps({ battle, Rng, ch, p, m });

    rows.push({
      floor,
      realm,
      step,
      level: step + 1,
      bossName: def.name,
      hp,
      dmg: m.damage,
      panelDps,
      balanceDps,
      playerHp: p.maxHp,
      playerArmor: p.armor,
      a: runA,
      b: runB,
      dps: dpsRun,
    });
  }

  console.log('| 层 | 境/台阶 | 镇守 | 镇守血 | 镇守攻 | 玩家气血 | 护体 | 面板DPS | 表B期望DPS |');
  console.log('|---:|---|---|---:|---:|---:|---:|---:|---:|');
  for (const r of rows) {
    console.log(
      `| ${r.floor} | 境${r.realm}/台阶${r.step} | ${r.bossName} | ${r.hp} | ${f(r.dmg)} | ${Math.round(r.playerHp)} | ` +
        `${Math.round(r.playerArmor)} | ${f(r.panelDps)} | ${f(r.balanceDps)} |`,
    );
  }

  console.log('');
  console.log('## A) 现状（自回 bug 仍在）：真实 tickBattle');
  console.log('');
  console.log('| 层 | 结果 | 耗时(s) | 打掉血量 | 镇守出手次数 | 自回次数 | 玩家剩余血 | 判定(60~180s) |');
  console.log('|---:|---|---:|---:|---:|---:|---:|---|');
  for (const r of rows) {
    const a = r.a;
    console.log(
      `| ${r.floor} | ${a.result} | ${f(a.seconds, 1)} | ${Math.round(a.damageDealt)} | ${a.bossStrikes} | ${a.regenEvents} | ` +
        `${Math.round(a.playerHpLeft)} | ${verdict(a)} |`,
    );
  }

  console.log('');
  console.log('## B) 假设自回按设计生效（每 10s 回 10% 血）：真实 tickBattle + 手工补血');
  console.log('');
  console.log('| 层 | 结果 | 耗时(s) | 打掉血量 | 镇守出手次数 | 自回次数 | 自回量 | 玩家剩余血 | 判定(60~180s) |');
  console.log('|---:|---|---:|---:|---:|---:|---:|---:|---|');
  for (const r of rows) {
    const b = r.b;
    console.log(
      `| ${r.floor} | ${b.result} | ${f(b.seconds, 1)} | ${Math.round(b.damageDealt)} | ${b.bossStrikes} | ${b.regenEvents} | ` +
        `${Math.round(b.regenHealed)} | ${Math.round(b.playerHpLeft)} | ${verdict(b)} |`,
    );
  }

  console.log('');
  console.log('## 达标所需 DPS（含自回；自回速率 = 血量的 1%/秒）');
  console.log('');
  console.log('| 层 | 镇守血 | 自回/秒 | 60s 通关需 DPS | 180s 通关需 DPS | 玩家面板 DPS | 表B期望 DPS | 差距(面板/180s需求) |');
  console.log('|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const r of rows) {
    const regen = r.hp * 0.1 / 10;
    const dps60 = r.hp / 60 + regen;
    const dps180 = r.hp / 180 + regen;
    console.log(
      `| ${r.floor} | ${r.hp} | ${f(regen)} | ${f(dps60)} | ${f(dps180)} | ${f(r.panelDps)} | ${f(r.balanceDps)} | ` +
        `${f(r.panelDps / dps180, 2)}× |`,
    );
  }

  console.log('');
  console.log('## 真实输出（含神通轮转）：伤害实测，不看面板');
  console.log('');
  console.log('| 层 | 实测DPS | 无自回 TTK(血/DPS) | 自回速率(血×1%/s) | 要打死需 DPS>自回? | 玩家对镇守存活(s) | 判定 |');
  console.log('|---:|---:|---:|---:|---|---:|---|');
  for (const r of rows) {
    const regen = r.hp * 0.01;
    const ttk = r.hp / r.dps.dps;
    const canOutDps = r.dps.dps > regen;
    const surv = r.a.result === '玩家阵亡' ? f(r.a.seconds, 1) : '未死';
    let verdictText;
    if (!canOutDps) verdictText = '打不死（自回 > 输出）';
    else if (ttk < TARGET_MIN) verdictText = `太软(${f(ttk, 1)}s)`;
    else if (ttk > TARGET_MAX) verdictText = `卡关(${f(ttk, 1)}s)`;
    else verdictText = `合格(${f(ttk, 1)}s)`;
    console.log(
      `| ${r.floor} | ${f(r.dps.dps, 1)} | ${f(ttk, 1)} | ${f(regen, 1)} | ${canOutDps ? '是' : '**否**'} | ${surv} | ${verdictText} |`,
    );
  }

  console.log('');
  console.log('## 说明');
  console.log('');
  console.log(`- 典型面板口径：层 N → 境 ceil(N/3) → 台阶 (境-1)*9+4；裸装（面板 DPS 已含攻伐%与暴击期望）。`);
  console.log(`- 玩家实际战斗分支还包含：神通轮转（unlockStep 解锁）、生命汲取、波末回气 25%（session.ts:264）、死亡后 3s 复活。`);
  console.log(`- 对战跑到 ${CAP_SECONDS}s 仍未分出胜负记 timeout；玩家先死记「玩家阵亡」。`);

  function verdict(run) {
    if (run.result !== '击杀') return run.result === '玩家阵亡' ? '卡关(玩家先死)' : '超时';
    if (run.seconds < TARGET_MIN) return `太软(${f(run.seconds, 1)}s)`;
    if (run.seconds > TARGET_MAX) return `卡关(${f(run.seconds, 1)}s)`;
    return '合格';
  }

  /**
   * 纯输出标定：镇守不还手（damage=0，attacks 关掉），跑 120 秒或打到死，
   * 返回「打掉的血 / 秒」= 玩家真实 DPS（含普攻 + 神通轮转 + 暴击 + 浊气沸腾）。
   */
  function measureDps({ battle, Rng, ch, p, m }) {
    const b = battle.createBattle({ ...p, hp: p.maxHp, shield: 0 }, ch.turbid, ch);
    const mob = { ...m, hp: Math.max(m.maxHp * 100, 1e9), maxHp: Math.max(m.maxHp * 100, 1e9), damage: 0, bossRegenTimer: 0, cooldown: 0 };
    mob.attackInterval = 1e9;
    b.monsters = [mob];
    b.player.x = 480;
    b.player.y = 270;
    mob.x = 550;
    mob.y = 270;

    const rng = new Rng(20261021);
    const cap = 120;
    let seconds = 0;
    while (seconds < cap) {
      battle.tickBattle(b, DT, rng);
      seconds += DT;
      b.player.hp = b.player.maxHp; // 不考虑被打死，只量输出
    }
    const dealt = mob.maxHp - mob.hp;
    return { dps: dealt / seconds, seconds, dealt };
  }

  /**
   * 跑一场 1v1 镇守战。每场都重建 battle 与怪，保证两轮条件一致。
   * @param {{battle:any, Rng:any, ch:any, p:any, m:any, emulateRegen:boolean}} opts
   */
  function runFight({ battle, Rng, ch, p, m, emulateRegen }) {
    const b = battle.createBattle({ ...p, hp: p.maxHp, shield: 0 }, ch.turbid, ch);
    const mob = { ...m, hp: m.maxHp, bossRegenTimer: 0, cooldown: 0 };
    b.monsters = [mob];
    b.player.x = 480;
    b.player.y = 270;
    mob.x = 550;
    mob.y = 270;

    const rng = new Rng(20261021);
    let seconds = 0;
    let bossStrikes = 0;
    let regenEvents = 0;
    let regenHealed = 0;
    let lastBossHp = mob.hp;
    let nextEmulatedRegen = 10;

    while (seconds < CAP_SECONDS) {
      battle.tickBattle(b, DT, rng);
      seconds += DT;

      // 出手计数：镇守 cooldown 从 attackInterval 起算到 0 的那一刻会立刻被重置
      if (mob.cooldown > 0 && mob.cooldown >= m.attackInterval - 1e-9) bossStrikes++;

      // 真实自回（bug 版）：血量上升即记一次
      if (mob.hp > lastBossHp + 1e-9) {
        regenEvents++;
        regenHealed += mob.hp - lastBossHp;
      }
      lastBossHp = mob.hp;

      if (emulateRegen && seconds >= nextEmulatedRegen) {
        nextEmulatedRegen += 10;
        if (mob.hp > 0 && mob.hp < mob.maxHp) {
          const before = mob.hp;
          mob.hp = Math.min(mob.maxHp, mob.hp + mob.maxHp * 0.1);
          if (mob.hp > before) {
            regenEvents++;
            regenHealed += mob.hp - before;
          }
          lastBossHp = mob.hp;
        }
      }

      if (mob.hp <= 0) break;
      if (b.player.hp <= 0) return { result: '玩家阵亡', seconds, damageDealt: m.maxHp - mob.hp, bossStrikes, regenEvents, regenHealed, playerHpLeft: 0 };
    }

    const result = mob.hp <= 0 ? '击杀' : '超时';
    return {
      result,
      seconds,
      damageDealt: m.maxHp - Math.max(0, mob.hp),
      bossStrikes,
      regenEvents,
      regenHealed,
      playerHpLeft: Math.max(0, b.player.hp),
    };
  }
} finally {
  await close();
}
