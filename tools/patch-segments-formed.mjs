// 让 tools/_segments.mjs 的段② 判据与 tools/run-timeline.mjs 对齐（D99 之后两边规则不一致）。
//
// 症状：同一个 json，run-timeline 的 verdict.pass === true，而 _segments 打印
// 「逐种子 ≤98% 兜底：最差 103.2%（种子 3039）→ 不通过」＋「结构性错误」。
// 根因是 D99 把「逐种子成型晚于满级」改成**聚合判据（达成率 ≥90%）**时只改了 run-timeline，
// _segments 里还留着旧的逐种子 0.98 与逐条结构性报错 —— 这正是「一条改动只改一处」那一族。
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const PATH = 'tools/_segments.mjs';
const raw = readFileSync(PATH, 'utf8');
const nl = raw.includes('\r\n') ? '\r\n' : '\n';
const text = raw.replace(/\r\n/g, '\n');
const before = text.length;

const oldA = `const FORMED_REL_SEED_MAX = 0.98;`;
const newA = `const FORMED_REL_SEED_MAX = 0.98; // 只记录（D99 之后不作判据）
// D99：段② 的结构性判据改成**聚合**（成型早于满级的种子比例 ≥90%），不再逐种子判。
// 逐种子判会把「一颗快杀种子」变成永恒红灯（12 种子实测 3039 是 103.2%），而 0.98 与 0.75 之间
// 只剩 23pp，跨种子散布 45pp —— 判的是种子不是设计。
const FORMED_BEFORE_MAX_RATE = 0.9;`;
if (!text.includes(oldA)) throw new Error('MISS FORMED_REL_SEED_MAX');
let next = text.replace(oldA, newA);

const oldB = `const formedRelSeedOk = formedRel.every((x) => x.ratio <= FORMED_REL_SEED_MAX);
const formedRelOk = formedRelMedOk && formedRelSeedOk;`;
const newB = `const formedBeforeRate = rows.length ? (rows.length - formedLate.length) / rows.length : 0;
const formedBeforeOk = formedBeforeRate >= FORMED_BEFORE_MAX_RATE;
const formedRelOk = formedRelMedOk && formedBeforeOk;`;
if (!next.includes(oldB)) throw new Error('MISS formedRelSeedOk');
next = next.replace(oldB, newB);

const oldC = `    \` → \${formedRelMedOk ? '通过' : '不通过'} · 逐种子 ≤ \${FORMED_REL_SEED_MAX * 100}% 兜底：最差 \${Number.isFinite(formedRelWorst.ratio) ? (formedRelWorst.ratio * 100).toFixed(1) + '%' : '—'}（种子 \${formedRelWorst.seed}）→ \${formedRelSeedOk ? '通过' : '不通过'}\`,`;
const newC = `    \` → \${formedRelMedOk ? '通过' : '不通过'} · 早于满级达成率 \${(formedBeforeRate * 100).toFixed(1)}% ≥ \${FORMED_BEFORE_MAX_RATE * 100}% → \${formedBeforeOk ? '通过' : '不通过'}\` +
    \`（逐种子最差 \${Number.isFinite(formedRelWorst.ratio) ? (formedRelWorst.ratio * 100).toFixed(1) + '%' : '—'}（种子 \${formedRelWorst.seed}）只记录，判据见 D99）\`,`;
if (!next.includes(oldC)) throw new Error('MISS 打印行');
next = next.replace(oldC, newC);

const oldD = `if (formedLate.length) {
  console.log(
    \`  结构性错误：\${formedLate.map((x) => \`seed \${x.seed} 成型 \${f(x.formedPower)} > 满级 \${f(x.maxedAt)}\`).join('；')}\`,
  );
}`;
const newD = `if (formedLate.length && !formedBeforeOk) {
  console.log(
    \`  ❌ 结构性错误（达成率破 90%）：\${formedLate.map((x) => \`seed \${x.seed} 成型 \${f(x.formedPower)} > 满级 \${f(x.maxedAt)}\`).join('；')}\`,
  );
} else if (formedLate.length) {
  console.log(
    \`  记录项（D99 聚合口径：达成率 \${(formedBeforeRate * 100).toFixed(1)}% 已过线，晚于满级的种子只记录）：\${formedLate
      .map((x) => \`seed \${x.seed} 成型 \${f(x.formedPower)} > 满级 \${f(x.maxedAt)}\`)
      .join('；')}\`,
  );
}`;
if (!next.includes(oldD)) throw new Error('MISS 结构性错误块');
next = next.replace(oldD, newD);

// formedRelSeedOk 可能还被引用（自检）
if (next.includes('formedRelSeedOk')) throw new Error('formedRelSeedOk 仍有引用，需一起改');
const delta = next.length - before;
if (delta < 200 || delta > 3000) throw new Error(`改动量异常：${delta}`);

const bakDir = 'tools/_bak';
mkdirSync(bakDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const bak = `${bakDir}/_segments.mjs.${stamp}.bak`;
if (existsSync(PATH)) copyFileSync(PATH, bak);
writeFileSync(PATH, nl === '\r\n' ? next.replace(/\n/g, '\r\n') : next, 'utf8');
console.log(`OK ${before} → ${next.length}（+${delta}），快照 ${bak}`);
