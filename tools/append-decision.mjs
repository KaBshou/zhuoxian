// 把一段 markdown 追加进 docs/DECISIONS.md（内容放独立 .md，避免在 .mjs 里堆中文长字符串）。
//
// 用法：node tools/append-decision.mjs tmp/d110-112.md [--force]
//
// A1 事故教训的同类坑：这个脚本原来把 SRC 写死成 `tmp/d108.md`、anchor 写死成 `### D108`，
// 于是 `node tools/append-decision.mjs tmp/d110-112.md` 会把 **d108 的内容再追加一遍**
// 而且不报错（它只检查 anchor 在不在文件里）。**参数位必须就是它字面上的意思。**
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const ROOT = 'F:\\dsh-work\\zhuoxian\\';
const PATH = ROOT + 'docs/DECISIONS.md';
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const force = process.argv.includes('--force');
const srcArg = args[0];
if (!srcArg) throw new Error('用法：node tools/append-decision.mjs <要追加的 .md 路径> [--force]');
const SRC = srcArg.startsWith('F:') || srcArg.startsWith('/') ? srcArg : ROOT + srcArg.replace(/^[.\\/]+/, '');

const body = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n').replace(/^\n+/, '').replace(/\s*$/, '\n');
// anchor = 第一行标题（形如 "### D110 ..."）
const firstLine = body.split('\n').find((l) => l.trim().length > 0) ?? '';
const m = firstLine.match(/^###\s+(\S+)/);
if (!m) throw new Error('追加内容的第一个非空行必须是 "### Dxxx 标题" 形式');
const anchor = `### ${m[1]}`;

const raw = readFileSync(PATH, 'utf8');
const already = raw.includes(anchor);
if (already && !force) throw new Error(`${anchor} 已存在（要重复追加请加 --force）`);
const crlf = raw.includes('\r\n');
const text = raw.replace(/\r\n/g, '\n').replace(/\s*$/, '\n');
const before = text.length;
const next = text + body;
const delta = next.length - before;
if (delta < 500 || delta > 20000) throw new Error(`追加量异常：${delta}`);

mkdirSync(ROOT + 'tools/_bak', { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
if (existsSync(PATH)) copyFileSync(PATH, `${ROOT}tools/_bak/DECISIONS.md.${stamp}.bak`);
writeFileSync(PATH, crlf ? next.replace(/\n/g, '\r\n') : next, 'utf8');
console.log(`OK ${SRC} → ${before} → ${next.length}（+${delta}）anchor=${anchor}`);
