// 实验：扫 `ji` 的替代通道组合，找「满级不加速 / 首次撞墙 ≥42 / 死亡带内」都在的点。
// 用法：node tools/exp-ji-sweep.mjs "0.9,-0.1" "1,-0.2" ...
// 每档跑一次 12 种子 c0 门禁，打印满级中位、段② 达成、死亡中位、首次撞墙层、false flags。
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const P = 'src/data/monster-affixes.ts';
const BAK = 'tools/_bak/monster-affixes.ts.sweep';
const orig = fs.readFileSync(P, 'utf8');
fs.mkdirSync('tools/_bak', { recursive: true });
fs.writeFileSync(BAK, orig, 'utf8');

const variants = process.argv.slice(2);
if (!variants.length) throw new Error('至少给一个 "interval,life" 组合');

const blockRe = /(id: 'ji',[\s\S]*?desc: '[^']*',\n)([\s\S]*?)(\n  \},\n  \{\n    id: 'xun',)/;
const m = orig.match(blockRe);
if (!m) throw new Error('MISS ji block');

for (const v of variants) {
  const [iv, lf] = v.split(',').map(Number);
  const lines = [];
  if (Number.isFinite(iv) && iv !== 1) lines.push(`    intervalMul: ${iv},`);
  if (Number.isFinite(lf) && lf !== 0) lines.push(`    lifeInc: ${lf},`);
  lines.push('    dropBonus: 0.05,');
  const patched = orig.replace(blockRe, (all, head, _body, tail) => head + lines.join('\n') + tail);
  fs.writeFileSync(P, patched, 'utf8');
  const tag = `i${iv}_l${lf}`.replace(/\./g, 'p').replace(/-/g, 'm');
  const log = `tmp/exp-ji-${tag}.log`;
  const json = `tmp/exp-ji-${tag}.json`;
  spawnSync(process.execPath, [
    'tools/run-timeline.mjs',
    '--seeds=12',
    '--minutes=900',
    '--post-cap',
    '--talents=off',
    '--cycle=0',
    `--json=${json}`,
    `--label=${tag}`,
  ], { stdio: ['ignore', fs.openSync(log, 'w'), fs.openSync(log, 'a')] });
  const j = JSON.parse(fs.readFileSync(json, 'utf8'));
  const ms = j.runs.map((r) => r.maxedAt).filter(Number.isFinite).sort((a, b) => a - b);
  const before = j.runs.filter((r) => Number.isFinite(r.formedPowerAt) && Number.isFinite(r.maxedAt) && r.formedPowerAt <= r.maxedAt).length;
  const falses = Object.keys(j.verdict).filter((k) => j.verdict[k] === false);
  console.log(
    `${v.padEnd(10)} 满级 ${ms[ms.length >> 1].toFixed(1)} ｜成型早于满级 ${before}/12 ｜死亡中位 ${j.verdict.deathMed} ｜首撞 ${j.verdict.firstWallMin} ｜false: ${falses.join('|') || 'none'}`,
  );
}

fs.writeFileSync(P, orig, 'utf8');
console.log('已还原');
