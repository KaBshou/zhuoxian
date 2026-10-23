// 一次性：渊痕定价锚按实测更新（4400 → 8900 渊痕/分，ceshi 实测 8483~9266）
import fs from 'node:fs';

const P = 'F:/dsh-work/zhuoxian/src/data/marks.ts';
let c = fs.readFileSync(P, 'utf8');
const before = c.length;
fs.writeFileSync(P + '.' + Date.now() + '.bak', c, 'utf8');

function repl(oldText, newText, tag) {
  if (!c.includes(oldText)) throw new Error('MISS: ' + tag);
  const n = c.split(oldText).length - 1;
  if (n !== 1) throw new Error(`AMBIGUOUS(${n}): ${tag}`);
  c = c.replace(oldText, newText);
  console.log('OK:', tag);
}

repl(
  `export const MARKS_PER_MINUTE = 4_400;`,
  `export const MARKS_PER_MINUTE = 8_900;`,
  'marks-per-minute',
);

repl(`  setStartFloor: 200_000,`, `  setStartFloor: 400_000,`, 'cost-setStartFloor');
repl(`  rerollCurrency: 100_000,`, `  rerollCurrency: 200_000,`, 'cost-rerollCurrency');
repl(`  divineReforge: 1_000_000,`, `  divineReforge: 1_500_000,`, 'cost-divineReforge');

// 三行注释里的分钟数同步（价格 = 渊痕/分 × 分钟数，分钟数不变，价格才变）
repl(`/** 设下一次闭关的起点层：45.5 分钟的量（选层是决策，不是默认便利） */`,
  `/** 设下一次闭关的起点层：45.5 分钟的量（选层是决策，不是默认便利）。8 900 × 45.5 ≈ 400 000 */`,
  'doc-setStartFloor');
repl(`/** 换一块洗灵石：22.7 分钟（= 一件装备重洗一次的心理账户） */`,
  `/** 换一块洗灵石：22.7 分钟（= 一件装备重洗一次的心理账户）。8 900 × 22.7 ≈ 200 000 */`,
  'doc-rerollCurrency');
repl(`/** 定向重铸一条天阶词条：227 分钟（一个收集里程碑） */`,
  `/** 定向重铸一条天阶词条：170 分钟（一个收集里程碑；原定 227min = 2.0M，
   *  但满级后 3h 只产 1.58M，定 2.0M 等于「3h 买不到一次」= 死内容，所以压到 170min） */`,
  'doc-divineReforge');

if (c.length < before * 0.9) throw new Error('结果比原文短，拒绝写盘');
fs.writeFileSync(P, c, 'utf8');
console.log('written', before, '->', c.length);
