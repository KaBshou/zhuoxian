/**
 * D210 死接线审计：找出「有实现、有测试、但产品路径从不调用」的导出。
 * D215：加 `--check`（第五道门）与基线机制。
 *
 * 由来：D209 的 `chooseAscendancy` 从 D1 起就存在、单测一直在跑，
 * 但 `src/` 下零调用 ⇒ 6 个道统的觉醒效果从来没生效过。
 * D207 的天赋手动点、D205 的 `floorMinutes`、D213 的四份重复几何是同一族的另外几次。
 *
 * 判据（只看 `src/**`，不看 `tests/**` —— 测试调用不算「产品在用」）：
 *   1. 从 `src/**` 导出的函数/常量
 *   2. 在 `src/**` 里除了自己那一行定义之外，一次都没被引用
 *
 * 两种模式：
 *   node tools\audit-dead-wiring.mjs                  # 报表（人看）
 *   node tools\audit-dead-wiring.mjs --check          # 门禁：有「新增死接线」就 exit 1
 *   node tools\audit-dead-wiring.mjs --write-baseline # 重写基线
 *
 * 门禁规则（D215）：
 *   A. **硬红线**：`src/render/**` 里名字像几何/命中/布局助手（*Height / *Rect / *Geometry /
 *      *Layout / *Buttons / *Cells / hitTest*）的零引用导出 —— 这一类不允许进基线。
 *      理由：D213 抓到的四份重复几何全在这里，它们的共同形状是「测试在用的那份没接进绘制」。
 *   B. **基线内允许**：其余零引用导出（多数是给测试用的常量/校验器，纯函数就该能被单测）。
 *   C. **新增即红**：出现基线里没有的零引用导出就 exit 1 —— 要么接上产品路径，要么写进基线并说明理由。
 *   D. 基线里已经不属于零引用的条目 → 只提示「可从基线删除」，不算红（避免基线腐烂却没人管）。
 */
import fs from 'node:fs';
import path from 'node:path';

const ARGV = process.argv.slice(2);
const JSON_OUT = (ARGV.find((a) => a.startsWith('--json=')) ?? '').slice('--json='.length) || null;
const CHECK = ARGV.includes('--check');
const WRITE_BASELINE = ARGV.includes('--write-baseline');
const BASELINE_PATH = 'tools/_audit-baseline.json';
const ROOT = 'src';

/** `src/render/**` 里属于「几何/命中」危险类的导出名 */
const GEO_NAME = /(Height|Rect|Geometry|Layout|Buttons|Cells|^hitTest|Visible|State)$/;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

const files = walk(ROOT);
const sources = new Map();
for (const f of files) sources.set(f, fs.readFileSync(f, 'utf8'));

function collectExports(file, text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  const push = (name, kind, lineNo, lineText) => {
    if (!name || name.length < 3) return;
    out.push({ name, kind, file, line: lineNo, text: lineText.trim() });
  };
  for (let i = 0; i < lines.length; i += 1) {
    const L = lines[i];
    let m;
    if ((m = /^\s*export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/.exec(L))) push(m[1], 'function', i + 1, L);
    else if ((m = /^\s*export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(|function)/.exec(L)))
      push(m[1], 'function', i + 1, L);
    else if ((m = /^\s*export\s+const\s+([A-Z][A-Z0-9_]*)\s*=/.exec(L))) push(m[1], 'const', i + 1, L);
    else if ((m = /^\s*export\s+(?:function\s+)?([A-Z][A-Z0-9_]*)\s*=/u.exec(L)) && false) push(m[1], 'const', i + 1, L);
  }
  return out;
}

const allExports = [];
for (const [file, text] of sources) allExports.push(...collectExports(file, text));

function countRefs(name, defFile, defLine) {
  const re = new RegExp(`\\b${name.replace(/[$]/g, '\\$')}\\b`, 'g');
  let total = 0;
  const where = [];
  for (const [file, text] of sources) {
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      if (file === defFile && i + 1 === defLine) continue;
      const hits = lines[i].match(re);
      if (hits) {
        total += hits.length;
        if (where.length < 3) where.push(`${file}:${i + 1}`);
      }
    }
  }
  return { total, where };
}

const dead = [];
for (const e of allExports) {
  const { total, where } = countRefs(e.name, e.file, e.line);
  if (total === 0) dead.push({ ...e, refs: total, where });
}

const key = (d) => `${d.file.replace(/\\/g, '/')}::${d.name}`;
const deadKeys = dead.map(key).sort();
const base = keyIn => keyIn;

// ── 基线读写 ───────────────────────────────────────────────────────────────
function readBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
    return Array.isArray(j.allow) ? j.allow : null;
  } catch (e) {
    console.log(`基线读不出来（${e.message}）—— 当成「必须重写」处理`);
    return null;
  }
}

if (WRITE_BASELINE) {
  const hard = dead.filter((d) => d.file.startsWith('src/render') && GEO_NAME.test(d.name));
  if (hard.length > 0) {
    console.log('❌ 这些是「几何/命中」类死接线，不许写进基线，请先接上产品路径：');
    for (const d of hard) console.log(`   ${key(d)}  (${d.file}:${d.line})`);
    process.exit(1);
  }
  const allow = deadKeys.filter((k) => !hard.some((d) => key(d) === k));
  fs.writeFileSync(
    BASELINE_PATH,
    JSON.stringify(
      {
        note: 'D215：允许存在的零引用导出（多数是给测试用的纯函数/常量）。新增条目必须在这里写明为什么允许。',
        updatedAt: new Date().toISOString(),
        count: allow.length,
        allow,
      },
      null,
      2,
    ),
    'utf8',
  );
  console.log(`✅ 基线已写：${BASELINE_PATH}（${allow.length} 条）`);
  process.exit(0);
}

// ── 报表模式 ───────────────────────────────────────────────────────────────
if (!CHECK) {
  const byFile = new Map();
  for (const d of dead) {
    if (!byFile.has(d.file)) byFile.set(d.file, []);
    byFile.get(d.file).push(d);
  }
  console.log(`扫描 ${files.length} 个源文件，导出项 ${allExports.length} 个`);
  console.log(`零引用（产品路径从不调用）：${dead.length} 个\n`);
  for (const [file, list] of [...byFile.entries()].sort()) {
    console.log(`${file}  (${list.length})`);
    for (const d of list) console.log(`  ${String(d.line).padStart(4)}  ${d.kind.padEnd(8)} ${d.name}`);
    console.log('');
  }
  if (dead.length === 0) console.log('没有发现零引用导出。');
  if (JSON_OUT) {
    fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
    fs.writeFileSync(
      JSON_OUT,
      JSON.stringify({ scannedFiles: files.length, exports: allExports.length, dead }, null, 2),
      'utf8',
    );
    console.log(`\nJSON 已写出：${JSON_OUT}`);
  }
  process.exit(0);
}

// ── 门禁模式 ───────────────────────────────────────────────────────────────
const allowList = readBaseline();
if (allowList === null) {
  console.log(`❌ 找不到基线 ${BASELINE_PATH}。先跑：node tools/audit-dead-wiring.mjs --write-baseline`);
  process.exit(1);
}
const allowSet = new Set(allowList.map(base));

const hard = dead.filter((d) => d.file.startsWith('src/render') && GEO_NAME.test(d.name));
const hardKeys = hard.map(key);
const notAllowed = deadKeys.filter((k) => !allowSet.has(k) && !hardKeys.includes(k));
const fixed = allowList.filter((k) => !deadKeys.includes(k));

console.log(`扫描 ${files.length} 个文件 / 导出 ${allExports.length} 个；零引用 ${dead.length} 个（基线允许 ${allowSet.size}）`);

let fail = false;

if (hardKeys.length > 0) {
  fail = true;
  console.log(`\n❌ 硬红线：${hardKeys.length} 个「几何/命中」类导出没人用（测试测的可能是没人用的那份，D213）：`);
  for (const k of hardKeys) console.log(`   ${k}`);
}

if (notAllowed.length > 0) {
  fail = true;
  console.log(`\n❌ 新增死接线：${notAllowed.length} 个不在基线里（要么接上产品路径，要么 --write-baseline 并说明理由）：`);
  for (const k of notAllowed) console.log(`   ${k}`);
}

if (fixed.length > 0) {
  console.log(`\nℹ️  ${fixed.length} 条基线条目已经不再是零引用，可以从基线里删掉：`);
  for (const k of fixed) console.log(`   ${k}`);
}

if (fail) process.exit(1);
console.log('\n✅ 死接线审计通过（无新增、无几何类死代码）');
