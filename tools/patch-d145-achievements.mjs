// D145 第二件：成就补 floor-55 / floor-65（shuzhi 排序 C），23 → 25 条 / 480k → 525k
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve('.');
const p = 'src/data/achievements.ts';
const raw = fs.readFileSync(path.join(ROOT, p), 'utf8');
const crlf = raw.includes('\r\n');
let t = raw.replace(/\r\n/g, '\n');

const anchor = "    { id: 'floor-76', name: '渊底', desc: '走到魔渊最深处（第七十六层）。', target: 76, reward: 50000, progress: (f) => min(f.maxFloor, 76) },";
const add = [
  "    // D145（shuzhi 排序 C）：封顶 76 让 46 与 76 之间空了 30 层、约 2h 没有任何成就刻度。",
  '    // 补 55 / 65 两条（15k / 30k），锚 = 「c1 之前能到」与「c2 中段」；仍只给渊痕、一次性、有界。',
  "    { id: 'floor-55', name: '俯瞰', desc: '走到渊层第五十五层。', target: 55, reward: 15000, progress: (f) => min(f.maxFloor, 55) },",
  "    { id: 'floor-65', name: '临渊', desc: '走到渊层第六十五层。', target: 65, reward: 30000, progress: (f) => min(f.maxFloor, 65) },",
  anchor,
].join('\n');
if (!t.includes(anchor)) throw new Error('MISS floor-76');
t = t.replace(anchor, add);

if (t.length < raw.length) throw new Error('SHRINK');
fs.writeFileSync(path.join(ROOT, p), crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
console.log(`patched ${p} (${raw.length} -> ${t.length})`);
