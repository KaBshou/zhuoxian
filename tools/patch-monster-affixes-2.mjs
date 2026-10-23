import fs from 'node:fs';
const p = 'F:/dsh-work/zhuoxian/src/core/battle.ts';
const raw = fs.readFileSync(p, 'utf8');
const crlf = raw.includes('\r\n');
let n = raw.replace(/\r\n/g, '\n');
const oldT =
  '  /** 妖纹 id（空 = 普通浊物）。只存 id，效果已在生成时乘进下面几个数值 */\n  readonly affixIds: readonly string[];';
const newT = [
  '  /** 妖纹 id（空 = 普通浊物）。只存 id，效果已在生成时乘进下面几个数值。',
  '   *  可选：手工构造的怪（单测/探针）可以不给 —— 效果已经烘进数值，这里只给 UI 用。 */',
  '  readonly affixIds?: readonly string[];',
].join('\n');
if (!n.includes(oldT)) throw new Error('MISS affixIds field');
n = n.replace(oldT, newT);
if (crlf) n = n.replace(/\n/g, '\r\n');
fs.writeFileSync(`F:/dsh-work/zhuoxian/tools/_bak/battle.ts.${Date.now()}.bak`, raw);
fs.writeFileSync(p, n);
console.log(`battle.ts: ${raw.length} -> ${n.length}`);
