// 修正 threats 常量区的过时注释（常量本身是 D115 定稿的 4 / 0.20 / 开）：
//  · 「超了降到 ×5」是 ×5 时代的残留
//  · 斜坡文档写「到 ×5 后钳住 / floor 42 → ×5」，实际封顶 ×4 出现在 floor 37
//  · `DEEP_THREAT_ENABLED` 注释写「默认关闭」，实际 true（D111 已开启并验收）
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'F:\\dsh-work\\zhuoxian\\src\\data\\monsters.ts';
const raw = readFileSync(P, 'utf8');
const crlf = raw.includes('\r\n');
let t = raw.replace(/\r\n/g, '\n');
const before = t.length;

const edits = [
  [
    'accept',
    ' * 硬验收：12 种子满级中位涨幅 ≤3%（超了降到 ×5）。',
    ' * 硬验收：12 种子满级中位涨幅 ≤3%（超了把封顶从 ×4 降到 ×3，D115）。',
  ],
  [
    'slope-doc',
    [
      '/**',
      ' * 斜坡斜率（D114）：层 22 起每层 +0.20，到 ×5 后钳住。',
      ' *',
      ' *   floor 22 → ×1.00（斜坡起点）',
      ' *   floor 27 → ×2.00（教学期后第一道台阶，与「×2 一刀切实测几乎不死」对齐）',
      ' *   floor 42 → ×5.00（钳住，之后恒 ×5：段④ 终点压力不无限增长）',
      ' *',
      ' * 取 0.20 不取 0.25：0.25 在层 38 就顶到 ×5，斜坡只剩 16 层、玩家来不及「学会」；',
      ' * 0.20 给 20 层过渡带，并用实测锚住了斜坡起点。',
      ' */',
    ].join('\n'),
    [
      '/**',
      ' * 斜坡斜率（D114/D115）：层 22 起每层 +0.20，到封顶 ×4 后钳住（层 37 顶到）。',
      ' *',
      ' *   floor 22 → ×1.00（斜坡起点）',
      ' *   floor 27 → ×2.00（教学期后第一道台阶，与「×2 一刀切实测几乎不死」对齐）',
      ' *   floor 37 → ×4.00（钳住，之后恒 ×4：段④ 终点压力不无限增长）',
      ' *',
      ' * 取 0.20 不取 0.25：0.25 在层 34 就顶到 ×4，斜坡只剩 12 层、玩家来不及「学会」。',
      ' * 取封顶 ×4 不取 ×5（D115）：尾部只认封顶不认斜率 —— 层 42+ 所有斜率都被钳到同一个数。',
      ' */',
    ].join('\n'),
  ],
  [
    'enabled-doc',
    [
      ' * 总开关（D111）：**默认关闭**。',
      ' *',
      ' * 关着的时候倍率不算数 —— 这是有意的，不是漏了开。开它必须同时满足：',
    ].join('\n'),
    [
      ' * 总开关（D111）：**现已开启**（当时先关着跑基线，满足下面三条后才开）。',
      ' *',
      ' * 关着的时候倍率不算数 —— 这是有意的，不是漏了开。开它必须同时满足：',
    ].join('\n'),
  ],
];

for (const [tag, oldT, newT] of edits) {
  if (t.includes(newT)) continue;
  const hits = t.split(oldT).length - 1;
  if (hits !== 1) throw new Error(`[${tag}] 命中 ${hits} 次`);
  t = t.replace(oldT, newT);
}

writeFileSync(P, crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
console.log('ok', before, '→', t.length);
