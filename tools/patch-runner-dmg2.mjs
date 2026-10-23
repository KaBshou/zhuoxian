import fs from 'node:fs';
const p = 'tools/session-runner.mjs';
const raw = fs.readFileSync(p, 'utf8');
const crlf = raw.includes('\r\n');
let t = raw.replace(/\r\n/g, '\n');
const a = '    maxFloorReached: sessionMod.highestFloorReached(s),';
const b = [
  '    maxFloorReached: sessionMod.highestFloorReached(s),',
  '    // D149 度量：整轮累计承伤 + 击杀（顶层）。`疾行` 这类只改接触率的妖纹',
  '    // 在击杀率上看不出来，只有「承伤/kill」能看见它。',
  '    damageTaken: Math.round(s.battle.damageTaken),',
  '    kills: s.kills,',
].join('\n');
if (!t.includes(a)) throw new Error('MISS anchor');
t = t.replace(a, b);
if (t.length < raw.replace(/\r\n/g, '\n').length) throw new Error('SHRINK');
fs.writeFileSync(p, crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
console.log('runner: +top-level damageTaken/kills');
