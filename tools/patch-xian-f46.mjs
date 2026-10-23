#!/usr/bin/env node
/**
 * v4.38：段④「仙品/3h」口径钉死（shuzhi 定稿）
 *
 * 旧口径 = 满级后窗口内仙品总数 ÷ 窗口 × 3。问题：**分母是窗口长度**，
 * 任何让爬层变快的改动都会让这一列"涨"（D78 只换代码：窗口 560→602min，读数 7.7→13.8 = +79%，
 * 掉率一点没变 —— 变的是窗口里"已站在层 46"的时间占比，方向还与真实掉率相反）。
 *
 * 新口径（口径事故修复）：
 *   仙品/3h(层46) = 玩家**停留层 46**时入包的仙品件数 ÷ 停留层 46 的分钟数 × 60 × 3
 *   - 分子：只在 `s.floor === 46` 且已满级时计（扫 s.ground 新 id）
 *   - 分母：只累加 `s.floor === 46` 且已满级的帧
 *   - 未到 46 的种子 → NaN（输出记 "—"，不当 0）
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

function patch(file, edits) {
  const raw = readFileSync(file, 'utf8');
  const crlf = raw.includes('\r\n');
  let c = raw.replace(/\r\n/g, '\n');
  const before = c.length;
  for (const [oldText, newText, tag] of edits) {
    if (!c.includes(oldText)) throw new Error('MISS ' + file + ' :: ' + tag);
    c = c.replace(oldText, newText);
  }
  if (c.length < before * 0.9) throw new Error('长度断言失败：' + file);
  mkdirSync('tools/_bak', { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  copyFileSync(file, join('tools/_bak', file.replaceAll('/', '_') + '.' + stamp + '.bak'));
  writeFileSync(file, crlf ? c.replace(/\n/g, '\r\n') : c, 'utf8');
  console.log('patched ' + file + '：' + before + ' → ' + c.length + ' chars' + (crlf ? '（CRLF 保留）' : ''));
}

// ── 1) session-runner：加 xianAtF46 + f46Minutes ──
patch('tools/session-runner.mjs', [
  [
    [
      '  let postCapXian = 0;',
      '  let postCapFlagXian = 0;',
    ].join('\n'),
    [
      '  let postCapXian = 0;',
      '  let postCapFlagXian = 0;',
      '  // 段④ 新口径（v4.38 / shuzhi D81）：只统计「停留层 46 时入包的仙品」与「停留层 46 的分钟数」。',
      '  // 旧口径（窗口内总件数 ÷ 窗口）的分母是窗口长度，任何加速爬层的改动都会让它涨，方向与真实掉率相反。',
      '  const F46 = 46;',
      '  let xianAtF46 = 0;',
      '  let f46Minutes = 0;',
    ].join('\n'),
    'decl',
  ],
  [
    [
      "        if (Number.isFinite(maxedAt) && g.item.rarity === 'xian') {",
      '          postCapXian += 1;',
    ].join('\n'),
    [
      "        if (Number.isFinite(maxedAt) && g.item.rarity === 'xian') {",
      '          postCapXian += 1;',
      '          if (s.floor === F46) xianAtF46 += 1;',
    ].join('\n'),
    'count',
  ],
  [
    '    // 2b) 同一帧的掉落按「当前层所属阶」再记一份（每阶法宝/分 验收要用）',
    [
      '    // 2a) 段④ 新口径的分母：只累加「满级后且停留在层 46」的帧（v4.38）。',
      '    //     没到 46 的种子 f46Minutes = 0 ⇒ 输出记 "—"，不当 0（否则会把「没到」算成「产出极低」）。',
      '    if (Number.isFinite(maxedAt) && s.floor === F46) f46Minutes += dt / 60;',
      '',
      '    // 2b) 同一帧的掉落按「当前层所属阶」再记一份（每阶法宝/分 验收要用）',
    ].join('\n'),
    'denominator',
  ],
  [
    [
      '    postCap: {',
      '      minutes: Number.isFinite(maxedAt) ? Math.max(0, t / 60 - maxedAt) : 0,',
      '      xian: postCapXian,',
      '      flagXian: postCapFlagXian,',
    ].join('\n'),
    [
      '    postCap: {',
      '      minutes: Number.isFinite(maxedAt) ? Math.max(0, t / 60 - maxedAt) : 0,',
      '      xian: postCapXian,',
      '      flagXian: postCapFlagXian,',
      '      xianAtF46,',
      '      f46Minutes,',
      '      // 每 3h 的仙品件数（分母只算层 46 停留时间）；f46Minutes=0 → NaN，输出方记 "—"',
      '      xianPer3hAtF46: f46Minutes > 0 ? (xianAtF46 / f46Minutes) * 60 * 3 : NaN,',
    ].join('\n'),
    'return',
  ],
]);

// ── 2) run-timeline：输出新口径（保留旧列作"窗口混合口径"记录，标注不可引用）──
patch('tools/run-timeline.mjs', [
  [
    "    console.log('> 口径：只统计**满级之后**落到地上的仙品（扫 `s.ground` 去重），旗子 = `xueji`/`zhuopo`/`shuangying` 三条。');",
    [
      "    console.log('> 口径：只统计**满级之后**落到地上的仙品（扫 `s.ground` 去重），旗子 = `xueji`/`zhuopo`/`shuangying` 三条。');",
      "    console.log('> **口径事故（v4.38 / shuzhi D81）**：这一列的分母是「满级后窗口长度」，任何加速爬层的改动都会让它涨');",
      "    console.log('> （D78 只换代码：窗口 560→602min，读数 7.7→13.8 = +79%，掉率一点没变）。');",
      "    console.log('> **主口径 = 「停留层 46 时入包的仙品 ÷ 停留层 46 的分钟数」**；未到 46 的种子记 \"—\"，不当 0。旧列只为对照，不得引用。');",
    ].join('\n'),
  ],
  [
    [
      "    console.log('| 种子 | 满级后(min) | 仙品件数 | 其中旗子 | 数值传奇 | 仙品/3h | 数值 : 旗子 |');",
    ].join('\n'),
    [
      "    console.log('| 种子 | 满级后(min) | 仙品件数 | 其中旗子 | 数值传奇 | 层46停留(min) | 仙品/3h(层46) | 旧口径/3h | 数值 : 旗子 |');",
    ].join('\n'),
  ],
  [
    [
      "        `| ${r.seed} | ${f(pc.minutes, 1)} | ${pc.xian} | ${pc.flagXian} | ${num} | ` +",
      "          `${pc.minutes > 0 ? f((pc.xian / pc.minutes) * 180, 1) : '—'} | ${ratio} |`,",
    ].join('\n'),
    [
      "        `| ${r.seed} | ${f(pc.minutes, 1)} | ${pc.xian} | ${pc.flagXian} | ${num} | ` +",
      "          `${f(pc.f46Minutes ?? 0, 1)} | ${Number.isFinite(pc.xianPer3hAtF46) ? f(pc.xianPer3hAtF46, 1) : '—'} | ` +",
      "          `${pc.minutes > 0 ? f((pc.xian / pc.minutes) * 180, 1) : '—'} | ${ratio} |`,",
    ].join('\n'),
  ],
  [
    [
      "    console.log('');",
      "    console.log(",
      "      `- 段④ 产出（中位）：仙品 **${f(xianPer3hMed, 1)} 件 / 3h**；其中旗子占 **${pct(flagShareMed)}**（设计值 33.3%）`,",
      "    );",
    ].join('\n'),
    [
      "    const xianPer3hAtF46Med = med(runs.map((r) => r.postCap?.xianPer3hAtF46 ?? NaN));",
      "    console.log('');",
      "    console.log(",
      "      `- 段④ 主口径（**层 46 停留产出**，v4.38 / D81）：仙品 **${Number.isFinite(xianPer3hAtF46Med) ? f(xianPer3hAtF46Med, 1) : '—'} 件 / 3h**` +",
      "        `（未到 46 的种子记 \"—\"，不当 0）`,",
      "    );",
      "    console.log(",
      "      `- 段④ 旧混合口径（**不得引用**，分母是窗口长度）：仙品 **${f(xianPer3hMed, 1)} 件 / 3h**；其中旗子占 **${pct(flagShareMed)}**（设计值 33.3%）`,",
      "    );",
    ].join('\n'),
  ],
  [
    [
      "    console.log(`- 全仙品（**主口径 层 46**）：需 ${f(9 * 2.829, 2)} 件（×H(9)），按上表约 **${Number.isFinite(xianPer3hMed) && xianPer3hMed > 0 ? f((9 * 2.829 / xianPer3hMed) * 3, 0) : '—'} 小时**`);",
    ].join('\n'),
    [
      "    console.log(`- 全仙品（**主口径 层 46 停留产出**）：需 ${f(9 * 2.829, 2)} 件（×H(9)），按上表约 **${Number.isFinite(xianPer3hAtF46Med) && xianPer3hAtF46Med > 0 ? f((9 * 2.829 / xianPer3hAtF46Med) * 3, 0) : '—'} 小时**`);",
    ].join('\n'),
  ],
]);
console.log('done');
