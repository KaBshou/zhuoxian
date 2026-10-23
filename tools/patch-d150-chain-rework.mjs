// D150：把「死亡时间占比」加进 24h 链验收（同量纲记录项，shuzhi §6.8.7 ③）。
// 与「死亡/小时」并存：后者分母是爬升速度（会随爬升加速而变差），前者分子分母都是分钟。
// 注意：本补丁里所有要生成的反引号一律用 BT 拼，**绝不嵌套模板字符串**（A1 事故同族）。
import fs from 'node:fs';

const P = 'tools/check-cycle-24h.mjs';
const raw = fs.readFileSync(P, 'utf8');
const crlf = raw.includes('\r\n');
let t = raw.replace(/\r\n/g, '\n');
const BT = String.fromCharCode(96);

const a1 = 'const DEATHS_PER_HOUR_MAX = 15;';
if (!t.includes(a1)) throw new Error('MISS DEATHS_PER_HOUR_MAX');
t = t.replace(
  a1,
  [
    a1,
    '/** D150：单次死亡重做时长（半层 ≈ 0.9min）。死亡时间占比 = 次数 × 该值 ÷ 满级时长。',
    ' *  为什么加这条：`死亡/小时` 的分母是爬升速度（D149.1 实测降怪血会让它变差），',
    ' *  而这条的分子分母都是分钟 ⇒ 直接回答「我多少时间花在重做已经做过的事上」。',
    ' *  适用域：c0~c3 记录；**c4+ 超 30% 才是「该动机制」的信号**。 */',
    'const REWORK_MIN_PER_DEATH = 0.9;',
    'const REWORK_SIGNAL_MAX = 0.3;',
  ].join('\n'),
);

const a2 = '    pass: v.pass,';
if (!t.includes(a2)) throw new Error('MISS pass row');
t = t.replace(a2, [a2, '    rework: Number.isFinite(v.reworkMed) ? v.reworkMed : NaN,'].join('\n'));

const a3 = 'console.log("");\nconsole.log(' + BT + '- 单调线（硬线，D140）';
if (!t.includes(a3)) throw new Error('MISS 单调线 print anchor');

const inner =
  'rows.map((r) => "c" + r.cycle + " " + (Number.isFinite(r.rework) ? (r.rework * 100).toFixed(1) + "%" : "—")).join(" / ")';
const gen =
  'console.log(' +
  BT +
  '- 死亡时间占比（**D150 记录项，同量纲**）：${' +
  inner +
  '}' +
  BT +
  ' + ' +
  BT +
  '（分子分母都是分钟；c4+ 超 ${(REWORK_SIGNAL_MAX * 100).toFixed(0)}% 才是「该动机制」的信号，c0~c3 只记录）' +
  BT +
  ');';

t = t.replace(a3, gen + '\n' + a3);

if (t.length < raw.replace(/\r\n/g, '\n').length) throw new Error('SHRINK');
fs.writeFileSync(P, crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');

// 自检：语法必须过，且必须真的含新行
const out = fs.readFileSync(P, 'utf8');
if (!out.includes('REWORK_MIN_PER_DEATH') || !out.includes('死亡时间占比')) {
  throw new Error('写回后自检失败');
}
console.log('check-cycle-24h: +rework 行（' + out.length + ' chars）');
