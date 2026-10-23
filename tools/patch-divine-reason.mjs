// 一次性：夺造化的失败文案分三种（没有法宝 / 全都没灵纹 / 全都淬满了）
// 理由：玩家看到「身上所有法宝的灵纹都已至淬炼极限」但他身上只有一件凡品道袍时会更困惑，
// 文案必须说清「为什么不能花这笔钱」。
import fs from 'node:fs';

const P = 'F:/dsh-work/zhuoxian/src/core/marks-runtime.ts';
let c = fs.readFileSync(P, 'utf8');
const before = c.length;
fs.writeFileSync(P + '.' + Date.now() + '.bak', c, 'utf8');

function repl(oldText, newText, tag) {
  if (!c.includes(oldText)) throw new Error('MISS: ' + tag);
  const n = c.split(oldText).length - 1;
  if (n !== 1) throw new Error(`AMBIGUOUS(${n}): ${tag}`);
  c = c.replace(oldText, newText);
  console.log('OK:', tag);
}

repl(
  `      const target = pickUpgradable(s);
      if (!target) {
        const any = pickBestEquipped(s);
        return {
          ok: false,
          reason: any
            ? '身上所有法宝的灵纹都已至淬炼极限（每件最多 +30%）'
            : '身上没有法宝，夺造化无处下手',
          message: '',
        };
      }`,
  `      const target = pickUpgradable(s);
      if (!target) {
        const equipped = equippedItems(s.character);
        const reason =
          equipped.length === 0
            ? '身上没有法宝，夺造化无处下手'
            : equipped.every((e) => e.item.affixes.length === 0)
              ? '身上的法宝都没有灵纹（凡品无从淬炼）'
              : '身上所有法宝的灵纹都已至淬炼极限（每件最多 +30%）';
        return { ok: false, reason, message: '' };
      }`,
  'divine-reason-split',
);

if (c.length < before * 0.9) throw new Error('结果比原文短，拒绝写盘');
fs.writeFileSync(P, c, 'utf8');
console.log('written', before, '->', c.length);
