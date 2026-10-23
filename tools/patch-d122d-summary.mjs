// D122 收尾：段④ 汇总行改「末层（76）停留产出」主口径，并给出「最优刷层」与「武器段占比」
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'F:\\dsh-work\\zhuoxian\\tools\\run-timeline.mjs';
const raw = readFileSync(P, 'utf8');
const crlf = raw.includes('\r\n');
let t = raw.replace(/\r\n/g, '\n');

const edits = [
  [
    'med',
    '    const xianPer3hAtF46Med = med(runs.map((r) => r.postCap?.xianPer3hAtF46 ?? NaN));',
    [
      '    const xianPer3hAtF46Med = med(runs.map((r) => r.postCap?.xianPer3hAtF46 ?? NaN));',
      '    // D122：末层（MAX_FLOOR）停留产出 —— 只取样本 ≥MIN_STAY_MINUTES 的种子；一个都没有就写「样本不足」',
      '    const topFloorPer3h = runs',
      '      .map((r) => {',
      '        const stay = r.postCap?.stayByFloor ?? [];',
      '        const top = stay.find((x) => x.floor >= MAX_FLOOR) ?? stay[stay.length - 1];',
      '        return top && top.minutes >= MIN_STAY_MINUTES && Number.isFinite(top.per3h) ? top.per3h : NaN;',
      '      })',
      '      .filter((x) => Number.isFinite(x));',
      '    const topFloorPer3hMed = med(topFloorPer3h);',
      '    const splitW = runs.reduce((a, r) => a + (r.damageSplit?.weapon ?? 0), 0);',
      '    const splitS = runs.reduce((a, r) => a + (r.damageSplit?.skill ?? 0), 0);',
      '    const weaponShare = splitW + splitS > 0 ? splitW / (splitW + splitS) : NaN;',
    ].join('\n'),
  ],
  [
    'main-line',
    [
      '      `- 段④ 主口径（**层 46 停留产出**，v4.38 / D81）：仙品 **${Number.isFinite(xianPer3hAtF46Med) ? f(xianPer3hAtF46Med, 1) : \'—\'} 件 / 3h**` +',
      '        `（未到 46 的种子记 "—"，不当 0）`,',
    ].join('\n'),
    [
      '      `- 段④ 主口径（**末层层 ${MAX_FLOOR} 停留产出**，D122）：仙品 **${Number.isFinite(topFloorPer3hMed) ? f(topFloorPer3hMed, 1) : \'样本不足\'} 件 / 3h**` +',
      '        `（样本 = 停留 ≥${MIN_STAY_MINUTES}min 的 ${topFloorPer3h.length}/${runs.length} 个种子；不足的不给数）` +',
      '        `｜伤害构成：武器段 **${Number.isFinite(weaponShare) ? pct(weaponShare) : \'—\'}** / 神通段 ${Number.isFinite(weaponShare) ? pct(1 - weaponShare) : \'—\'}`,',
    ].join('\n'),
  ],
  [
    'hours',
    '    console.log(`- 全仙品（**主口径 层 46 停留产出**）：需 ${f(9 * 2.829, 2)} 件（×H(9)），按上表约 **${Number.isFinite(xianPer3hAtF46Med) && xianPer3hAtF46Med > 0 ? f((9 * 2.829 / xianPer3hAtF46Med) * 3, 0) : \'—\'} 小时**`);',
    '    console.log(`- 全仙品（**主口径 末层停留产出**）：需 ${f(9 * 2.829, 2)} 件（×H(9)），按上表约 **${Number.isFinite(topFloorPer3hMed) && topFloorPer3hMed > 0 ? f((9 * 2.829 / topFloorPer3hMed) * 3, 1) : \'样本不足\'} 小时**`);',
  ],
  [
    'old-line',
    "      `- 段④ 旧混合口径（**不得引用**，分母是窗口长度）：仙品 **${f(xianPer3hMed, 1)} 件 / 3h**；其中旗子占 **${pct(flagShareMed)}**（设计值 33.3%）`,",
    "      `- 段④ 旧混合口径（**不得引用**，分母是窗口长度）：仙品 **${f(xianPer3hMed, 1)} 件 / 3h**；其中旗子占 **${pct(flagShareMed)}**（设计值 33.3%）` +\n        `｜旧「层 46」口径 ${Number.isFinite(xianPer3hAtF46Med) ? f(xianPer3hAtF46Med, 1) : '—'} 件/3h（种子已不再在 46 停留，故此列作废）`,",
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
