// D128 第二部分：段④ 主口径按 D122 改成「末层 76 停留产出」，但 `_segments.mjs` 仍用
// `p.minutes`（满级后总窗口长度）当分母 —— 那正是 D80 已经认定过的**口径事故**（满级越早窗口越长、读数越大）。
// 这里改成：优先用 `stayByFloor` 里末层（MAX_FLOOR）的停留分钟；没有 stayByFloor 才回退旧算法并标明。
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'F:\\dsh-work\\zhuoxian\\tools\\_segments.mjs';
const raw = readFileSync(P, 'utf8');
const crlf = raw.includes('\r\n');
let t = raw.replace(/\r\n/g, '\n');
const before = t.length;

const oldLine = 'const per3h = med(pcs.map((p) => ((p.xian ?? 0) / Math.max(1, p.minutes)) * 180));';
if (!t.includes(oldLine)) throw new Error('MISS per3h');
const newBlock = [
  '// D122 口径：段④ 主口径 = 末层停留产出（分母只算满级后在该层的分钟数）。',
  '// 旧写法用 `p.minutes`（满级后总窗口）当分母 —— 那是 D80 已判定的口径事故（满级越早、窗口越长、读数越大）。',
  'const LAST_FLOOR = Math.max(...pcs.flatMap((p) => (p.stayByFloor ?? []).map((b) => b.floor)), 0);',
  'const per3hLast = med(',
  '  pcs',
  '    .map((p) => {',
  '      const b = (p.stayByFloor ?? []).find((x) => x.floor === LAST_FLOOR);',
  '      return b && b.minutes > 0 ? (b.xian / b.minutes) * 180 : NaN;',
  '    })',
  '    .filter(Number.isFinite),',
  ');',
  'const per3hFallback = med(pcs.map((p) => ((p.xian ?? 0) / Math.max(1, p.minutes)) * 180));',
  'const per3h = Number.isFinite(per3hLast) ? per3hLast : per3hFallback;',
  'const per3hLabel = Number.isFinite(per3hLast) ? `层${LAST_FLOOR}停留` : `满级后窗口（回退口径，D80 已作废）`;',
].join('\n');
t = t.replace(oldLine, newBlock);

t = t.replace('` · 主口径 per-3h(层46)=${f(per3h)}', '` · 主口径 per-3h(${per3hLabel})=${f(per3h)}');

writeFileSync(P, crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
console.log('ok', before, '→', t.length);
