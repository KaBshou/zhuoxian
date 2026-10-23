import fs from 'node:fs';
const p = 'src/data/cycles.ts';
const raw = fs.readFileSync(p, 'utf8');
const crlf = raw.includes('\r\n');
let t = raw.replace(/\r\n/g, '\n');
const a = `export const CYCLE_HP_MUL = 1.3;`;
const b = [
  '// D149：1.35 → 1.30 的「c4 前置清理」**已实测否决并回滚**。',
  '// 反证：降怪血 ⇒ 爬得更快 ⇒ 在同样 900min 内更早进入深层 ⇒ c3 死亡/小时 14.07 → 16.51（破 D141 的 15 红线），',
  '// 而 c3 满级中位只从 486.0 降到 461.9。方向与 D141 的假设相反 —— 「死亡/h」由**爬升速度**驱动，不是由怪血量驱动。',
  '// 结论：要压 c3 的死亡/h，杠杆是「减慢爬升」或「加深层威胁形状」，不是降怪血。保持 1.35。',
  'export const CYCLE_HP_MUL = 1.35;',
].join('\n');
if (!t.includes(a)) throw new Error('MISS');
t = t.replace(a, b);
if (t.length < raw.replace(/\r\n/g, '\n').length) throw new Error('SHRINK');
fs.writeFileSync(p, crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
console.log('reverted CYCLE_HP_MUL -> 1.35 (with evidence comment)');
