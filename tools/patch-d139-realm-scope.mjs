// D139：周目 ≥ 1 时九境病理线的目标是「REALM_SHAPE_RATIO × 该轮自己的满级中位」，
// 而不是 × c0 的 260 —— 否则每一境都判成 2× 病理（c3 实测 8.98h，全部超差）。
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve('.');
const p = 'tools/run-timeline.mjs';
const raw = fs.readFileSync(path.join(ROOT, p), 'utf8');
const crlf = raw.includes('\r\n');
let t = raw.replace(/\r\n/g, '\n');

const oldHead = '  const realmMagnitudeTail = [];';
if (!t.includes(oldHead)) throw new Error('MISS head');
t = t.replace(
  oldHead,
  [
    '  // D139：九境病理线的目标基数 —— c0 用设计目标 260，周目用**本轮自己的满级中位**。',
    '  // 理由（同 D129/D138）：坐境目标是「总时长 × 形状」，总时长在周目里天然变大，',
    '  // 拿 c0 的 260 去套 c3 的 538.8 会让每一境都判成病理（实测 12 种子全红，纯基数错）。',
    '  const realmTotalForShape = CYCLE === 0 ? TARGET_MAX_MINUTES : maxedMed;',
    '  const TARGET_REALM_MINUTES_SCOPED = REALM_SHAPE_RATIO.map((r) => Math.round(r * realmTotalForShape));',
    '  const realmMagnitudeTail = [];',
  ].join('\n'),
);

const oldTarget = '      const target = TARGET_REALM_MINUTES[j - 1];';
if (!t.includes(oldTarget)) throw new Error('MISS target');
t = t.replace(oldTarget, '      const target = TARGET_REALM_MINUTES_SCOPED[j - 1];');

const oldPrev = '        const prevTarget = j > 1 ? TARGET_REALM_MINUTES[j - 2] : 0;';
if (!t.includes(oldPrev)) throw new Error('MISS prev');
t = t.replace(oldPrev, '        const prevTarget = j > 1 ? TARGET_REALM_MINUTES_SCOPED[j - 2] : 0;');

if (t.length < raw.length) throw new Error('SHRINK');
fs.writeFileSync(path.join(ROOT, p), crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
console.log(`patched ${p}`);
