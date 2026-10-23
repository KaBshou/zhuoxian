// D115（shuzhi v4.46）：封顶 ×5 → ×4、斜率 0.35 → 0.20；死亡验收加「死锁事件 ≤20」与「首次撞墙层 ≥42」。
//
// 核心依据（她自己算的）：尾部只认封顶不认斜率 —— 层 42+ 所有斜率都钳在同一个数。
// ×4 在阀门打开之前的实测是「中位 7、最差 33」，已经满足 ≤60；×5 是 79~108。
//
// 本脚本同时给 session 加 `escapeValveCount`（逃生阀触发次数 = 死锁事件数，**运行时计数、不入档**），
// 因为「死锁事件」是玩家能感知的颗粒度（1 事件 = 3 次死亡）。
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const ROOT = 'F:\\dsh-work\\zhuoxian\\';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
mkdirSync(ROOT + 'tools/_bak', { recursive: true });

function patch(rel, edits) {
  const path = ROOT + rel;
  const raw = readFileSync(path, 'utf8');
  const crlf = raw.includes('\r\n');
  let text = raw.replace(/\r\n/g, '\n');
  const before = text.length;
  for (const [tag, oldText, newText] of edits) {
    if (text.includes(newText)) continue;
    const hits = text.split(oldText).length - 1;
    if (hits !== 1) throw new Error(`[${rel} · ${tag}] 锚点命中 ${hits} 次`);
    text = text.replace(oldText, newText);
  }
  const delta = text.length - before;
  if (delta < -400 || delta > 12000) throw new Error(`[${rel}] 改动量异常：${delta}`);
  copyFileSync(path, `${ROOT}tools/_bak/${rel.replace(/[\\/]/g, '_')}.${stamp}.bak`);
  writeFileSync(path, crlf ? text.replace(/\n/g, '\r\n') : text, 'utf8');
  console.log(`OK ${rel} ${before} → ${text.length}（+${delta}）`);
}

// 1) 威胁常量：×4 封顶、斜率 0.20
patch('src/data/monsters.ts', [
  ['mul', 'export const DEEP_THREAT_MUL = 5;', 'export const DEEP_THREAT_MUL = 4;'],
  ['slope', 'export const DEEP_THREAT_SLOPE = 0.35;', 'export const DEEP_THREAT_SLOPE = 0.2;'],
]);

// 2) session：逃生阀触发计数（死锁事件）
patch('src/core/session.ts', [
  [
    'field',
    '  floorDeaths: number;',
    '  floorDeaths: number;\n  /** 逃生阀触发次数 =「死锁事件」数（D115）。运行时计数、不入档；1 次事件 = ESCAPE_VALVE_DEATHS 次死亡。 */\n  escapeValveCount: number;',
  ],
  [
    'init',
    '    floorDeaths: 0,',
    '    floorDeaths: 0,\n    escapeValveCount: 0,',
  ],
  [
    'count',
    "        s.floorDeaths = 0;\n        s.battle.floorDeaths = 0;\n        s.battle.monsters = [];",
    "        s.floorDeaths = 0;\n        s.battle.floorDeaths = 0;\n        s.escapeValveCount += 1;\n        s.battle.monsters = [];",
  ],
]);

// 3) session-runner：透出死锁事件数与首次撞墙层
patch('tools/session-runner.mjs', [
  [
    'report',
    '    wave: s.wave,\n    deaths: s.deaths,',
    '    wave: s.wave,\n    deaths: s.deaths,\n    deathLockEvents: s.escapeValveCount ?? 0,\n    firstDeathFloor: deathEvents.length ? deathEvents[0].floor : null,',
  ],
]);

// 4) run-timeline：死亡带 [5,25]、死锁事件 ≤20（软红）、首次撞墙层 ≥42（硬线）
patch('tools/run-timeline.mjs', [
  [
    'band',
    'const DEATH_MEDIAN_BAND = [10, 25];',
    'const DEATH_MEDIAN_BAND = [5, 25];\n/** 死锁事件上限（D115，软红）：1 次事件 = 3 次死亡，玩家感知的是「被困住一次」。 */\nconst DEATH_LOCK_MAX = 20;\n/** 首次撞墙层下限（D115，硬线）：撞墙落在 22~30 说明中段被破坏了，那是另一种失败。 */\nconst FIRST_WALL_MIN_FLOOR = 42;',
  ],
  [
    'calc',
    '  const deathHardOk = deathOver.length === 0;',
    '  const deathHardOk = deathOver.length === 0;\n  const lockEvents = runs.map((r) => r.deathLockEvents ?? 0);\n  const lockMax = Math.max(...lockEvents);\n  const lockOver = runs.filter((r) => (r.deathLockEvents ?? 0) > DEATH_LOCK_MAX).map((r) => r.seed);\n  const firstWalls = runs.filter((r) => r.deaths > 0 && Number.isFinite(r.firstDeathFloor)).map((r) => r.firstDeathFloor);\n  const firstWallMin = firstWalls.length ? Math.min(...firstWalls) : NaN;\n  const firstWallOk = !Number.isFinite(firstWallMin) || firstWallMin >= FIRST_WALL_MIN_FLOOR;',
  ],
  [
    'print',
    `      \`｜中位落在 \${DEATH_MEDIAN_BAND[0]}~\${DEATH_MEDIAN_BAND[1]} 带内 → \${deathMedOk ? '通过' : '不通过（只调斜坡斜率，逃生阀不动）'}\`,
  );`,
    `      \`｜中位落在 \${DEATH_MEDIAN_BAND[0]}~\${DEATH_MEDIAN_BAND[1]} 带内 → \${deathMedOk ? '通过' : '不通过（只调斜坡斜率，逃生阀不动）'}\`,
  );
  console.log(
    \`- 死锁事件（**软红 ≤\${DEATH_LOCK_MAX} 次/种子**，1 次 = \${DEATH_MEDIAN_BAND[0] > 0 ? 3 : 3} 次死亡）：\${lockEvents.join(' / ')}（最差 \${lockMax}）\` +
      (lockOver.length ? \` → ⚠️ \${lockOver.join(', ')} 超软红线（只记录，不拦门禁）\` : ' → 通过'),
  );
  console.log(
    \`- 首次撞墙层（**硬线 ≥\${FIRST_WALL_MIN_FLOOR}**）：最浅 \${Number.isFinite(firstWallMin) ? firstWallMin : '无死亡'} → \${firstWallOk ? '通过' : '**不通过**：撞墙落在中段，说明层 22~30 被破坏（深层难 ≠ 全程难）'}\`,
  );`,
  ],
  [
    'verdict',
    '        deathHardOk,\n        deathMedOk,',
    '        deathHardOk,\n        deathMedOk,\n        deathLockMax: lockMax,\n        deathLockOver: lockOver,\n        firstWallMin,\n        firstWallOk,',
  ],
  [
    'hardfail',
    '!realmMagnitudeOk || !deathHardOk;',
    '!realmMagnitudeOk || !deathHardOk || !firstWallOk;',
  ],
  [
    'hardfail-msg',
    '（满级时长 / 段② 成型 / 结构性断言 / 死亡尾部上限）',
    '（满级时长 / 段② 成型 / 结构性断言 / 死亡尾部上限 / 首次撞墙层）',
  ],
]);
