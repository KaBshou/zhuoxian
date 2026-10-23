// 一次性：按 shuzhi v4.34 落地
//   ① 九境容差：不按 ±20% 判（7 格全部来自同一颗慢种子 20265073 = 满级出窗种子，判两次不增信息），
//      改「只记录 + ±50% 量级红线」（54 格里最大偏离 34.6%，>50% 0 格；这条线专抓
//      「目标写错 / BREAKTHROUGH_XP 换错数组 / 收入曲线断掉」这类一错两倍的事故）；
//   ② 「满级出窗种子」与「九境超差种子」合并成一行 **尾部种子** 区块（两者同一颗，别报两遍）。
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/tools/run-timeline.mjs';
const raw = fs.readFileSync(p, 'utf8');
const crlf = raw.includes('\r\n');
let c = raw.replace(/\r\n/g, '\n');
const oldN = c.length;

const repl = (a, b, tag) => {
  if (!c.includes(a)) throw new Error(`MISS ${tag}`);
  c = c.replace(a, b);
  console.log(`ok ${tag}`);
};

// ① 常量 + 量级红线
repl(
  'const REALM_TOLERANCE = 0.2;',
  [
    'const REALM_TOLERANCE = 0.2;',
    '// 九境**只记录不判 ±20%**（20265073 一颗慢种子会占掉 7 格，和「满级出窗」是同一现象），',
    '// 但保留一条 ±50% 的**量级红线**：它抓的是「目标写错 / R(k) 换错数组 / 收入曲线断掉」这类',
    '// 一错就是一倍的事故（当前 54 格最大偏离 34.6%，红线 0 触发）。',
    'const REALM_MAGNITUDE_LIMIT = 0.5;',
  ].join('\n'),
  'realm-magnitude-const',
);

// ② 逐种子量级检查（放在九境表之后）
repl(
  "  console.log('');\n  console.log('## 表 2 · 满级（step 80）总时长与产出节奏');",
  [
    '  // 逐种子 × 逐境 的量级检查（只看「一错就是一倍」，不看 ±20% 的正常散布）',
    '  const realmMagnitude = [];',
    '  for (const r of runs) {',
    '    for (let j = 1; j <= REALM_COUNT; j++) {',
    '      const at = j < REALM_COUNT ? r.realmArrivals[j] : r.maxedAt;',
    '      if (!Number.isFinite(at)) continue;',
    '      const target = TARGET_REALM_MINUTES[j - 1];',
    '      if (!(target > 0)) continue;',
    '      const dev = (at - target) / target;',
    '      if (Math.abs(dev) > REALM_MAGNITUDE_LIMIT) {',
    '        realmMagnitude.push({ seed: r.seed, realm: j, at, target, dev });',
    '      }',
    '    }',
    '  }',
    '  const realmMagnitudeOk = realmMagnitude.length === 0;',
    '  console.log(',
    '    `- 九境量级检查（|偏差| ≤ ${Math.round(REALM_MAGNITUDE_LIMIT * 100)}%，**只抓一错一倍**；逐境 ±${Math.round(REALM_TOLERANCE * 100)}% 只记录）→ **${realmMagnitudeOk ? "通过" : "不通过"}**` +',
    '      (realmMagnitudeOk ? "" : `：${realmMagnitude.map((x) => `种子 ${x.seed} 境 ${x.realm} ${f(x.at, 1)}min vs 目标 ${x.target}（${x.dev > 0 ? "+" : ""}${f(x.dev * 100, 1)}%）`).join("；")}`),',
    '  );',
    '',
    "  console.log('');\n  console.log('## 表 2 · 满级（step 80）总时长与产出节奏');",
  ].join('\n'),
  'realm-magnitude-check',
);

// ③ 尾部种子区块：合并「满级出窗」与「九境超差」
const oldTail = c.indexOf('  // 出窗种子只记录不判');
if (oldTail < 0) throw new Error('MISS tail block');
const tailEnd = c.indexOf('  const gradMedAll = med(', oldTail);
if (tailEnd < 0) throw new Error('MISS tail end');
const newTail = [
  '  // **尾部种子**（合并输出）：满级出窗 与 九境超差 通常是同一颗种子（20265073），',
  '  // 分两张表各报一次等于把同一个尾部样本说两遍，还会让人以为是两个问题（shuzhi v4.34）。',
  '  {',
  '    const slow = runs.filter(',
  '      (r) => Number.isFinite(r.maxedAt) && (r.maxedAt < MAX_MIN_MINUTES || r.maxedAt > MAX_MAX_MINUTES),',
  '    );',
  '    const slowRealm = new Set(realmMagnitude.map((x) => x.seed));',
  '    if (slow.length > 0 || slowRealm.size > 0) {',
  '      const seeds = [...new Set([...slow.map((r) => r.seed), ...slowRealm])];',
  '      console.log(',
  '        `- 尾部种子（**只记录，不判**）：` +',
  '          seeds',
  '            .map((s) => {',
  '              const r = runs.find((x) => x.seed === s);',
  '              const m = r && Number.isFinite(r.maxedAt) ? `${f(r.maxedAt, 1)}min` : "未满级";',
  '              const tags = [];',
  '              if (r && Number.isFinite(r.maxedAt) && r.maxedAt > MAX_MAX_MINUTES) tags.push("满级超出窗口上限");',
  '              if (r && Number.isFinite(r.maxedAt) && r.maxedAt < MAX_MIN_MINUTES) tags.push("满级低于窗口下限");',
  '              if (slowRealm.has(s)) tags.push("九境偏离超 ±" + Math.round(REALM_TOLERANCE * 100) + "%（正常散布，只记录）");',
  '              return `${s}（满级 ${m}${tags.length ? "，" + tags.join("、") : ""}）`;',
  '            })',
  '            .join("；") +',
  '          `｜若启用 6 种子协议，满级上限须放到 445min`,',
  '      );',
  '    }',
  '  }',
  '',
].join('\n');
c = c.slice(0, oldTail) + newTail + c.slice(tailEnd);

// ④ 量级红线进硬门禁
repl(
  'const hardFail = !pass || !allMaxed || !formedPassFinal || !structuralOk;',
  'const hardFail = !pass || !allMaxed || !formedPassFinal || !structuralOk || !realmMagnitudeOk;',
  'hardfail',
);

// ⑤ verdict 透出
repl(
  'floorOk, deaths: totalDeaths }',
  'floorOk, realmMagnitudeOk, deaths: totalDeaths }',
  'verdict',
);

if (c.length < oldN - 200) throw new Error(`ASSERT shrank ${oldN} -> ${c.length}`);
fs.mkdirSync('F:/dsh-work/zhuoxian/tools/_bak', { recursive: true });
fs.writeFileSync(`F:/dsh-work/zhuoxian/tools/_bak/run-timeline.before-v434.${Date.now()}.mjs`, raw, 'utf8');
fs.writeFileSync(p, crlf ? c.replace(/\n/g, '\r\n') : c, 'utf8');
console.log(`done ${oldN} -> ${c.length}`);
