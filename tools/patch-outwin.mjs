// 一次性：在段② 相对副红线之后加一行「满级出窗种子（只记录不判）」。
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/tools/run-timeline.mjs';
const raw = fs.readFileSync(p, 'utf8');
const crlf = raw.includes('\r\n');
let c = raw.replace(/\r\n/g, '\n');
const old = raw.length;
const oldN = raw.replace(/\r\n/g, '\n').length;

const anchor = '  const gradMedAll = med(';
const at = c.indexOf(anchor);
if (at < 0) throw new Error('MISS gradMedAll');
if (c.includes('满级出窗种子')) throw new Error('ALREADY patched');

const add = [
  '  // 出窗种子只记录不判（6 种子协议下最差满级 432.8 已出窗：shuzhi v4.33 建议若升 6 种子协议',
  '  // 把上限放到 445，否则约 1/6 概率误红；当前 3 种子协议仍按 [300,385]）。',
  '  {',
  '    const outWin = runs.filter(',
  '      (r) => Number.isFinite(r.maxedAt) && (r.maxedAt < MAX_MIN_MINUTES || r.maxedAt > MAX_MAX_MINUTES),',
  '    );',
  '    if (outWin.length > 0) {',
  '      console.log(',
  '        `- 满级出窗种子（**只记录，不判**）：` +',
  '          outWin.map((r) => `${r.seed}=${f(r.maxedAt, 1)}min`).join(\'、\') +',
  '          `｜若启用 6 种子协议需把上限放到 445min`,',
  '      );',
  '    }',
  '  }',
  '',
].join('\n');

c = c.slice(0, at) + add + c.slice(at);
if (c.length < oldN + 200) throw new Error('ASSERT too small ' + oldN + ' -> ' + c.length);
fs.writeFileSync(p, crlf ? c.replace(/\n/g, '\r\n') : c, 'utf8');
console.log(`ok ${old} -> ${c.length}`);
