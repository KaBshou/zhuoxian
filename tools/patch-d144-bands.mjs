// D144：四段下界跨周目拆两半（shuzhi v4.65）
//   一阶 / 二阶有 CYCLE 渐入（故意改形状）⇒ 周目里只记录，判据只剩量级红线
//   层19→28 / 28→满级 不受渐入影响 ⇒ 可硬判，基数 = 本轮满级中位
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve('.');
const p = 'tools/_segments.mjs';
const raw = fs.readFileSync(path.join(ROOT, p), 'utf8');
const crlf = raw.includes('\r\n');
let t = raw.replace(/\r\n/g, '\n');

const oldTgt = [
  "const BAND_RATIO = [0.09, 0.105, 0.105, 0.53];",
  "console.log(`# 四段下界基数=${TARGET_MAX_MINUTES}min（D128：从 verdict 读，随满级目标自动走）`);",
  "const tgt = ['一阶', '二阶', '层19→28', '层28→满级'].map((name, i) => [",
  '  name,',
  '  Math.round(TARGET_MAX_MINUTES * BAND_RATIO[i]),',
  '  false,',
  ']);',
].join('\n');
const newTgt = [
  'const BAND_RATIO = [0.09, 0.105, 0.105, 0.53];',
  '// D144（shuzhi v4.65）：周目里一阶/二阶的形状被 CYCLE 渐入（D135）**故意改过**，',
  '// 所以它们的比例下界只记录，判据只剩量级红线；后两段（19→28、28→满级）不受渐入影响，',
  '// 基数换成本轮满级中位后照常硬判。',
  '// 收口规则：**被判区间若被某个机制专门改过形状，该区间的判据就只剩量级红线。**',
  'const CYCLE = Number(j.verdict?.cycle ?? 0);',
  'const cycleBase = (() => {',
  '  if (!(CYCLE > 0)) return TARGET_MAX_MINUTES;',
  '  const m = med(j.runs.map((r) => r.maxedAt).filter((x) => Number.isFinite(x)));',
  '  return Number.isFinite(m) && m > 0 ? m : TARGET_MAX_MINUTES;',
  '})();',
  'const SOFT_BANDS = CYCLE > 0 ? [true, true, false, false] : [false, false, false, false];',
  "console.log(`# 四段下界基数=${cycleBase.toFixed(1)}min（D128 从 verdict 读；D144 周目用本轮满级中位）`);",
  "const tgt = ['一阶', '二阶', '层19→28', '层28→满级'].map((name, i) => [",
  '  name,',
  '  Math.round(cycleBase * BAND_RATIO[i]),',
  '  false,',
  '  SOFT_BANDS[i],',
  ']);',
].join('\n');
if (!t.includes(oldTgt)) throw new Error('MISS tgt');
t = t.replace(oldTgt, newTgt);

const oldLoop = [
  'tgt.forEach(([name, floor, pendingBand], i) => {',
].join('\n');
const newLoop = [
  'tgt.forEach(([name, floor, pendingBand, softOnly], i) => {',
].join('\n');
if (!t.includes(oldLoop)) throw new Error('MISS loop');
t = t.replace(oldLoop, newLoop);

const oldVerdict = [
  '  const verdict = !Number.isFinite(v)',
  "    ? '未达成'",
  '    : !magOk',
  "      ? 'FAIL(量级红线)'",
  '      : medOk',
  "        ? 'PASS'",
  '        : pendingBand',
  "          ? `待定红(中位)<${floor}：band 未随满级目标重定，等 shuzhi`",
  "          : 'FAIL(中位)<' + floor;",
].join('\n');
const newVerdict = [
  '  const verdict = !Number.isFinite(v)',
  "    ? '未达成'",
  '    : !magOk',
  "      ? 'FAIL(量级红线)'",
  '      : medOk',
  "        ? 'PASS'",
  '        : softOnly',
  "          ? `记录(中位)<${floor}：周目渐入改了本段形状，只判量级`",
  '          : pendingBand',
  "            ? `待定红(中位)<${floor}：band 未随满级目标重定，等 shuzhi`",
  "            : 'FAIL(中位)<' + floor;",
].join('\n');
if (!t.includes(oldVerdict)) throw new Error('MISS verdict');
t = t.replace(oldVerdict, newVerdict);

if (t.length < raw.length) throw new Error('SHRINK');
fs.writeFileSync(path.join(ROOT, p), crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
console.log(`patched ${p}`);
