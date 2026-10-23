import fs from 'node:fs';
const p = 'src/data/cycles.ts';
const raw = fs.readFileSync(p, 'utf8');
const crlf = raw.includes('\r\n');
let t = raw.replace(/\r\n/g, '\n');
const a = 'export const CYCLE_HP_MUL = 1.35;';
const b = [
  '// D149（shuzhi 前置清理）：1.35 → 1.30。理由：c3 死亡/小时实测 14.07，红线 15，余量仅 6%；',
  '// 按 1.16/1.4 的增速外推 c4 必超（~20/h）。D141 的触发条件是「>15 才降到 1.30」，',
  '// 但「等红了再改」= 改数据追着 bug 跑；按 D141 的**预案值**提前落地，c4 开工前先办掉。',
  'export const CYCLE_HP_MUL = 1.3;',
].join('\n');
if (!t.includes(a)) throw new Error('MISS CYCLE_HP_MUL');
t = t.replace(a, b);
if (t.length < raw.replace(/\r\n/g, '\n').length) throw new Error('SHRINK');
fs.writeFileSync(p, crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
console.log('cycles.ts CYCLE_HP_MUL -> 1.3');
