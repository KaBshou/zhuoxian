// 一次性：run-timeline 增加「表 2d · 段④ 产出」（D57/D63/D66 的度量口径）。
// 起因：段④ 没有「长度」可量（满级后修为丢弃、层 46 封顶），只有装备产出；
// 之前的「满级后 512.4min」是假数（窗口 − 满级），跑 1200min 也验不出东西。
// 本表量的是：满级后每小时掉几件仙品、其中几件是「数值传奇」几件是「机制传奇」（6:3 = 2:1）。
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/tools/run-timeline.mjs';
const raw = fs.readFileSync(p, 'utf8');
const crlf = raw.includes('\r\n');
let c = raw.replace(/\r\n/g, '\n');

const anchor = [
  '  if (JSON_OUT) {',
  '    const payload = {',
].join('\n');

const block = [
  '  if (POST_CAP && runs.some((r) => r.postCap && r.postCap.minutes > 0)) {',
  '    // 表 2d：段④ 产出（D57/D63）。**不要**拿「满级后跑了多少分钟」当段④ 的长度 ——',
  '    // 那个数 = 窗口 − 满级，跑多久涨多久，无法验收。段④ 唯一诚实的度量是产出。',
  "    console.log('');",
  "    console.log('## 表 2d · 段④ 产出（满级后的**仙品件数**，D63 口径：6 数值 : 3 旗子 = 2:1）');",
  "    console.log('');",
  "    console.log('> 口径：只统计**满级之后**落到地上的仙品（扫 `s.ground` 去重），旗子 = `xueji`/`zhuopo`/`shuangying` 三条。');",
  "    console.log('> 与 §6.2 对齐：层 21 三小时约 3.8 件、层 46 约 7.2 件；9 件全仙品需 25.46 件 ⇒ 段④ 是长线收集。');",
  "    console.log('');",
  "    console.log('| 种子 | 满级后(min) | 仙品件数 | 其中旗子 | 数值传奇 | 仙品/3h | 数值 : 旗子 |');",
  "    console.log('|---|---:|---:|---:|---:|---:|---|');",
  '    for (const r of runs) {',
  '      const pc = r.postCap ?? { minutes: 0, xian: 0, flagXian: 0 };',
  '      const num = Math.max(0, pc.xian - pc.flagXian);',
  '      const ratio = pc.flagXian > 0 ? `${f(num / pc.flagXian, 2)} : 1` : (pc.xian > 0 ? `${pc.xian} : 0` : "—");',
  '      console.log(',
  '        `| ${r.seed} | ${f(pc.minutes, 1)} | ${pc.xian} | ${pc.flagXian} | ${num} | ` +',
  '          `${pc.minutes > 0 ? f((pc.xian / pc.minutes) * 180, 1) : \'—\'} | ${ratio} |`,',
  '      );',
  '    }',
  '    const xianPer3hMed = med(',
  '      runs.map((r) => {',
  '        const pc = r.postCap ?? { minutes: 0, xian: 0 };',
  '        return pc.minutes > 0 ? (pc.xian / pc.minutes) * 180 : NaN;',
  '      }),',
  '    );',
  '    const flagShareMed = med(',
  '      runs.map((r) => {',
  '        const pc = r.postCap ?? { minutes: 0, xian: 0, flagXian: 0 };',
  '        return pc.xian > 0 ? pc.flagXian / pc.xian : NaN;',
  '      }),',
  '    );',
  "    console.log('');",
  '    console.log(',
  '      `- 段④ 产出（中位）：仙品 **${f(xianPer3hMed, 1)} 件 / 3h**；其中旗子占 **${pct(flagShareMed)}**（设计值 33.3%）`,',
  '    );',
  '    console.log(`- 参考：9 件全仙品需 ${f(9 * 2.829, 2)} 件（×H(9)），按上表约需 ${Number.isFinite(xianPer3hMed) && xianPer3hMed > 0 ? f((9 * 2.829 / xianPer3hMed) * 3, 0) : \'—\'} 小时`);',
  '  }',
  '',
  anchor,
].join('\n');

if (!c.includes(anchor)) throw new Error('MISS json anchor');
c = c.replace(anchor, block);

fs.writeFileSync(p, crlf ? c.replace(/\n/g, '\r\n') : c, 'utf8');
console.log(`ok crlf=${crlf} ${raw.length} -> ${c.length}`);
