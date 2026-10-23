// 修真 bug：deserialize 逐字段重建 player，漏了 marks → 刷新后渊痕归零
import fs from 'node:fs';

const ROOT = 'F:/dsh-work/zhuoxian';
const p = ROOT + '/src/core/save.ts';
const orig = fs.readFileSync(p, 'utf8');
let c = orig;
fs.writeFileSync(ROOT + '/tools/_bak/save.ts.' + Date.now() + '.bak', orig, 'utf8');

function repl(oldText, newText, tag) {
  const n = c.split(oldText).length - 1;
  if (n !== 1) throw new Error('MISS(' + n + '): ' + tag);
  c = c.replace(oldText, newText);
  console.log('ok:', tag);
}

repl(
  "        talentIds: Array.isArray(p.talentIds) ? (p.talentIds as string[]) : undefined,",
  [
    "        talentIds: Array.isArray(p.talentIds) ? (p.talentIds as string[]) : undefined,",
    '        // 渊痕（D36-A）：deserialize 是逐字段重建的，漏一个字段 = 静默清零。',
    '        // 这条曾经真的漏了（探针「刷新后渊痕还在」红），所以这里宁可按 0 兜底也要显式写出来。',
    '        marks: typeof p.marks === \'number\' && Number.isFinite(p.marks) ? Math.max(0, Math.floor(p.marks)) : 0,',
  ].join('\n'),
  'deserialize-marks',
);

if (c.length < orig.length * 0.98) throw new Error('拒绝写盘');
fs.writeFileSync(p, c, 'utf8');
console.log('flush', c.length, 'B');
