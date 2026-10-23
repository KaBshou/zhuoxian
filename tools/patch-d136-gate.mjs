// D136：门禁语义按周目分档（c≥1：撞墙线只记录 + 新增「层 1~9 零死亡」硬线）
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve('.');
const p = 'tools/run-timeline.mjs';
const raw = fs.readFileSync(path.join(ROOT, p), 'utf8');
const crlf = raw.includes('\r\n');
let t = raw.replace(/\r\n/g, '\n');

const oldSurvival = [
  '  const wallHitOk = wallHitRate <= WALL_HIT_RATE_MAX;',
  '  /** 健康度 = 中段没坏 + 墙可退可再试 + 受影响比例不大（D118 的「survivalOk」） */',
  '  const survivalOk = firstWallOk && escapeRateOk;',
].join('\n');

const newSurvival = [
  '  const wallHitOk = wallHitRate <= WALL_HIT_RATE_MAX;',
  '  // D136：周目 > 0 时「首次撞墙层 / 撞墙率」只记录 —— 周目本来就该更难，',
  '  // 但「层 1~9 零死亡」是**渐入是否生效的唯一探针**，必须硬判：',
  '  // 只要渐入没接上、或有人把倍率改回全局，它立刻红，比「死亡中位 18.5」更难辩解。',
  '  const EARLY_FLOOR_MAX = 9;',
  '  const earlyDeathSeeds = runs',
  '    .filter((r) => (r.deathEvents ?? []).some((e) => e.floor <= EARLY_FLOOR_MAX))',
  '    .map((r) => r.seed);',
  '  const earlyDeathOk = CYCLE > 0 ? earlyDeathSeeds.length === 0 : true;',
  '  const wallGateActive = CYCLE === 0;',
  '  const firstWallOkFinal = wallGateActive ? firstWallOk : true;',
  '  /** 健康度 = 中段没坏 + 墙可退可再试 + 受影响比例不大（D118）＋ 周目渐入（D136） */',
  '  const survivalOk = firstWallOkFinal && escapeRateOk && earlyDeathOk;',
].join('\n');

if (!t.includes(oldSurvival)) throw new Error('MISS survival');
t = t.replace(oldSurvival, newSurvival);

const oldVerdict = ['        wallHitOk,', '        survivalOk,'].join('\n');
const newVerdict = [
  '        wallHitOk,',
  '        earlyDeathSeeds,',
  '        earlyDeathOk,',
  '        wallGateActive,',
  '        survivalOk,',
].join('\n');
if (!t.includes(oldVerdict)) throw new Error('MISS verdict');
t = t.replace(oldVerdict, newVerdict);

const anchor = '`- 首次撞墙层（';
const at = t.indexOf(anchor);
if (at < 0) throw new Error('MISS print');
const lineStart = t.lastIndexOf('\n', at) + 1;
const earlyLine = [
  '  console.log(',
  '    `- 周目渐入（**${CYCLE > 0 ? `硬线：层 1~${EARLY_FLOOR_MAX} 零死亡` : \'不适用（c = 0）\'}**）：${',
  '      CYCLE > 0',
  '        ? earlyDeathOk',
  "          ? `0/${runs.length} 个种子在层 1~${EARLY_FLOOR_MAX} 死亡 → 通过`",
  "          : `**${earlyDeathSeeds.length}/${runs.length} 个种子在层 1~${EARLY_FLOOR_MAX} 死亡**（渐入没接上 / 倍率被改回全局）→ 不通过`",
  "        : '初临不判'",
  '    }`,',
  '  );',
  '',
].join('\n');
t = t.slice(0, lineStart) + earlyLine + t.slice(lineStart);

const baseLen = raw.replace(/\r\n/g, '\n').length;
if (t.length < baseLen) throw new Error('SHRINK');
fs.writeFileSync(path.join(ROOT, p), crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
console.log(`patched ${p} (${raw.length} -> ${t.length})`);
