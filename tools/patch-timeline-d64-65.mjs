// 一次性：run-timeline 门禁按 D64（满级 330 / 窗口 [300,385] / 副红线 290）
// 与 D65（成型 = 满级 × 0.80 ⇒ 265 / 窗口 ≤350）重标。
// 为什么不再用单一 TARGET_TOLERANCE：330±15% = [280.5,379.5]，与 shuzhi 定的
// [300,385] 不对称（−9% / +16.7%）。改成一个目标 + 两个显式边界，含义更直白。
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/tools/run-timeline.mjs';
const raw = fs.readFileSync(p, 'utf8');
const crlf = raw.includes('\r\n');
let c = raw.replace(/\r\n/g, '\n');
const before = c.length;

const repl = (oldText, newText, tag) => {
  if (!c.includes(oldText)) throw new Error(`MISS ${tag}`);
  c = c.replace(oldText, newText);
  console.log(`ok ${tag}`);
};

repl(
  'const TARGET_MAX_MINUTES = 406;',
  [
    '// D64：满级目标 330min（GDD 1.7 的 5h=300min 是毛估，406 从不是需求值）。',
    '// 传奇效果把中位从 351.3 压到 322.2 之后重标：**改目标而不是放宽窗口** ——',
    '// 只放宽窗口等于把「变快了」记成「还在窗口里」，那这套门禁就只剩装饰作用。',
    '// 窗口取 shuzhi 定的显式上下界 [300, 385]，不用 ±15% 对称区间（不对称）。',
    'const TARGET_MAX_MINUTES = 330;',
    'const MAX_MIN_MINUTES = 300;',
    'const MAX_MAX_MINUTES = 385;',
  ].join('\n'),
  'D64-target',
);

repl(
  'const dev = (maxedMed - TARGET_MAX_MINUTES) / TARGET_MAX_MINUTES;',
  [
    'const dev = (maxedMed - TARGET_MAX_MINUTES) / TARGET_MAX_MINUTES;',
    'const inWindow = maxedMed >= MAX_MIN_MINUTES && maxedMed <= MAX_MAX_MINUTES;',
  ].join('\n'),
  'window-calc',
);

repl(
  'const FLOOR_MIN_MINUTES = 325;',
  [
    '// 副红线（D64）：任一种子跌破 290min 就算红 —— 中位好看但某个种子飞快，',
    '// 说明这条曲线在种子维度上不稳。',
    'const FLOOR_MIN_MINUTES = 290;',
  ].join('\n'),
  'D64-floor',
);

repl(
  'const pass = allMaxed && Math.abs(dev) <= TARGET_TOLERANCE && floorOk;',
  'const pass = allMaxed && inWindow && floorOk;',
  'pass-window',
);

repl(
  '# 判据：满级中位 ${TARGET_MAX_MINUTES}min ±${Math.round(TARGET_TOLERANCE * 100)}%（主门禁）；最差种子 ≥ ${FLOOR_MIN_MINUTES}min（副红线）；九境到达 ±${Math.round(REALM_TOLERANCE * 100)}%；死亡数单独报',
  '# 判据：满级中位 ${TARGET_MAX_MINUTES}min，窗口 [${MAX_MIN_MINUTES}, ${MAX_MAX_MINUTES}]（主门禁）；最差种子 ≥ ${FLOOR_MIN_MINUTES}min（副红线）；九境到达 ±${Math.round(REALM_TOLERANCE * 100)}%；死亡数单独报',
  'header-line',
);

repl(
  '`（目标 ${TARGET_MAX_MINUTES} ±${Math.round(TARGET_TOLERANCE * 100)}%，偏差 ${f(dev * 100, 1)}%）` +',
  '`（目标 ${TARGET_MAX_MINUTES}min，窗口 [${MAX_MIN_MINUTES}, ${MAX_MAX_MINUTES}]，偏差 ${f(dev * 100, 1)}%）` +',
  'summary-line',
);

repl(
  'const FORMED_TARGET = 290;\n  const FORMED_MAX = 420;',
  [
    '// D65：成型绑比例 = 满级 × 0.80（历史比值规划 0.714 / 实测 0.815、0.807）。',
    '// 好处是**只维护满级一个数**：满级改了，成型目标自动跟着走，不会再出现',
    '// 「满级重标了、成型还是老数字」的口径分裂。',
    'const FORMED_RATIO = 0.8;',
    'const FORMED_TARGET = Math.round(TARGET_MAX_MINUTES * FORMED_RATIO);',
    'const FORMED_MAX = 350;',
  ].join('\n'),
  'D65-formed',
);

repl(
  '        maxMinutes: TARGET_MAX_MINUTES,\n        maxTolerance: TARGET_TOLERANCE,',
  '        maxMinutes: TARGET_MAX_MINUTES,\n        maxWindow: [MAX_MIN_MINUTES, MAX_MAX_MINUTES],',
  'verdict-fields',
);

fs.writeFileSync(p, crlf ? c.replace(/\n/g, '\r\n') : c, 'utf8');
console.log(`done crlf=${crlf} ${before} -> ${c.length}`);
