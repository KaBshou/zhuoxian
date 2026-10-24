/**
 * D210 死接线审计：找出「有实现、有测试、但产品路径从不调用」的导出。
 *
 * 由来：D209 的 `chooseAscendancy` 从 D1 起就存在、单测一直在跑，
 * 但 `src/` 下零调用 ⇒ 6 个道统的觉醒效果从来没生效过。
 * D207 的天赋手动点、D205 的 `floorMinutes` 是同一族的另外两次。
 *
 * 判据（只看 `src/**`，不看 `tests/**` —— 测试调用不算「产品在用」）：
 *   1. 从 `src/**` 导出的函数/常量
 *   2. 在 `src/**` 里除了自己那一行定义之外，一次都没被引用
 *   3. 排除：类型/接口、`export default`、常量表（全大写且值里没有调用）
 *
 * 用法：
 *   node tools\audit-dead-wiring.mjs
 *   node tools\audit-dead-wiring.mjs --json=tmp\dead.json
 *
 * 纪律：这是**审计**不是门禁 —— 导出给测试用是合理的（纯函数就该能被单测）。
 * 它要回答的问题是「这个导出有没有产品消费者」，答案由人判断。
 */
import fs from 'node:fs';
import path from 'node:path';

const ARGV = process.argv.slice(2);
const JSON_OUT = (ARGV.find((a) => a.startsWith('--json=')) ?? '').slice('--json='.length) || null;
const ROOT = 'src';

/** 递归收集 .ts 文件 */
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

/** 从文件里抽出导出声明：name + kind + 所在行 */
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
    // export function foo(
    if ((m = /^\s*export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/.exec(L))) push(m[1], 'function', i + 1, L);
    // export const foo = (...) =>  /  export const foo = function
    else if ((m = /^\s*export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(|function)/.exec(L)))
      push(m[1], 'function', i + 1, L);
    // export const FOO = 常量（全大写）
    else if ((m = /^\s*export\s+const\s+([A-Z][A-Z0-9_]*)\s*=/.exec(L))) push(m[1], 'const', i + 1, L);
  }
  // export { a, b, c } from '...' —— re-export，跳过（它们的真身在别处）
  return out;
}

const allExports = [];
for (const [file, text] of sources) allExports.push(...collectExports(file, text));

/** 统计某名字在 src 里被引用的次数（排除它自己的定义行） */
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
const alive = [];
for (const e of allExports) {
  const { total, where } = countRefs(e.name, e.file, e.line);
  const rec = { ...e, refs: total, where };
  if (total === 0) dead.push(rec);
  else alive.push(rec);
}

// 按文件分组输出
const byFile = new Map();
for (const d of dead) {
  if (!byFile.has(d.file)) byFile.set(d.file, []);
  byFile.get(d.file).push(d);
}

console.log(`扫描 ${files.length} 个源文件，导出项 ${allExports.length} 个`);
console.log(`零引用（产品路径从不调用）：${dead.length} 个\n`);

for (const [file, list] of [...byFile.entries()].sort()) {
  console.log(`${file}  (${list.length})`);
  for (const d of list) {
    console.log(`  ${String(d.line).padStart(4)}  ${d.kind.padEnd(8)} ${d.name}`);
  }
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
