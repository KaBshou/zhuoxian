#!/usr/bin/env node
/**
 * 最小复现：层 1 单跑，每 30s 采样一次。
 *
 * 用途：主线「层 1 镇守战」相关的现场取证。2026-10-22 10:0x 观察到：
 * 普通波正常推进到 wave 10，镇守出场后击杀数冻结、玩家血量匀速下滑、
 * 900s 内既打不死镇守也不死亡，s.floor 与 step 都不动。
 *
 * 用法：
 *   node tools/min-repro-floor1.mjs                # 默认 900s、每秒 30 帧
 *   node tools/min-repro-floor1.mjs --seconds=300  # 缩短
 *   node tools/min-repro-floor1.mjs --sample=10    # 采样间隔
 *   node tools/min-repro-floor1.mjs --json=out.json
 *
 * 只用 src 的公开 API（createSession / startWave / tickSession），不改 src。
 * 依赖：tools/vite-loader.mjs（vite ssrLoadModule 加载 TS）。
 */
import { writeFileSync } from 'node:fs';
import { openSrc } from './vite-loader.mjs';

function argNumber(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const n = Number(hit.slice(name.length + 3));
  return Number.isFinite(n) ? n : fallback;
}

const SECONDS = argNumber('seconds', 900);
const SAMPLE = argNumber('sample', 30);
const DT = 1 / 30;
const SEED = argNumber('seed', 20261021);
const JSON_OUT = process.argv.find((a) => a.startsWith('--json='))?.slice(7);

function stamp() {
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const { load, close } = await openSrc();
try {
  const sessionMod = await load('src/core/session.ts');
  const monstersMod = await load('src/data/monsters.ts');
  const { ITEM_BASES } = await load('src/data/bases.ts');
  const { AFFIXES } = await load('src/data/affixes.ts');

  const s = sessionMod.createSession({
    classId: 'yujian',
    seed: SEED,
    tables: { bases: ITEM_BASES, affixes: AFFIXES },
    autoTalents: false,
  });
  sessionMod.startWave(s);

  const p0 = s.battle.player;
  const samples = [];
  const pick = () => {
    const monsters = s.battle.monsters;
    const leader = monsters.reduce(
      (acc, m) => (!acc || m.maxHp > acc.maxHp ? m : acc),
      null,
    );
    return {
      t: Math.round(s.waveTimer * 10) / 10,
      floor: s.floor,
      maxFloorReached: s.maxFloorReached,
      wave: s.wave,
      kills: s.battle.kills,
      deaths: s.floorDeaths,
      step: s.character.step,
      xp: Math.round(s.character.xp),
      monsters: monsters.length,
      leader: leader
        ? {
            id: leader.defId,
            rarity: leader.rarity,
            hp: Math.round(leader.hp),
            maxHp: Math.round(leader.maxHp),
            damage: Math.round(leader.damage * 100) / 100,
            armor: leader.armor,
            resist: leader.resist,
          }
        : null,
      player: {
        hp: Math.round(p0.hp),
        maxHp: Math.round(p0.maxHp),
        damage: Math.round(p0.damage * 100) / 100,
        attackSpeed: Math.round(p0.attackSpeed * 1000) / 1000,
        critChance: Math.round(p0.critChance * 1000) / 1000,
      },
    };
  };

  const totalFrames = Math.round(SECONDS / DT);
  const sampleEvery = Math.max(1, Math.round(SAMPLE / DT));
  for (let i = 1; i <= totalFrames; i++) {
    s.craftTimer = 0; // 压掉会话内自动打造，只看战斗
    sessionMod.tickSession(s, DT);
    if (i % sampleEvery === 0) {
      samples.push({ sampleAt: Math.round(i * DT), ...pick() });
    }
    if (s.floor > 1) break;
  }

  const first = samples[0];
  const last = samples[samples.length - 1];
  const sampleStep = Math.round(SAMPLE / DT);
  const lastSample = new Date(Date.now() - 0).toISOString();

  // —— 摘要表 ——
  console.log(`# 层 1 最小复现（seed ${SEED}，${SECONDS}s，dt=${DT.toFixed(5)}，采样 ${SAMPLE}s，${stamp()}）\n`);
  console.log('| t(s) | 层 | wave | 怪物数 | 最大怪 | 怪hp/最大hp | 玩家hp/最大hp | 杀 | 死 | step | xp |');
  console.log('|---:|---:|---:|---:|---|---|---|---:|---:|---:|---:|');
  for (const smp of samples) {
    const led = smp.leader
      ? `${smp.leader.id}/${smp.leader.rarity}`
      : '—';
    const ledHp = smp.leader ? `${smp.leader.hp}/${smp.leader.maxHp}` : '—';
    console.log(
      `| ${smp.sampleAt} | ${smp.floor} | ${smp.wave} | ${smp.monsters} | ${led} | ${ledHp} | ${smp.player.hp}/${smp.player.maxHp} | ${smp.kills} | ${smp.deaths} | ${smp.step} | ${smp.xp} |`,
    );
  }

  const verdict = {
    reachedFloor2: last ? last.floor > 1 : false,
    killDelta: last && first ? last.kills - first.kills : 0,
    hpDelta: last && first ? last.player.hp - first.player.hp : 0,
    waveStuckAt: last ? last.wave : null,
    playerDamage: first ? first.player.damage : null,
    finalLeaderHp: last?.leader ? last.leader.hp : null,
    sampleCount: samples.length,
    frameEvery: sampleStep,
    sampledAt: lastSample,
  };
  console.log('\n## 判定');
  console.log(`- 到层 2：${verdict.reachedFloor2 ? '是' : '否'}`);
  console.log(`- 观测窗内击杀增量：${verdict.killDelta}；玩家血量增量：${verdict.hpDelta}`);
  console.log(`- 卡住的 wave：${verdict.waveStuckAt}；终局最大怪 hp：${verdict.finalLeaderHp}`);
  console.log(`- 玩家面板攻伐：${verdict.playerDamage}`);

  if (JSON_OUT) {
    writeFileSync(
      JSON_OUT,
      `${JSON.stringify({ generatedAt: lastSample, params: { SEED, SECONDS, SAMPLE }, verdict, samples }, null, 2)}\n`,
      'utf8',
    );
    console.log(`\nJSON 已写入 ${JSON_OUT}`);
  }
} finally {
  await close();
}
