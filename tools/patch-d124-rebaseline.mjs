// D124（shuzhi v4.58）：满级目标 300 → 260、窗口 [235,300]、副红线从绝对值改成比例式（≥0.70×中位）
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'F:\\dsh-work\\zhuoxian\\tools\\run-timeline.mjs';
const raw = readFileSync(P, 'utf8');
const crlf = raw.includes('\r\n');
let t = raw.replace(/\r\n/g, '\n');
const before = t.length;

const edits = [
  ['target', 'const TARGET_MAX_MINUTES = 300;', 'const TARGET_MAX_MINUTES = 260; // D124：300 → 260（「神通轮转快照」修完的正当收益；这是最后一次重标）'],
  ['min', 'const MAX_MIN_MINUTES = 270;', 'const MAX_MIN_MINUTES = 235; // D124：−9.6%'],
  ['max', 'const MAX_MAX_MINUTES = 345;', 'const MAX_MAX_MINUTES = 300; // D124：+15%'],
  [
    'floor',
    'const FLOOR_MIN_MINUTES = 250;',
    [
      '// D124：副红线改比例式 —— 绝对值每次重标都要重算，而它的语义本来就是「防止某个种子快得离谱」，那是比例问题。',
      'const FLOOR_MIN_RATIO = 0.7;',
    ].join('\n'),
  ],
  [
    'floor-ok',
    'const floorOk = Number.isFinite(worstMaxed) && worstMaxed >= FLOOR_MIN_MINUTES;',
    'const floorMinMinutes = Number.isFinite(maxedMed) ? maxedMed * FLOOR_MIN_RATIO : NaN;\n' +
      'const floorOk = Number.isFinite(worstMaxed) && Number.isFinite(floorMinMinutes) && worstMaxed >= floorMinMinutes;',
  ],
  [
    'header',
    "console.log(`# 判据：满级中位 ${TARGET_MAX_MINUTES}min，窗口 [${MAX_MIN_MINUTES}, ${MAX_MAX_MINUTES}]（主门禁）；最差种子 ≥ ${FLOOR_MIN_MINUTES}min（副红线）；九境到达 ±${Math.round(REALM_TOLERANCE * 100)}%；死亡数单独报`);",
    "console.log(`# 判据：满级中位 ${TARGET_MAX_MINUTES}min，窗口 [${MAX_MIN_MINUTES}, ${MAX_MAX_MINUTES}]（主门禁）；最差种子 ≥ ${Math.round(FLOOR_MIN_RATIO * 100)}% × 中位（副红线，D124 比例式）；九境到达 ±${Math.round(REALM_TOLERANCE * 100)}%；死亡数单独报`);",
  ],
];

for (const [tag, oldT, newT] of edits) {
  if (tag === 'summary') continue;
  if (t.includes(newT)) continue;
  const hits = t.split(oldT).length - 1;
  if (hits !== 1) throw new Error(`[${tag}] 命中 ${hits} 次`);
  t = t.replace(oldT, newT);
}

// 副红线打印行（含反引号，单独用字符串拼接替换，避免上面数组里的转义混乱）
const oldSum = '`｜副红线：最差种子 ${f(worstMaxed, 1)}min ${floorOk ? \'>=\' : \'<\'} ${FLOOR_MIN_MINUTES}min → ${floorOk ? \'通过\' : \'**不通过**\'}`';
if (t.includes(oldSum)) {
  const newSum = '`｜副红线（比例式）：最差种子 ${f(worstMaxed, 1)}min ${floorOk ? \'>=\' : \'<\'} ${f(floorMinMinutes, 1)}min（= ${Math.round(FLOOR_MIN_RATIO * 100)}% × 中位）→ ${floorOk ? \'通过\' : \'**不通过**\'}`';
  t = t.replace(oldSum, newSum);
} else {
  console.log('⚠️ 副红线打印行未匹配（不影响门禁，只影响文案）');
}

// verdict 里 floorLimit 改成实际阈值
t = t.replace('floorLimit: FLOOR_MIN_MINUTES,', 'floorLimit: floorMinMinutes,');

writeFileSync(P, crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
console.log('ok', before, '→', t.length);
if (t.includes('FLOOR_MIN_MINUTES')) console.log('⚠️ 仍有 FLOOR_MIN_MINUTES 残留');
