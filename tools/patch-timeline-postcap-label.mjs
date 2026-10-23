// 把「满级后段时长」这句假指标改名（shuzhi v4.28 / D57）
// 理由：段④ 系统里没有「长度」——满级后修为丢弃、层 46 封顶，跑多久都只是「窗口 − 满级」。
// 把它标成「窗口剩余（非设计量）」，并把段④ 的真度量（渊痕产出）抬成主指标。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const FILE = path.join(ROOT, 'tools/run-timeline.mjs');
const raw = fs.readFileSync(FILE, 'utf8');
const before = raw.replace(/\r\n/g, '\n');

const anchor = `    console.log(\`- 满级后段时长（中位）：**\${f(postMed, 1)} min**（上限 \${MINUTES}，满级中位 \${f(maxedMed, 1)}）\`);`;
if (!before.includes(anchor)) throw new Error('MISS anchor postMed');

const neu = `    // ⚠️ 这不是设计量：段④ 没有「长度」（满级后修为丢弃、层 46 封顶），
    // 这个数必然 = 窗口 − 满级时长，跑多久涨多久，无法验收（shuzhi v4.28 / D57）。
    console.log(
      \`- 窗口剩余（**非设计量，仅记录**）：\${f(postMed, 1)} min = \${MINUTES} − \${f(maxedMed, 1)}（段④ 度量看下面的「渊痕产出」）\`,
    );`;

const out = before.replace(anchor, neu);
if (out === before) throw new Error('no change');
if (out.length < before.length) throw new Error('长度断言失败');

fs.mkdirSync(path.join(ROOT, 'tools/_bak'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'tools/_bak/run-timeline.mjs.bak-d57'), raw);
fs.writeFileSync(FILE, raw.includes('\r\n') ? out.replace(/\n/g, '\r\n') : out);
console.log(`ok: ${raw.length} -> ${(raw.includes('\r\n') ? out.replace(/\n/g, '\r\n') : out).length}`);
