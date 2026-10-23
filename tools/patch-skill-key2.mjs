// 一次性：main.ts 绑 G 键 + battle-renderer 底栏提示补 T/G
import fs from 'node:fs';

function edit(P, pairs) {
  let c = fs.readFileSync(P, 'utf8');
  const before = c.length;
  fs.writeFileSync(P + '.' + Date.now() + '.bak', c, 'utf8');
  for (const [oldText, newText, tag] of pairs) {
    if (!c.includes(oldText)) throw new Error('MISS(' + tag + '): ' + oldText);
    const n = c.split(oldText).length - 1;
    if (n !== 1) throw new Error(`AMBIGUOUS(${n}): ${tag}`);
    c = c.replace(oldText, newText);
    console.log('OK:', tag);
  }
  if (c.length < before * 0.9) throw new Error('结果比原文短 10% 以上，拒绝写盘: ' + P);
  fs.writeFileSync(P, c, 'utf8');
  console.log('written', P, before, '->', c.length);
}

edit('F:/dsh-work/zhuoxian/src/main.ts', [
  [
    `  // D = 损伤详解面板（"我这一下为什么只打出这么点"的答案）`,
    `  // G = 神通/玉简面板（"我这条神通到底装了什么玉简"的答案）
  // 6 主动 × 4 槽 × 12 条玉简是本作最贵的一层组合，看不见就等于不存在。
  if (e.code === 'KeyG') {
    const on = renderer.toggleSkill();
    session.log.push({
      text: on ? '打开神通面板（再按 G 关闭）' : '关闭神通面板',
      color: '#6d665c',
      age: 0,
    });
    return;
  }
  // D = 损伤详解面板（"我这一下为什么只打出这么点"的答案）`,
    'key-G',
  ],
]);

edit('F:/dsh-work/zhuoxian/src/render/battle-renderer.ts', [
  [
    `　←→ 回刷　1/2/3 渊痕　E 法宝　D 详解`,
    `　←→ 回刷　1/2/3 渊痕　E 法宝　D 详解　T 周天　G 神通`,
    'footer-hint',
  ],
]);
