// D127（shuzhi v4.59）：段② 补下界 —— 判据原先只判上界（≤185min），装备成型得特别早也全绿，
// 而「段② 太早」意味着玩家还没练到能穿好装就穿完了，段③ 变成纯挂机刷级（那正是段② 定为 6h 的理由）。
// 改成比值带 [0.45, 0.80]，一句话同时管住「太早」和「太晚」。
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'F:\\dsh-work\\zhuoxian\\tools\\run-timeline.mjs';
const raw = readFileSync(P, 'utf8');
const crlf = raw.includes('\r\n');
let t = raw.replace(/\r\n/g, '\n');
const before = t.length;

const edits = [
  [
    'min-const',
    'const FORMED_REL_SOFT_ONLY = true;',
    [
      '// D127：段② 比值带 —— 只判上界时「成型太早」抓不到（判据不对称）。下界 0.45 的语义：',
      '// 段② 必须给段③ 留下一半以上的时间，否则段③ 变成纯挂机刷级。',
      'const FORMED_REL_MEDIAN_MIN = 0.45;',
      'const FORMED_REL_SOFT_ONLY = false; // D127：从「只记录」改为硬判（上下界都拦）',
    ].join('\n'),
  ],
  [
    'band',
    'const formedRelMedOk = Number.isFinite(formedRelMed) && formedRelMed <= FORMED_REL_MEDIAN_MAX;',
    'const formedRelMedOk =\n' +
      '    Number.isFinite(formedRelMed) &&\n' +
      '    formedRelMed <= FORMED_REL_MEDIAN_MAX &&\n' +
      '    formedRelMed >= FORMED_REL_MEDIAN_MIN;',
  ],
  [
    'print',
    '`- 段② 比值（**D119 软线 ≤ ${FORMED_REL_MEDIAN_MAX}，只记录不拦**；硬线是上面的「成型早于满级达成率」；逐种子 ≤ ${FORMED_REL_SEED_MAX} 只打印）：` +',
    '`- 段② 比值（**D127 硬判：中位必须落在 [${FORMED_REL_MEDIAN_MIN}, ${FORMED_REL_MEDIAN_MAX}]**；逐种子 ≤ ${FORMED_REL_SEED_MAX} 只打印）：` +',
  ],
];

for (const [tag, oldT, newT] of edits) {
  if (t.includes(newT)) continue;
  const hits = t.split(oldT).length - 1;
  if (hits !== 1) throw new Error(`[${tag}] 命中 ${hits} 次`);
  t = t.replace(oldT, newT);
}

writeFileSync(P, crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
console.log('ok', before, '→', t.length);
