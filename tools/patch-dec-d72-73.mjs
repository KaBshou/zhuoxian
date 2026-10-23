// 一次性：段④「全仙品」主口径标注（层 46 主 / 层 21 保守下限）+ D72/D73 落盘。
import fs from 'node:fs';

const repl = (p, pairs, tag) => {
  const raw = fs.readFileSync(p, 'utf8');
  const crlf = raw.includes('\r\n');
  let c = raw.replace(/\r\n/g, '\n');
  const oldN = c.length;
  for (const [a, b, t] of pairs) {
    if (!c.includes(a)) throw new Error(`MISS ${tag}/${t}`);
    c = c.replace(a, b);
  }
  if (c.length < oldN - 300) throw new Error(`ASSERT shrank ${tag}`);
  fs.writeFileSync(p, crlf ? c.replace(/\n/g, '\r\n') : c, 'utf8');
  console.log(`ok ${tag} ${oldN} -> ${c.length}`);
};

// ① 段④ 表头口径说明
repl(
  'F:/dsh-work/zhuoxian/tools/run-timeline.mjs',
  [
    [
      "console.log('> 与 §6.2 对齐：层 21 三小时约 3.8 件、层 46 约 7.2 件；9 件全仙品需 25.46 件 ⇒ 段④ 是长线收集。');",
      [
        "console.log('> 口径：**主口径 = 层 46**（满级后的自然农点：depthRarityBonus 0.45 vs 层 21 约 0.30）；');",
        "console.log('> 层 21 的 3.8 件/3h（≈21h 集齐）只作「还没到层 46 的玩家的**保守下限**」记录（shuzhi v4.34 / D73）。');",
      ].join('\n'),
      'stage4-header',
    ],
    [
      "console.log(`- 参考：9 件全仙品需 ${f(9 * 2.829, 2)} 件（×H(9)），按上表约需 ${Number.isFinite(xianPer3hMed) && xianPer3hMed > 0 ? f((9 * 2.829 / xianPer3hMed) * 3, 0) : '—'} 小时`);",
      [
        "console.log(`- 全仙品（**主口径 层 46**）：需 ${f(9 * 2.829, 2)} 件（×H(9)），按上表约 **${Number.isFinite(xianPer3hMed) && xianPer3hMed > 0 ? f((9 * 2.829 / xianPer3hMed) * 3, 0) : '—'} 小时**`);",
        "console.log('- 保守下限（层 21，未到层 46）：约 **21.0 小时** —— 解析值 11.5h 与实测 9.9h 同量级，差来自解析式未含 depthRarityBonus 的实际分布。');",
      ].join('\n'),
      'stage4-ref',
    ],
  ],
  'run-timeline',
);

// ② 决策 D72/D73
const p = 'F:/dsh-work/zhuoxian/docs/DECISIONS.md';
const raw = fs.readFileSync(p, 'utf8');
const crlf = raw.includes('\r\n');
const before = raw.replace(/\r\n/g, '\n');
if (before.includes('### D72')) throw new Error('ALREADY D72');

const block = [
'',
'### D72 九境容差定稿：只记录 + ±50% 量级红线；尾部种子合并输出（2026-10-23，shuzhi v4.34）',
'- 我原本提「±20% 判」，shuzhi 用 54 格分布否掉了：新目标 [28,41,59,93,122,153,188,245,330] 下，',
'  `|dev|>15%` 有 9 格、`>20%` **7 格**、`>30%` 5 格、**`>50%` 0 格**；而且 **7 格全部来自同一颗种子 20265073**',
'  （境 3~9 依次 +31.9 / +27.8 / +34.6 / +31.6 / +27.8 / +32.0 / +31.2%），',
'  而这颗种子正是满级 **432.8**（出窗）的那颗 ⇒ 「九境超差」与「满级出窗」**是同一个现象**，判两次不增加信息。',
'- 顺带纠正我的一处误判：第 1 境实测 24.6 vs 目标 28 是 **−12.2%**，±20% 下**并不红**。',
'- 定稿：**逐境 ±20% 只记录**；另设 **±50% 量级红线**（`REALM_MAGNITUDE_LIMIT = 0.5`），',
'  进硬门禁 —— 它专抓「目标写错 / `BREAKTHROUGH_XP` 换错数组 / 收入曲线断掉」这类**一错就是一倍**的事故。',
'- **尾部种子合并输出**：`run-timeline` 现在一行打完「满级出窗 + 九境超差」的同源种子，不再分两张表报两遍。',
'  本轮输出：`20265073（满级 432.8min，满级超出窗口上限）｜若启用 6 种子协议，满级上限须放到 445min`。',
'',
'### D73 段④「全仙品」主口径 = 层 46（9.9h），层 21 的 21h 降为保守下限（2026-10-23）',
'- 6 种子满级后 **7.7 件仙品 / 3h** ⇒ `9 × H(9) = 25.46` 件 ≈ **9.9 小时**（主口径）。',
'- **层 21 的 21.0h 降为「还没到层 46 的玩家」的保守下限**，理由是满级后最深层必最优：',
'  `depthRarityBonus` 层 46 = 0.45、层 21 约 0.30，且满级后没有「推层」成本。',
'- 解析值 11.5h 与实测 9.9h 同量级，差异来自解析式未含 `depthRarityBonus` 的实际分布 —— 别再拿解析值当结论。',
'- 表 2d 仍两档都打，但表头明确写「主口径 = 层 46」。',
'',
].join('\n');

const after = before.replace(/\s*$/, '\n') + block;
if (after.length < before.length + 900) throw new Error('ASSERT block too small');
if (!after.includes('### D73')) throw new Error('ASSERT missing D73');

fs.mkdirSync('F:/dsh-work/zhuoxian/tools/_bak', { recursive: true });
fs.writeFileSync(`F:/dsh-work/zhuoxian/tools/_bak/DECISIONS.before-d72-73.${Date.now()}.md`, raw, 'utf8');
fs.writeFileSync(p, crlf ? after.replace(/\n/g, '\r\n') : after, 'utf8');
console.log(`ok decisions ${before.length} -> ${after.length} chars, count=${(after.match(/^### D\d+/gm) ?? []).length}`);
