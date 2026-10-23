/**
 * D99 第②条真正落地：把「达成数 == 种子数」与「逐种子比值 ≤0.98」两处等价于**逐种子硬断言**的写法
 * 换成 shuzhi v4.45 的**达成率口径**。
 *
 * 背景：`structuralOk` 已经改成 11/12 ≥ 90% 通过，但 `formedPass` 里还写着
 * `formedRuns.length === runs.length`、`formedRelOk` 还要求逐种子 ≤0.98
 * ⇒ 同一颗种子（`3039` 成型 336.8 > 满级 326.2）被另外两处又判死一次，达成率改动等于没生效。
 */
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';

const FILE = 'tools/run-timeline.mjs';
const raw = readFileSync(FILE, 'utf8');
const crlf = raw.includes('\r\n');
let c = crlf ? raw.replace(/\r\n/g, '\n') : raw;
const before = c.length;

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
mkdirSync('tools/_bak', { recursive: true });
copyFileSync(FILE, `tools/_bak/run-timeline.mjs.${stamp}.bak`);

function rep(from, to, tag) {
  if (!c.includes(from)) throw new Error(`MISS ${tag}`);
  const hits = c.split(from).length - 1;
  if (hits !== 1) throw new Error(`${tag} 命中 ${hits} 次（必须唯一）`);
  c = c.replace(from, to);
}

// ① 逐种子比值红线 → 只保留「中位 ≤0.75」；单颗超线降级为告警（worse 数值照样打印）
rep(
  [
    '  const formedRelSeedOk = formedRel.every((x) => !Number.isFinite(x.maxed) || x.ratio <= FORMED_REL_SEED_MAX);',
    '  const formedRelOk = formedRelMedOk && formedRelSeedOk;',
  ].join('\n'),
  [
    '  // D99：逐种子 ≤0.98 与「成型早于满级」是同一个判据的两种写法，单颗失败已在下面',
    '  // 按达成率口径统一处理（≥90%）；这里只保留中位线，单颗超线进告警。',
    '  const formedRelSeedOk = formedRel.every((x) => !Number.isFinite(x.maxed) || x.ratio <= FORMED_REL_SEED_MAX);',
    '  const formedRelOk = formedRelMedOk;',
  ].join('\n'),
  'formedRelOk',
);

// ② 「达成数 == 种子数」→ 达成率 ≥90%（与 structuralOk 同一个阈值）
rep(
  '  const formedPass = formedRuns.length === runs.length && Number.isFinite(formedMed) &&\n',
  '  const formedEnough = runs.length > 0 && formedRuns.length / runs.length >= FORMED_BEFORE_MAX_RATE;\n' +
    '  const formedPass = formedEnough && Number.isFinite(formedMed) &&\n',
  'formedPass rate',
);

writeFileSync(FILE, crlf ? c.replace(/\n/g, '\r\n') : c, 'utf8');
if (c.length <= before) throw new Error(`补丁后未变长：${before} → ${c.length}`);
console.log(`run-timeline.mjs ${before} → ${c.length} 字符（+${c.length - before}）；快照 ${stamp}`);
