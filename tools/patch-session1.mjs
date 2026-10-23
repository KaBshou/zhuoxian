// 一次性补丁：session.ts 从「阶」迁移到「层」+ 修「死亡=免费跳波」。跑完即弃。
// 要点：
// 1. GameSession.tier → floor（1~27 可数层，镇守每 5 波一个，打完镇守 floor+3 进下一阶的第一层）
// 2. WAVE_SIZE 3 → 8（BALANCE §3：一波 8 只，75 秒）
// 3. 死亡处理：battle 只打 deathCleanup 标记；session 消费标记 → 重开本波（怪清空，不推进 wave）
import fs from 'node:fs';

const p = 'src/core/session.ts';
let c = fs.readFileSync(p, 'utf8');

function repl(old, neu, tag) {
  if (!c.includes(old)) {
    console.error('MISS: ' + tag);
    process.exit(1);
  }
  c = c.split(old).join(neu);
}

// ── WAVE_SIZE 3 → 8 ──
repl(
  `/** 一波几只普通怪 */
export const WAVE_SIZE = 3;`,
  `/** 一波几只普通怪（BALANCE §3：一波 8 只，目标 75 秒） */
export const WAVE_SIZE = 8;`,
  'wave-size',
);

// ── GameSession：tier → floor ──
repl(
  `  /** 当前阶（1~3）。打完该阶镇守进下一阶 */
  tier: 1 | 2 | 3;`,
  `  /** 当前层（1~27，每层一条怪表索引；每 3 层换一阶的怪表） */
  floor: number;
  /** 本层死亡次数（死亡会重开本波，玩家要看得见自己死了几次） */
  floorDeaths: number;`,
  'floor-field',
);

repl(
  `    wave: 0,
    tier: 1,`,
  `    wave: 0,
    floor: 1,
    floorDeaths: 0,`,
  'floor-init',
);

// ── startWave：spawn 用层数 ──
repl(
  `export function startWave(s: GameSession): void {
  s.wave += 1;
  const tier = s.tier;
  const isBossWave = s.wave % BOSS_EVERY === 0;

  if (isBossWave) {
    const boss = bossOfTier(tier);
    if (boss) {
      s.battle.monsters.push(
        spawnMonster(boss, tier, uidCounter++, BATTLE_W / 2 + 210, BATTLE_H / 2, 'boss'),
      );
      pushLog(s, \`镇守现身：\${boss.name}\`, '#e05a3a');
      return;
    }
  }

  s.battle.monsters.push(
    ...spawnRing(monstersOfTier(tier), tier, WAVE_SIZE, s.rng, uidCounter),
  );
  uidCounter += WAVE_SIZE;
}`,
  `export function startWave(s: GameSession): void {
  s.wave += 1;
  const floor = s.floor;
  const isBossWave = s.wave % BOSS_EVERY === 0;

  if (isBossWave) {
    const boss = bossOfTier(tierOfFloor(floor));
    if (boss) {
      s.battle.monsters.push(
        spawnMonster(boss, floor, uidCounter++, BATTLE_W / 2 + 210, BATTLE_H / 2, 'boss'),
      );
      pushLog(s, \`镇守现身：\${boss.name}\`, '#e05a3a');
      return;
    }
  }

  s.battle.monsters.push(
    ...spawnRing(monstersOfTier(tierOfFloor(floor)), floor, WAVE_SIZE, s.rng, uidCounter),
  );
  uidCounter += WAVE_SIZE;
}`,
  'startwave',
);

// ── 消费 player-died：battle 只打标记，这里负责重开本波 ──
repl(
  `    } else if (e.kind === 'player-died') {
      pushLog(s, '气血枯竭，浊脉重凝', '#e05a3a');
    } else if (e.kind === 'player-kill' && e.monster) {`,
  `    } else if (e.kind === 'player-died') {
      pushLog(s, '气血枯竭，浊脉重凝', '#e05a3a');
      // 死亡 ≠ 清场。旧逻辑里死亡清怪 → isCleared 立即为真 → 白送一波进度，
      // 模拟里 10 分钟死 17 次却推了 27 波。现在：重开本波，不给进度。
      s.battle.deathCleanup = false;
      s.floorDeaths += 1;
      s.battle.monsters = [];
      s.waveTimer = 0;
      startWave(s);
    } else if (e.kind === 'player-kill' && e.monster) {`,
  'death-handling',
);

// ── 波次推进：tier → floor ──
repl(
  `  // 4) 波次推进
  if (isCleared(s.battle)) {
    s.waveTimer += d;
    if (s.waveTimer >= WAVE_GAP) {
      s.waveTimer = 0;
      // 打完镇守进下一阶（第三阶封顶）
      if (s.wave % BOSS_EVERY === 0 && s.tier < 3) {
        s.tier = (s.tier + 1) as 1 | 2 | 3;
        pushLog(s, \`深入第 \${s.tier} 阶秘境\`, '#6b3fa0');
      }
      startWave(s);
    }
  } else {
    s.waveTimer = 0;
  }`,
  `  // 4) 波次推进（死亡重开本波已经把 waveTimer 清零并 startWave 过了，不会走到这里）
  if (isCleared(s.battle)) {
    s.waveTimer += d;
    if (s.waveTimer >= WAVE_GAP) {
      s.waveTimer = 0;
      // 打完镇守下潜 3 层（进入下一阶的怪表）；封顶 27 层
      if (s.wave % BOSS_EVERY === 0 && s.floor < MAX_FLOOR) {
        s.floor = Math.min(MAX_FLOOR, s.floor + 3);
        pushLog(s, \`深入魔渊第 \${s.floor} 层\`, '#6b3fa0');
      }
      startWave(s);
    }
  } else {
    s.waveTimer = 0;
  }`,
  'wave-advance',
);

// ── 掉落：killed.tier 现在存的是层数 ──
repl(
  `      const item = rollMonsterDrop(
        killed.defId,
        clampTier(killed.tier),
        killed.rarity,
        s.rng,
        s.tables,
      );`,
  `      const item = rollMonsterDrop(
        killed.defId,
        tierOfFloor(killed.tier),
        killed.rarity,
        s.rng,
        s.tables,
      );`,
  'drop-tier',
);

// ── clampTier 删除，import 补 tierOfFloor / MAX_FLOOR ──
repl(
  `import { bossOfTier, monstersOfTier } from '../data/monsters';`,
  `import { bossOfTier, monstersOfTier, MAX_FLOOR, tierOfFloor } from '../data/monsters';`,
  'import-monsters',
);

repl(
  `function clampTier(t: number): 1 | 2 | 3 {
  if (!Number.isFinite(t)) return 1;
  if (t >= 3) return 3;
  if (t <= 1) return 1;
  return Math.floor(t) as 1 | 2;
}

`,
  '',
  'clamp-tier-del',
);

fs.writeFileSync(p, c, 'utf8');
console.log('OK all');
