// 一次性补丁：把 progression 测试从旧几何式期望迁到 D34 显式数组（跑完即弃）
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/tests/character.test.ts';
let c = fs.readFileSync(p, 'utf8');

function repl(old, neu, tag) {
  const n = c.split(old).length - 1;
  if (n !== 1) throw new Error(`MISS(${n}): ${tag}`);
  c = c.replace(old, neu);
  console.log('ok:', tag);
}

repl(
  `  it('第一重门槛 = R(0) × 8%（BALANCE §4）', () => {
    expect(xpForStep(0)).toBe(Math.round(180 * 0.08));
  });`,
  `  it('第一重门槛 = R(0) × 9%（BALANCE §20.11 / D34 显式数组）', () => {
    expect(xpForStep(0)).toBe(Math.round(BREAKTHROUGH_XP[0] * STAGE_RATIO));
  });`,
  'first-stage',
);

repl(
  `      const r = Math.round(180 * Math.pow(1.56, k));
      expect(xpForStep(k * STAGES_PER_REALM + 8), \`realm \${k}\`).toBe(
        Math.round(r * 0.28),
      );`,
  `      const r = BREAKTHROUGH_XP[k];
      expect(xpForStep(k * STAGES_PER_REALM + 8), \`realm \${k}\`).toBe(
        Math.round(r * TRIBULATION_RATIO),
      );`,
  'tribulation',
);

repl(
  `  it('81 台阶合计在 BALANCE 量级窗内（约 1.3 万 ~ 2.7 万）', () => {
    // R(k)=180×1.56^k 的几何级数合计 ≈ 180×(1.56^9-1)/0.56 ≈ 14114；
    // BALANCE 表 C 按「时长反算」的 25638 与几何数列有 45% 偏差（表 C 的 R 值
    // 相邻比值 2.9/1.95/1.69… 不是常数，即表 C 自身不是严格几何数列）。
    // 曲线公式以 §4 公式为准，断言锁在两值并集的量级窗内，待数值策划定稿收紧。
    const total = totalXpToStep(TOTAL_STEPS - 1);
    expect(total).toBeGreaterThan(1.3e4);
    expect(total).toBeLessThan(2.7e4);
  });`,
  `  it('81 台阶合计 = 数组总和（D34 定稿 1 513 370，满级 406 分钟）', () => {
    // R(k) 是「本境全部台阶之和」：8 重 × 9% + 渡劫 28% = 100%
    // 所以 81 台阶合计必须精确等于数组总和，否则时长预算会整体跑偏
    const total = totalXpToStep(TOTAL_STEPS - 1);
    const sum = BREAKTHROUGH_XP.reduce((a, b) => a + b, 0);
    expect(total).toBe(sum);
    expect(sum).toBe(1513370);
  });`,
  'total-window',
);

// import 补 BREAKTHROUGH_XP / STAGE_RATIO / TRIBULATION_RATIO
const importLine = c.match(/import \{[^}]*\} from '\.\.\/src\/core\/progression';/);
if (!importLine) throw new Error('progression import not found');
const need = ['BREAKTHROUGH_XP', 'STAGE_RATIO', 'TRIBULATION_RATIO'];
const cur = importLine[0];
for (const name of need) {
  if (!new RegExp(`\\b${name}\\b`).test(cur)) {
    c = c.replace(cur, cur.replace('{', `{ ${name},`));
    console.log('import+', name);
  }
}

fs.writeFileSync(p, c, 'utf8');
console.log('done');
