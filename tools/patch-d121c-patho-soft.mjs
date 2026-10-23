// D121 补充：逐种子 >2× 的种子数（只记录 + 软线 ≤3/12）
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'F:\\dsh-work\\zhuoxian\\tools\\run-timeline.mjs';
const raw = readFileSync(P, 'utf8');
const crlf = raw.includes('\r\n');
let t = raw.replace(/\r\n/g, '\n');

if (!t.includes('pathoSeedsOver')) {
  const anchor = '  const pathoWorstRealm = pathoByRealm.reduce((a, b) => (b.med > a.med ? b : a), pathoByRealm[0]);';
  if (!t.includes(anchor)) throw new Error('MISS worst');
  t = t.replace(
    anchor,
    anchor +
      [
        '',
        '  // D121 补充（shuzhi）：逐种子 >2× 的种子数 —— 只记录 + 软线 ≤3/12，让尾部走向「不被看但不消失」。',
        '  const PATHO_SOFT_SEEDS = 3;',
        '  const pathoSeedsOver = runs.filter((r) => {',
        '    for (let j = 1; j <= REALM_COUNT; j++) {',
        '      const at = j < REALM_COUNT ? r.realmArrivals[j] : r.maxedAt;',
        '      const prev = j > 1 ? r.realmArrivals[j - 1] : 0;',
        '      const prevTarget = j > 1 ? TARGET_REALM_MINUTES[j - 2] : 0;',
        '      const tgtDur = TARGET_REALM_MINUTES[j - 1] - prevTarget;',
        '      if (Number.isFinite(at) && Number.isFinite(prev) && tgtDur > 0 && (at - prev) / tgtDur > REALM_PATHOLOGY_MUL) return true;',
        '    }',
        '    return false;',
        '  }).length;',
        '  const pathoSoftOk = pathoSeedsOver <= PATHO_SOFT_SEEDS;',
      ].join('\n'),
  );
}

const printAnchor = '×、最差种子 ${pathoWorstRealm ? f(pathoWorstRealm.worst, 2) : "—"}×）` +';
if (!t.includes('单境 >2× 的种子')) {
  if (!t.includes(printAnchor)) throw new Error('MISS print');
  t = t.replace(
    printAnchor,
    printAnchor +
      '\n      `｜单境 >2× 的种子：**${pathoSeedsOver}/${runs.length}**（软线 ≤${PATHO_SOFT_SEEDS}，只记录）→ ${pathoSoftOk ? \'通过\' : \'⚠️ 超软线\'}` +',
  );
}

writeFileSync(P, crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
console.log('ok', raw.length, '→', t.length);
