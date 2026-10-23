#!/usr/bin/env node
/**
 * _plate-summary.mjs —— 把 `_plate.ps1` 产出的证据文件解析成「每探针 p/t + TOTAL」。
 *
 * 为什么要在 Node 里解析，而不是在 `_plate.ps1` 里用正则：
 *   1. PowerShell 5.1 默认按 ANSI 读取 .ps1 文件，脚本里写中文关键字（`总计`、`结果：`、`通过`）
 *      会被解成乱码 → 关键字正则永远匹配不上 → 盘子打印 `n/a`、`TOTAL 0/0`（实测踩过）。
 *   2. 探针输出经管道回 PS 时又会被再解一次码，双重乱码。
 *   Node 读 UTF-8 文件是确定的，所以「跑」留给 PS，「判读」交给这里。
 *
 * 输入：证据文件路径（`tools\_plate-<yyyyMMdd-HHmmss>.txt`）
 * 输出（ASCII 表格，便于 PS 侧/人肉复核）：
 *   PROBE probe-battle.mjs exit=0 25/25 ok
 *   ...
 *   TOTAL 264/264  18/18 exit=0  RED=0  UNPARSED=0
 * 退出码：有红（exit≠0 或 p≠t）或有无法解析的探针 → 1；全绿 → 0。
 *
 * 解析规则（关键）：
 *   - `== probe-x.mjs exit=N dur=...` 是分节标记，它之后的原始输出属于该探针；
 *   - 只在「汇总行」上取 `p/t`，汇总行关键字：`总计 p/t`、`结果：p/t`、`通过 p/t`、`p/t 通过`；
 *   - 绝不扫任意行取 `(\d+)/(\d+)`：失败详情里有 `hp=152/152`，曾把红盘读成 406/406 假绿。
 */
import { readFileSync } from 'node:fs';

const SUMMARY_PATTERNS = [
  /总计\s*(\d+)\s*\/\s*(\d+)/,
  /结果：\s*(\d+)\s*\/\s*(\d+)/,
  /通过\s+(\d+)\s*\/\s*(\d+)/,
  /(\d+)\s*\/\s*(\d+)\s*通过/,
];

const file = process.argv[2];
if (!file) {
  console.error('usage: node tools/_plate-summary.mjs <plate-artifact.txt>');
  process.exit(2);
}
const text = readFileSync(file, 'utf8');
const lines = text.split(/\r?\n/);

const sectionRe = /^==\s+(probe-[\w.-]+\.mjs)\s+exit=(-?\d+)/;
// 注意分节标记的顺序：`_plate.ps1` 先"追加原始输出"、再"追加 == 标记"，
// 所以「标记之前的那些行」才是这个探针的输出（我第一版按"标记之后"归属，整盘读数整体错位一格：
// probe-battle 26/26、probe-save 11/11 全串行了）。这里用 buffer-then-flush 纠正。
const probes = [];
let buf = [];
for (const line of lines) {
  const m = sectionRe.exec(line);
  if (m) {
    probes.push({ name: m[1], exit: Number(m[2]), body: buf });
    buf = [];
    continue;
  }
  buf.push(line);
}

let sumPass = 0;
let sumTotal = 0;
let red = 0;
let unparsed = 0;
let skipped = 0;
const rows = [];
for (const p of probes) {
  // SKIP 语义：探针自己判定「前置产物/条件不具备」时打 `SKIP <原因>` 并 exit 0。
  // 这类不进分母、不算红（例：probe-cycle-24h 需要 4 份 run-timeline 产物，约 15 分钟模拟；
  // 缺了就 SKIP，否则盘子会依赖一次手工模拟，任何清 tmp 都会长出一条无信息量的红）。
  // probe-detail 那种「SKIP 某一条 + 仍有汇总行」的探针照常走下面的正常解析。
  const skipLine = p.body.find((l) => /^SKIP\s/.test(l)) ?? null;
  let got = null;
  for (const pat of SUMMARY_PATTERNS) {
    let last = null;
    for (const line of p.body) {
      const m = pat.exec(line);
      if (m) last = m;
    }
    if (last) {
      got = { pass: Number(last[1]), total: Number(last[2]) };
      break;
    }
  }
  if (!got && skipLine && p.exit === 0) {
    skipped += 1;
    rows.push(`PROBE ${p.name} exit=0 SKIP (${skipLine.slice(0, 90)})`);
    continue;
  }
  if (!got) {
    unparsed += 1;
    red += 1;
    rows.push(`PROBE ${p.name} exit=${p.exit} n/a UNPARSED`);
    continue;
  }
  const ok = p.exit === 0 && got.pass === got.total;
  if (!ok) red += 1;
  sumPass += got.pass;
  sumTotal += got.total;
  // 探针自己打了 `SKIP <原因>` 但仍有汇总行（例：probe-detail 只穿到 1 件 → 那条像素断言不进分母）。
  // 这类**不改判红**，但必须在行里显式标出来，否则「分母从 8 变 7」在报告里看起来像丢断言。
  const subSkip = skipLine ? ` [skip 1: ${skipLine.slice(3, 40).trim()}]` : '';
  rows.push(`PROBE ${p.name} exit=${p.exit} ${got.pass}/${got.total} ${ok ? 'ok' : 'RED'}${subSkip}`);
}

for (const r of rows) console.log(r);
const allGreen = red === 0 && probes.length > 0;
const ran = probes.length - red - skipped;
console.log(
  `TOTAL ${sumPass}/${sumTotal}  ${ran}/${probes.length} scripts (SKIP=${skipped})  RED=${red}  UNPARSED=${unparsed}  file=${file.split(/[\\/]/).pop()}`,
);
if (!allGreen) {
  console.log('（提醒：RED 先区分「探针写了旧基线」与「真回归」；探针写死旧数值时改探针，不改产品。）');
  process.exitCode = 1;
}
