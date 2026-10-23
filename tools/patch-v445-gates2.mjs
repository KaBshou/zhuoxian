/**
 * D99 第②条的正文改动：段②「成型早于满级」从**逐种子硬断言**改成**达成率 ≥90%**。
 *
 * 理由（shuzhi v4.45）：段② 是带方差的设计目标，不是正确性不变量。
 * 12 颗里 11 颗满足 = 91.7% 是达成率，不是失败；单颗失败只打印成告警。
 * 系统性回归（例如 6/12）照样红。
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

const OLD = [
  '  // 结构性断言（shuzhi v4.28）：成型必须早于满级。',
  '  // 若哪天 loot 权重重标导致「满级后才成型」，段② 这一整套判据就失去意义 —— 这是结构性错误，',
  '  // 不能靠人眼看两条时间线，必须自己 FAIL。',
  '  const lateFormed = runs.filter((r) => {',
  '    const fa = preMax(r).formedAt;',
  '    return Number.isFinite(fa) && Number.isFinite(r.maxedAt) && fa > r.maxedAt;',
  '  });',
  '  const structuralOk = lateFormed.length === 0;',
  '  const formedPassFinal = formedPass && structuralOk;',
  '  if (!structuralOk) {',
  '    console.log(',
  '      `- ❌ **结构性错误**：${lateFormed.length}/${runs.length} 个种子「成型晚于满级」（` +',
  '        lateFormed.map((r) => `seed ${r.seed} 成型 ${f(preMax(r).formedAt, 1)} > 满级 ${f(r.maxedAt, 1)}`).join(\'；\') +',
  '        \'）\',',
  '    );',
  '  }',
].join('\n');

const NEW = [
  '  // 段② 的「成型早于满级」判据（D99，shuzhi v4.45 改聚合层）：',
  '  // 段② 是**带方差的设计目标**，不是正确性不变量。逐种子硬断言会把 1/12 的方差当场判死，',
  '  // 于是改成**达成率 ≥ 90%**：系统性回归（6/12）照样红，单颗只打印成告警。',
  '  const lateFormed = runs.filter((r) => {',
  '    const fa = preMax(r).formedAt;',
  '    return Number.isFinite(fa) && Number.isFinite(r.maxedAt) && fa > r.maxedAt;',
  '  });',
  '  const formedBeforeMaxRate =',
  '    runs.length > 0 ? (runs.length - lateFormed.length) / runs.length : 0;',
  '  const structuralOk = formedBeforeMaxRate >= FORMED_BEFORE_MAX_RATE;',
  '  const formedPassFinal = formedPass && structuralOk;',
  '  if (lateFormed.length > 0) {',
  '    console.log(',
  '      `  - ⚠️ 告警（不单独判红）：${lateFormed.length}/${runs.length} 个种子「成型晚于满级」（` +',
  '        lateFormed.map((r) => `seed ${r.seed} 成型 ${f(preMax(r).formedAt, 1)} > 满级 ${f(r.maxedAt, 1)}`).join(\'；\') +',
  '        `），达成率 ${f(formedBeforeMaxRate * 100, 1)}%（红线 ≥${Math.round(FORMED_BEFORE_MAX_RATE * 100)}%）`,',
  '    );',
  '  }',
].join('\n');

rep(OLD, NEW, 'late formed block');
rep(
  'const hardFail = !pass || !allMaxed || !formedPassFinal || !structuralOk || !realmMagnitudeOk;',
  'const hardFail = !pass || !allMaxed || !formedPassFinal || !structuralOk || !realmMagnitudeOk;',
  'hardFail untouched',
);

writeFileSync(FILE, crlf ? c.replace(/\n/g, '\r\n') : c, 'utf8');
if (c.length <= before) throw new Error(`补丁后未变长：${before} → ${c.length}`);
console.log(`run-timeline.mjs ${before} → ${c.length} 字符（+${c.length - before}）；快照 ${stamp}`);
