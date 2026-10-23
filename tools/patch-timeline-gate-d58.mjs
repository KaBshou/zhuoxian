// 一次性：满级验收拆两条门禁（D58 shuzhi 判据）
//   主门禁：3 种子中位 ∈ 406 ±15%
//   副红线：任一种子 ≥ 325min（−20%）
// 理由：种子散布 17.8% 比窗口半宽 15% 还大，只判中位会让「单种子出窗」静默通过；
// 只判逐种子又会把噪声当错误。两条一起才能既容忍抖动、又不放跑真位移。
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/tools/run-timeline.mjs';
const raw = fs.readFileSync(p, 'utf8');
const crlf = raw.includes('\r\n');
let c = raw.replace(/\r\n/g, '\n');
const before = c.length;

const repl = (oldText, newText, tag) => {
  if (!c.includes(oldText)) throw new Error(`MISS ${tag}`);
  c = c.replace(oldText, newText);
};

repl(
  "  const dev = (maxedMed - TARGET_MAX_MINUTES) / TARGET_MAX_MINUTES;\n  const pass = allMaxed && Math.abs(dev) <= TARGET_TOLERANCE;",
  [
    '  const dev = (maxedMed - TARGET_MAX_MINUTES) / TARGET_MAX_MINUTES;',
    '  // 主门禁：中位进窗口。副红线：任一种子不得跌破 325min（−20%）。',
    '  // 只判中位会放跑「一个种子严重偏差、另两个刚好偏高」的情况（本轮 337.1 就是），',
    '  // 只判逐种子又会把 9~18% 的种子噪声当错误 —— 两条一起才是校准过的判据。',
    '  const FLOOR_MIN_MINUTES = 325;',
    '  const worstMaxed = maxedRuns.length ? Math.min(...maxedRuns.map((r) => r.maxedAt)) : NaN;',
    '  const floorOk = Number.isFinite(worstMaxed) && worstMaxed >= FLOOR_MIN_MINUTES;',
    '  const pass = allMaxed && Math.abs(dev) <= TARGET_TOLERANCE && floorOk;',
  ].join('\n'),
  'gate',
);

repl(
  "  console.log(`# 判据：满级 ${TARGET_MAX_MINUTES}min ±${Math.round(TARGET_TOLERANCE * 100)}%；九境到达 ±${Math.round(REALM_TOLERANCE * 100)}%；死亡数单独报`);",
  [
    '  console.log(`# 判据：满级中位 ${TARGET_MAX_MINUTES}min ±${Math.round(TARGET_TOLERANCE * 100)}%（主门禁）；最差种子 ≥ ${FLOOR_MIN_MINUTES}min（副红线）；九境到达 ±${Math.round(REALM_TOLERANCE * 100)}%；死亡数单独报`);',
  ].join('\n'),
  'header',
);

repl(
  "      `（目标 ${TARGET_MAX_MINUTES} ±${Math.round(TARGET_TOLERANCE * 100)}%，偏差 ${f(dev * 100, 1)}%）`,",
  [
    '      `（目标 ${TARGET_MAX_MINUTES} ±${Math.round(TARGET_TOLERANCE * 100)}%，偏差 ${f(dev * 100, 1)}%）` +',
    '      `｜副红线：最差种子 ${f(worstMaxed, 1)}min ${floorOk ? \'>=\' : \'<\'} ${FLOOR_MIN_MINUTES}min → ${floorOk ? \'通过\' : \'**不通过**\'}`(),',
  ].join('\n'),
  'line',
);

repl(
  "    verdict: { pass, allMaxed, maxedMin, maxedMed, maxedMax, dev, deaths: totalDeaths },",
  "    verdict: { pass, allMaxed, maxedMin, maxedMed, maxedMax, dev, floorMin: worstMaxed, floorLimit: FLOOR_MIN_MINUTES, floorOk, deaths: totalDeaths },",
  'verdict',
);

fs.writeFileSync(p, crlf ? c.replace(/\n/g, '\r\n') : c, 'utf8');
console.log(`ok crlf=${crlf} ${before} -> ${c.length}`);
