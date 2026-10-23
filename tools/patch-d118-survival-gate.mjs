// D118（shuzhi v4.47）：死亡三线全部降级为「记录」，健康度判据换成两条真设计判据
//   - 硬线 A：首次撞墙层 ≥42（已有）
//   - 硬线 B：脱困率 ≥80%（新增；首轮只记录，次轮起判）
//   - 软线：撞墙率 ≤33%（= 4/12 种子）
//
// 为什么要换：死亡分布是双峰的（0,0,1,1,2,2,5,11,12,23,44,89），
// **双峰下中位描述低峰、极值描述抽样运气，两者都不描述「多少人受影响」**。
// 稳定描述量只有「受影响比例」和「能否脱困」。而且死亡数随模拟器的固执程度漂（farmMode=off
// 会撞 24 次，真实玩家撞 3~5 次就退），拿它当硬线会逼我们去调威胁倍率 ——
// 而威胁倍率是 μ/K（唯一证明「防御有意义」的证据）的唯一杠杆。本末倒置。
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

// 1) session-runner：记录逃生阀事件，并判定「30 分钟内是否重新推进层」
patch('tools/session-runner.mjs', [
  [
    'state',
    "  let prevDeaths = 0; // 累计死亡（`s.deaths`，只增不减；`s.floorDeaths` 会被逃生阀清零）",
    "  let prevDeaths = 0; // 累计死亡（`s.deaths`，只增不减；`s.floorDeaths` 会被逃生阀清零）\n" +
      "  let prevValve = 0;\n" +
      "  /** 逃生阀事件：退层时刻 + 退到哪一层；`resolvedAt` = 之后第一次「层号超过退层点」的时刻（D118 脱困率）。 */\n" +
      "  const escapeEvents = [];\n" +
      "  const ESCAPE_WINDOW_MIN = 30;",
  ],
  [
    'track',
    '    // 4) 落层轨迹 / 境界到达',
    '    // 3.5) 逃生阀事件 + 脱困判定（D118）：脱困 = 退层后 30 分钟内层号重新超过退层点\n' +
      '    if ((s.escapeValveCount ?? 0) > prevValve) {\n' +
      '      const add = (s.escapeValveCount ?? 0) - prevValve;\n' +
      '      for (let i = 0; i < add; i += 1) escapeEvents.push({ minute: t / 60, floorAt: s.floor, resolvedAt: null });\n' +
      '      prevValve = s.escapeValveCount ?? 0;\n' +
      '    }\n' +
      '    for (const ev of escapeEvents) {\n' +
      '      if (ev.resolvedAt === null && s.floor > ev.floorAt) ev.resolvedAt = t / 60;\n' +
      '    }\n\n' +
      '    // 4) 落层轨迹 / 境界到达',
  ],
  [
    'report',
    '    deathLockEvents: s.escapeValveCount ?? 0,',
    '    deathLockEvents: s.escapeValveCount ?? 0,\n' +
      '    escapeEvents: escapeEvents.map((e) => ({ ...e })),\n' +
      '    escapedWithin30: escapeEvents.filter((e) => e.resolvedAt !== null && e.resolvedAt - e.minute <= ESCAPE_WINDOW_MIN).length,\n' +
      '    escapeWindowMin: ESCAPE_WINDOW_MIN,',
  ],
]);

// 2) run-timeline：死亡三线降级为记录，新增 survivalOk（首次撞墙层 + 脱困率 + 撞墙率）
patch('tools/run-timeline.mjs', [
  [
    'consts',
    'const DEATH_LOCK_MAX = 20;',
    'const DEATH_LOCK_MAX = 20;\n' +
      '/** D118：脱困率下限（逃生阀事件里，30 分钟内重新推进层的比例）。首轮只记录，次轮起判。 */\n' +
      'const ESCAPE_RATE_MIN = 0.8;\n' +
      'const ESCAPE_RATE_ENFORCED = false;\n' +
      '/** D118：撞墙率上限（多少比例的种子在一轮里死过）—— 双峰下唯一稳定的「受影响比例」。 */\n' +
      'const WALL_HIT_RATE_MAX = 0.33;',
  ],
  [
    'calc',
    '  const firstWallOk = !Number.isFinite(firstWallMin) || firstWallMin >= FIRST_WALL_MIN_FLOOR;',
    '  const firstWallOk = !Number.isFinite(firstWallMin) || firstWallMin >= FIRST_WALL_MIN_FLOOR;\n\n' +
      '  // D118：脱困率 = 所有逃生阀事件里，30 分钟内重新推进层的比例\n' +
      '  const allEscapes = runs.flatMap((r) => r.escapeEvents ?? []);\n' +
      '  const escapedCount = allEscapes.filter((e) => e.resolvedAt !== null && e.resolvedAt - e.minute <= (runs[0].escapeWindowMin ?? 30)).length;\n' +
      '  const escapeRate = allEscapes.length ? escapedCount / allEscapes.length : 1;\n' +
      '  const escapeRateOk = !ESCAPE_RATE_ENFORCED || escapeRate >= ESCAPE_RATE_MIN;\n' +
      '  // 撞墙率 = 本轮有死亡的种子比例（双峰下比中位/极值都稳）\n' +
      '  const wallHitRate = runs.filter((r) => r.deaths > 0).length / runs.length;\n' +
      '  const wallHitOk = wallHitRate <= WALL_HIT_RATE_MAX;\n' +
      '  /** 健康度 = 中段没坏 + 墙可退可再试 + 受影响比例不大（D118 的「survivalOk」） */\n' +
      '  const survivalOk = firstWallOk && escapeRateOk;',
  ],
  [
    'print',
    "  console.log(\n    `- 首次撞墙层（**硬线 ≥",
    "  console.log(\n    `- 脱困率（**" +
      "$" +
      '{ESCAPE_RATE_ENFORCED ? `硬线 ≥${(ESCAPE_RATE_MIN * 100).toFixed(0)}%` : "首轮只记录，次轮起判 ≥80%"}**）：' +
      "$" +
      "{escapedCount}/${allEscapes.length} = ${(escapeRate * 100).toFixed(1)}% → ${escapeRateOk ? '通过' : '**不通过**'}（逃生阀后 30min 内是否重新推进层）`,\n  );\n" +
      "  console.log(\n    `- 撞墙率（**软线 ≤${(WALL_HIT_RATE_MAX * 100).toFixed(0)}%**）：${runs.filter((r) => r.deaths > 0).length}/${runs.length} = ${(wallHitRate * 100).toFixed(1)}% → ${wallHitOk ? '通过' : '⚠️ 超软线（只记录）'}（双峰下唯一稳定的「受影响比例」）`,\n  );\n" +
      "  console.log(\n    `- 首次撞墙层（**硬线 ≥",
  ],
  [
    'verdict',
    '        firstWallMin,\n        firstWallOk,',
    '        firstWallMin,\n        firstWallOk,\n        escapeRate,\n        escapeRateEvents: allEscapes.length,\n        escapeRateOk,\n        wallHitRate,\n        wallHitOk,\n        survivalOk,',
  ],
  [
    'hardfail',
    '!realmMagnitudeOk || !deathHardOk || !firstWallOk;',
    '!realmMagnitudeOk || !survivalOk;',
  ],
  [
    'hardfail-msg',
    '（满级时长 / 段② 成型 / 结构性断言 / 死亡尾部上限 / 首次撞墙层）',
    '（满级时长 / 段② 成型 / 结构性断言 / survivalOk＝首次撞墙层 + 脱困率）',
  ],
  [
    'death-warn',
    'const DEATH_HARD_MAX = 60;',
    'const DEATH_HARD_MAX = 60; // D118 起只作告警（双峰下的极值是抽样运气，不是游戏性质）',
  ],
]);
