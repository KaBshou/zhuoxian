import fs from 'node:fs';
const p = 'tools/session-runner.mjs';
const raw = fs.readFileSync(p, 'utf8');
const crlf = raw.includes('\r\n');
let t = raw.replace(/\r\n/g, '\n');
const a = '    dropsFound: s.dropsFound,';
const b = [
  '    dropsFound: s.dropsFound,',
  '    // D149 度量：累计承伤（运行时计数，来自 `battle.damageTaken`）。',
  '    // 用途：`疾行` 这类「只改接触率」的妖纹无法用击杀率区分 —— 只有承伤/kill 能看见它。',
  '    damageTaken: Math.round(s.battle.damageTaken),',
].join('\n');
if (!t.includes(a)) throw new Error('MISS');
t = t.replace(a, b);
if (t.length < raw.replace(/\r\n/g, '\n').length) throw new Error('SHRINK');
fs.writeFileSync(p, crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
console.log('patched runner +damageTaken');
