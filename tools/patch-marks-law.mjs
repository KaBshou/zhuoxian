// 一次性：marks.ts 铁律措辞按 D45 修正（绝不产生战力 → 不产生无限战力）
import fs from 'node:fs';

const P = 'F:/dsh-work/zhuoxian/src/data/marks.ts';
let c = fs.readFileSync(P, 'utf8');
const before = c.length;
fs.writeFileSync(`F:/dsh-work/zhuoxian/tools/_bak/marks.ts.${Date.now()}.bak`, c, 'utf8');

function repl(oldText, newText, tag) {
  if (!c.includes(oldText)) throw new Error('MISS: ' + tag);
  const n = c.split(oldText).length - 1;
  if (n !== 1) throw new Error(`AMBIGUOUS(${n}): ` + tag);
  c = c.replace(oldText, newText);
  console.log('OK:', tag);
}

repl(
  ` * 1. **渊痕不产生战力。** 任何「渊痕换伤害/气血」的口子会同时废掉 §16 的 EHP 判定
 *    和 §20.14 的 BREAKTHROUGH_XP 数组 —— 那两张表都是在「战力只来自装备 + 境界」
 *    的前提下标定的。`,
  ` * 1. **渊痕不产生「无限」战力**（D45）。允许**有界**强化（\`divineReforge\` 单件、灵纹 cap 1.3、不可叠加），
 *    禁止任何「渊痕按比例换伤害/气血」的持续口子 —— 那种口子会同时废掉 §16 的 EHP 判定
 *    和 §20.14 的 BREAKTHROUGH_XP 数组（那两张表都是在「战力只来自装备 + 境界」的前提下标定的）。
 *    有界强化的理由：满级后如果没有「能变强一点点」的感觉，满级那一刻就等于游戏结束；
 *    上限钉死在 cap 1.3 是为了让 3h 后收益必然归零，不至于变成第二个无限曲线。`,
  'law-1-wording',
);

if (c.length < before * 0.95) throw new Error('结果比原文短，拒绝写盘');
fs.writeFileSync(P, c, 'utf8');
console.log('written', c.length);
