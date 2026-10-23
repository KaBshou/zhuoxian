// 修 session-runner 的死亡口径：`deaths: s.floorDeaths` → `deaths: s.deaths`。
//
// 为什么必须改（D113 的连带 bug）：`s.floorDeaths` 的含义是「**本层**死了几次」，
// 而逃生阀（D113）在连死到阈值时会把它**清零**。于是「阀门打开后死亡中位从 18 掉到 1」
// —— 不是死亡变少了，是计数器被清零了。这是「判据读到的是快照而不是事实」的第四次实例。
// 累计死亡要用 `s.deaths`（只增不减）。
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const ROOT = 'F:\\dsh-work\\zhuoxian\\';
const rel = 'tools/session-runner.mjs';
const path = ROOT + rel;
const raw = readFileSync(path, 'utf8');
const crlf = raw.includes('\r\n');
let text = raw.replace(/\r\n/g, '\n');
const before = text.length;

function one(tag, oldText, newText, count = 1) {
  if (!text.includes(oldText)) throw new Error(`[${tag}] 锚点 MISS`);
  const hits = text.split(oldText).length - 1;
  if (hits !== count) throw new Error(`[${tag}] 锚点命中 ${hits} 次（要求 ${count}）`);
  text = text.replaceAll(oldText, newText);
}

one('init', 'let prevDeaths = 0;', 'let prevDeaths = 0; // 累计死亡（`s.deaths`，只增不减；`s.floorDeaths` 会被逃生阀清零）');
one('watch', 'if (s.floorDeaths !== prevDeaths) {', 'if (s.deaths !== prevDeaths) {');
one('update', '      prevDeaths = s.floorDeaths;', '      prevDeaths = s.deaths;');
one('report1', '        deaths: s.floorDeaths,', '        deaths: s.deaths,');

const delta = text.length - before;
if (delta < 20 || delta > 4000) throw new Error(`改动量异常：${delta}`);
mkdirSync(ROOT + 'tools/_bak', { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
if (existsSync(path)) copyFileSync(path, `${ROOT}tools/_bak/session-runner.mjs.${stamp}.bak`);
writeFileSync(path, crlf ? text.replace(/\n/g, '\r\n') : text, 'utf8');
console.log(`OK ${rel} ${before} → ${text.length}（+${delta}）`);
