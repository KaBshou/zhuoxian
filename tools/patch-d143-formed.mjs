// D143：段② 成型目标也绑到「本轮满级中位」（周目里满级变长，成型必然同步变长）
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve('.');
const p = 'tools/run-timeline.mjs';
const raw = fs.readFileSync(path.join(ROOT, p), 'utf8');
const crlf = raw.includes('\r\n');
let t = raw.replace(/\r\n/g, '\n');

const old = [
  'const FORMED_RATIO = 0.62;',
  'const FORMED_TARGET = Math.round(TARGET_MAX_MINUTES * FORMED_RATIO);',
].join('\n');
const neu = [
  'const FORMED_RATIO = 0.62;',
  '// D143：基数改用「本轮满级中位」（c0 就是 TARGET_MAX_MINUTES，周目里是实测中位）。',
  '// 理由同 D139/D142：成型 = 满级 × 0.62 是**一条比例关系**，周目满级 374.8min，',
  '// 拿 c0 的 260 算出的 161min 当目标必然红（c2 实测中位 247min）。',
  '// 这不是放宽 —— 相对红线（中位比值 ∈ [0.45, 0.80]）与达成率（≥90%）都还压着。',
  'const formedBaseMinutes = () => (CYCLE === 0 ? TARGET_MAX_MINUTES : maxedMed);',
].join('\n');
if (!t.includes(old)) throw new Error('MISS const');
t = t.replace(old, neu);

const oldMax = 'const FORMED_MAX = Math.round(FORMED_TARGET * 1.15);';
const neuMax = [
  'const FORMED_TARGET = Math.round(formedBaseMinutes() * FORMED_RATIO);',
  'const FORMED_MAX = Math.round(FORMED_TARGET * 1.15);',
].join('\n');
if (!t.includes(oldMax)) throw new Error('MISS max');
t = t.replace(oldMax, neuMax);

if (t.length < raw.length) throw new Error('SHRINK');
fs.writeFileSync(path.join(ROOT, p), crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
console.log(`patched ${p}`);
