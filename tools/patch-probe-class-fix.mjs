// 一次性：修 probe-class 的三处「探针自己写错」（不是产品 bug）
// ① 按 Digit6 = 第 6 张 = CLASSES[5] = ruijin，我却断言 houtu（houtu 是 Digit5）
// ② 米白像素阈值 2000 偏高：卡片正文最亮的是 #d8d3c4 但字号 12~18px，实测 1881
// ③ 刷新后那条同样跟着 ① 错
import fs from 'node:fs';

const P = 'F:/dsh-work/tools/probe-class.mjs';
let c = fs.readFileSync(P, 'utf8');
const before = c.length;

function repl(a, b, tag) {
  if (!c.includes(a)) throw new Error('MISS: ' + tag);
  const n = c.split(a).length - 1;
  if (n !== 1) throw new Error(`AMBIGUOUS(${n}): ${tag}`);
  c = c.replace(a, b);
  console.log('OK:', tag);
}

repl(
  `  // 确认第 6 个（厚土宗），验证「选谁就进谁」`,
  `  // 确认第 6 张（ruijin 锐金），验证「选谁就进谁」——
  // 注意数字键是 1-based 而下标是 0-based：Digit6 → CLASSES[5] = ruijin，不是 houtu`,
  'comment',
);

repl(
  `  check('选的道统真的生效（icode = houtu）', st1.classId === 'houtu', \`classId=\${st1.classId}\`);`,
  `  check('选的道统真的生效（Digit6 → ruijin）', st1.classId === 'ruijin', \`classId=\${st1.classId}\`);`,
  'assert-class',
);

repl(
  `  check('刷新后道统还在', st2.classId === 'houtu', \`classId=\${st2.classId}\`);`,
  `  check('刷新后道统还在', st2.classId === 'ruijin', \`classId=\${st2.classId}\`);`,
  'assert-reload',
);

repl(
  `  check('卡片文字画出来了（米白像素）', fp0.pale > 2000, \`pale=\${fp0.pale}\`);`,
  `  check('卡片文字画出来了（米白像素）', fp0.pale > 1200, \`pale=\${fp0.pale}\`);`,
  'assert-pale',
);

if (c.length < before * 0.95) throw new Error('结果比原文短，拒绝写盘');
fs.writeFileSync(P, c, 'utf8');
console.log('written', before, '->', c.length);
