// D122：段④ 主口径 46 → 76（带「停留 <60min ⇒ 样本不足」护栏）+ 最优刷层诊断列 + 76/46 产出比 + 伤害构成
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'F:\\dsh-work\\zhuoxian\\tools\\run-timeline.mjs';
const raw = readFileSync(P, 'utf8');
const crlf = raw.includes('\r\n');
let t = raw.replace(/\r\n/g, '\n');

const edits = [
  [
    'header',
    "    console.log('| 种子 | 满级后(min) | 仙品件数 | 其中旗子 | 数值传奇 | 层46停留(min) | 仙品/3h(层46) | 旧口径/3h | 数值 : 旗子 |');",
    "    console.log('| 种子 | 满级后(min) | 仙品件数 | 其中旗子 | 数值传奇 | 末层停留(min) | 仙品/3h(末层) | 最优刷层 | 旧口径/3h | 数值 : 旗子 |');",
  ],
  [
    'row',
    [
      '        `| ${r.seed} | ${f(pc.minutes, 1)} | ${pc.xian} | ${pc.flagXian} | ${num} | ` +',
      "          `${f(pc.f46Minutes ?? 0, 1)} | ${Number.isFinite(pc.xianPer3hAtF46) ? f(pc.xianPer3hAtF46, 1) : '—'} | ` +",
      "          `${pc.minutes > 0 ? f((pc.xian / pc.minutes) * 180, 1) : '—'} | ${ratio} |`,",
    ].join('\n'),
    [
      '        `| ${r.seed} | ${f(pc.minutes, 1)} | ${pc.xian} | ${pc.flagXian} | ${num} | ` +',
      "          `${topStay && topStay.minutes >= MIN_STAY_MINUTES ? f(topStay.minutes, 1) : `${f(topStay ? topStay.minutes : 0, 1)}⚠️`} | ` +",
      "          `${topStay && topStay.minutes >= MIN_STAY_MINUTES ? f(topStay.per3h, 1) : '样本不足'} | ` +",
      "          `${bestStay ? `层${bestStay.floor}(${f(bestStay.per3h, 1)})` : '—'} | ` +",
      "          `${pc.minutes > 0 ? f((pc.xian / pc.minutes) * 180, 1) : '—'} | ${ratio} |`,",
    ].join('\n'),
  ],
  [
    'row-compute',
    [
      '      const pc = r.postCap ?? { minutes: 0, xian: 0, flagXian: 0 };',
      '      const num = Math.max(0, pc.xian - pc.flagXian);',
    ].join('\n'),
    [
      '      const pc = r.postCap ?? { minutes: 0, xian: 0, flagXian: 0 };',
      '      const num = Math.max(0, pc.xian - pc.flagXian);',
      '      // D122：末层（MAX_FLOOR）停留口径；样本 <60min 记「样本不足」，不给数（防第二个「窗口截断假数」）',
      '      const stay = pc.stayByFloor ?? [];',
      '      const topStay = stay.find((x) => x.floor >= MAX_FLOOR) ?? stay[stay.length - 1];',
      '      const qualified = stay.filter((x) => x.minutes >= MIN_STAY_MINUTES && Number.isFinite(x.per3h));',
      '      const bestStay = qualified.length ? qualified.reduce((a, b) => (b.per3h > a.per3h ? b : a)) : null;',
    ].join('\n'),
  ],
  [
    'constants',
    '    console.log(\'\');\n    console.log(\'## 表 2d · 段④ 产出（满级后的**仙品件数**，D63 口径：6 数值 : 3 旗子 = 2:1）\');',
    '    console.log(\'\');\n    console.log(\'## 表 2d · 段④ 产出（满级后的**仙品件数**，D63 口径：6 数值 : 3 旗子 = 2:1）\');\n' +
      '    console.log(`> **D122 主口径改末层（层 ${MAX_FLOOR}）**：护栏 = 该层停留 <${MIN_STAY_MINUTES}min 记「样本不足」不给数；「最优刷层」只是诊断列（跨种子不可比），不替换主口径。`);',
  ],
];

for (const [tag, oldT, newT] of edits) {
  if (t.includes(newT)) continue;
  const hits = t.split(oldT).length - 1;
  if (hits !== 1) throw new Error(`[${tag}] 命中 ${hits} 次`);
  t = t.replace(oldT, newT);
}

// MIN_STAY_MINUTES 常量：放在 REALM_PATHOLOGY_MUL 之后（同一顶层作用域）
const anchor = 'const REALM_PATHOLOGY_MUL = 2;';
if (!t.includes('const MIN_STAY_MINUTES')) {
  if (!t.includes(anchor)) throw new Error('MISS pathology const');
  t = t.replace(anchor, anchor + '\n/** D122：段④ 末层产出必须有的最小样本（分钟）——低于此只写「样本不足」。 */\nconst MIN_STAY_MINUTES = 60;');
}

writeFileSync(P, crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
console.log('ok', raw.length, '→', t.length);
