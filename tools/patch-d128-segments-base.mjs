// D128：`_segments.mjs` 的四段下界基数写死 300（D83 时代），而 run-timeline 的满级目标已改 260（D124）
// ⇒ 四段判据用的是过期基数（二阶 31.4 < 32 假红、28→满级 148.2 < 159 假红）。
// 修法：单一来源 —— run-timeline 把 `TARGET_MAX_MINUTES` 写进 verdict JSON，_segments 从 JSON 读；
// 读不到才回退到源码正则；两者都没有才报错（不许静默用旧值）。
import { readFileSync, writeFileSync } from 'node:fs';

// ① run-timeline：verdict 里加 targetMaxMinutes
const TL = 'F:\\dsh-work\\zhuoxian\\tools\\run-timeline.mjs';
let t = readFileSync(TL, 'utf8');
const tlCrlf = t.includes('\r\n');
const tlRaw = t;
t = t.replace(/\r\n/g, '\n');
if (!t.includes('targetMaxMinutes: TARGET_MAX_MINUTES,')) {
  const anchor = '  pass,';
  if (!t.includes(anchor)) throw new Error('MISS run-timeline pass anchor');
  t = t.replace(anchor, '  pass,\n    targetMaxMinutes: TARGET_MAX_MINUTES, // D128：四段下界基数的单一来源');
  writeFileSync(TL, tlCrlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
  console.log('run-timeline ok', tlRaw.length, '→', t.length);
} else {
  console.log('run-timeline 已含 targetMaxMinutes，跳过');
}

// ② _segments：基数改从 JSON 读
const SG = 'F:\\dsh-work\\zhuoxian\\tools\\_segments.mjs';
let s = readFileSync(SG, 'utf8');
const sgCrlf = s.includes('\r\n');
const sgRaw = s;
s = s.replace(/\r\n/g, '\n');

const oldLine = 'const TARGET_MAX_MINUTES = 300;';
if (!s.includes(oldLine)) throw new Error('MISS segments TARGET line');
const newBlock = [
  '// D128：基数不许再写死 —— 从 run-timeline 的 verdict 里读（单一来源）。',
  'const TARGET_MAX_MINUTES = (() => {',
  '  const fromJson = Number(j.verdict?.targetMaxMinutes);',
  '  if (Number.isFinite(fromJson) && fromJson > 0) return fromJson;',
  '  // 兼容老 JSON（没有该字段）：从源码读常量，而不是猜 300。',
  '  const src = readFileSync(new URL("./run-timeline.mjs", import.meta.url), "utf8");',
  '  const m = /const TARGET_MAX_MINUTES = (\\d+)/.exec(src);',
  '  if (!m) throw new Error("取不到满级目标（JSON 与源码都没有）—— 拒绝用旧基数静默判定");',
  '  return Number(m[1]);',
  '})();',
].join('\n');
s = s.replace(oldLine, newBlock);

// 打印基数的说明行（若有）也带上来源
s = s.replace('const BAND_RATIO = [0.09, 0.105, 0.105, 0.53];',
  'const BAND_RATIO = [0.09, 0.105, 0.105, 0.53];\nconsole.log(`# 四段下界基数=${TARGET_MAX_MINUTES}min（D128：从 verdict 读，随满级目标自动走）`);');

writeFileSync(SG, sgCrlf ? s.replace(/\n/g, '\r\n') : s, 'utf8');
console.log('segments ok', sgRaw.length, '→', s.length);
