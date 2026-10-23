// D150：给 run-timeline 加「死亡时间占比」（同量纲的记录项）。
// 为什么不用「死亡/小时」：那个量的分母是爬升速度（D149.1 实测过改分母会让方向反转）。
// 这条的分子分母都是分钟 ⇒ 直接回答「我多少时间花在重做已经做过的事上」。
import fs from 'node:fs';

const P = 'tools/run-timeline.mjs';
const raw = fs.readFileSync(P, 'utf8');
const crlf = raw.includes('\r\n');
let t = raw.replace(/\r\n/g, '\n');
const BT = String.fromCharCode(96);
const pct = '${(REWORK_SIGNAL_MAX * 100).toFixed(0)}';
const d = (s) => '"' + s + '"';

const a1 = 'const DEATH_HARD_MAX = 60;';
if (!t.includes(a1)) throw new Error('MISS DEATH_HARD_MAX');
t = t.replace(
  a1,
  [
    a1,
    '// D150（shuzhi §6.8.7 ③）：**同量纲**的死亡代价度量 —— 死亡时间占比。',
    '// 为什么不用「死亡/小时」：那个量的分母是「爬升速度」（D149.1 实测：降怪血反而让死亡/小时变高）。',
    '// 这条的分子分母都是**分钟**，直接回答玩家在意的「我多少时间花在重做已经做过的事上」。',
    '// 单次重做按「半层」估 = 0.9min（本层回第 1 波，一层 ≈ 3.7min）。',
    '// 适用域：记录项。shuzhi 定的动机制信号 = **c4 之后 > 30%**；c0~c3 只记录不判。',
    'const REWORK_MIN_PER_DEATH = 0.9;',
    '/** c4+ 的「该动机制」信号线（30%）；c0~c3 只记录 */',
    'const REWORK_SIGNAL_MAX = 0.3;',
  ].join('\n'),
);

const a2 = '  const deathMedOk = deathMed >= DEATH_MEDIAN_BAND[0] && deathMed <= DEATH_MEDIAN_BAND[1];';
if (!t.includes(a2)) throw new Error('MISS deathMedOk');
t = t.replace(
  a2,
  [
    a2,
    '  // 死亡时间占比（D150）：逐种子算再取中位，避免「死亡多的种子恰好时长也长」互相抵消。',
    '  const reworkPcts = runs',
    '    .filter((r) => Number.isFinite(preMax(r).mins) && preMax(r).mins > 0)',
    '    .map((r) => ((r.deaths ?? 0) * REWORK_MIN_PER_DEATH) / preMax(r).mins);',
    '  const reworkMed = reworkPcts.length ? med(reworkPcts) : NaN;',
    '  const reworkOver = runs.filter((r) => {',
    '    const m = preMax(r).mins;',
    '    return Number.isFinite(m) && m > 0 && ((r.deaths ?? 0) * REWORK_MIN_PER_DEATH) / m > REWORK_SIGNAL_MAX;',
    '  });',
  ].join('\n'),
);

const a4 = '  console.log(\n    ' + BT + '- 死亡尾部（**D114 硬上限';
if (!t.includes(a4)) throw new Error('MISS print anchor');
const line1 =
  BT + '- 死亡时间占比（**D150 记录项，同量纲**）：中位 ${Number.isFinite(reworkMed) ? f(reworkMed * 100, 1) : ' + d('—') + '}%' + BT + ' +';
const line2 =
  BT + '（= 死亡次数 × ${REWORK_MIN_PER_DEATH}min ÷ 满级时长；c4+ 超 ' + pct + '% 才是「该动机制」的信号）' + BT + ' +';
const line3 =
  '(reworkOver.length ? ' + BT + '｜⚠️ ${reworkOver.length}/${runs.length} 个种子 >' + pct + '%' + BT + ' : ' + BT + '｜全部 ≤' + pct + '%' + BT + '),';
t = t.replace(
  a4,
  [
    '  console.log(',
    '    ' + line1,
    '      ' + line2,
    '      ' + line3,
    '  );',
    '  console.log(',
    '    ' + BT + '- 死亡尾部（**D114 硬上限',
  ].join('\n'),
);

const a5 = '    deathMedOk,';
if (!t.includes(a5)) throw new Error('MISS verdict');
t = t.replace(a5, ['    deathMedOk,', '    reworkMed,', '    reworkOver: reworkOver.map((r) => r.seed),'].join('\n'));

if (t.length < raw.replace(/\r\n/g, '\n').length) throw new Error('SHRINK');
fs.writeFileSync(P, crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
console.log('run-timeline: +reworkPct');
