// D121 修订：病理线改「中位口径」——单颗被墙种子会把单境耗时推到 2×+，那是「受虐模型」的产物（与死亡数同理）。
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'F:\\dsh-work\\zhuoxian\\tools\\run-timeline.mjs';
const raw = readFileSync(P, 'utf8');
const crlf = raw.includes('\r\n');
let t = raw.replace(/\r\n/g, '\n');

const edits = [
  [
    'if-line',
    '      if (pathological || shapeRed) {',
    '      if (pathological) {',
  ],
  [
    'row',
    '        const row = { seed: r.seed, realm: j, at, target, dev, absDev, shape, shapeDev };',
    '        const row = { seed: r.seed, realm: j, at, target, dev, absDev, shape, shapeDev, spent, spentTarget, ratio: spent / spentTarget };',
  ],
  [
    'ok',
    '  const realmMagnitudeOk = realmMagnitude.length === 0;',
    [
      '  // D121（修订）：病理线按**多种子中位**判 —— 单颗被墙种子会把单境耗时推到 2×+（「受虐模型」的产物，',
      '  // 与死亡数同理）；真正要抓的「某境系统性卡死」只有中位能表达。逐种子 >2× 只记录。',
      '  const pathoByRealm = [];',
      '  for (let j = 1; j <= REALM_COUNT; j++) {',
      '    const ratios = [];',
      '    for (const r of runs) {',
      '      const at = j < REALM_COUNT ? r.realmArrivals[j] : r.maxedAt;',
      '      const prev = j > 1 ? r.realmArrivals[j - 1] : 0;',
      '      const prevTarget = j > 1 ? TARGET_REALM_MINUTES[j - 2] : 0;',
      '      const tgtDur = TARGET_REALM_MINUTES[j - 1] - prevTarget;',
      '      if (Number.isFinite(at) && Number.isFinite(prev) && tgtDur > 0) ratios.push((at - prev) / tgtDur);',
      '    }',
      '    if (ratios.length) pathoByRealm.push({ realm: j, med: med(ratios), worst: Math.max(...ratios) });',
      '  }',
      '  const pathoWorstRealm = pathoByRealm.reduce((a, b) => (b.med > a.med ? b : a), pathoByRealm[0]);',
      '  const realmMagnitudeOk = !(pathoWorstRealm && pathoWorstRealm.med > REALM_PATHOLOGY_MUL);',
    ].join('\n'),
  ],
  [
    'print',
    '- 九境病理线（**D121 硬线**：单境耗时 ≤ ${REALM_PATHOLOGY_MUL}× 该境目标；形状偏离 >${Math.round(REALM_SHAPE_TOLERANCE * 100)}% 只记录）→ **${realmMagnitudeOk ? "通过" : "不通过"}**',
    '- 九境病理线（**D121 硬线（中位口径）**：单境耗时中位 ≤ ${REALM_PATHOLOGY_MUL}× 该境目标；逐种子 >2× 与形状偏离 >${Math.round(REALM_SHAPE_TOLERANCE * 100)}% 只记录）→ **${realmMagnitudeOk ? "通过" : "不通过"}**` +\n      `（最差境：境 ${pathoWorstRealm ? pathoWorstRealm.realm : "—"} 中位 ${pathoWorstRealm ? f(pathoWorstRealm.med, 2) : "—"}×、最差种子 ${pathoWorstRealm ? f(pathoWorstRealm.worst, 2) : "—"}×）',
  ],
];

for (const [tag, oldT, newT] of edits) {
  if (t.includes(newT)) continue;
  const hits = t.split(oldT).length - 1;
  if (hits !== 1) throw new Error(`[${tag}] 命中 ${hits} 次`);
  t = t.replace(oldT, newT);
}
writeFileSync(P, crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
console.log('ok', raw.length, '→', t.length);
