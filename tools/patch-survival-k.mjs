// D114 附：measure-survival 报表补一列 K（致死倍率）的实测绝对值。
//
// 教训（A1 同族）：补丁脚本里**不能嵌套反引号模板** —— 要生成的代码本身含反引号时，
// 一律用单引号字符串 + BT 常量拼接，不要写成 `...${...}...` 套 `...${...}...`。
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const ROOT = 'F:\\dsh-work\\zhuoxian\\';
const rel = 'tools/measure-survival.mjs';
const path = ROOT + rel;
const raw = readFileSync(path, 'utf8');
const crlf = raw.includes('\r\n');
let text = raw.replace(/\r\n/g, '\n');
const before = text.length;
const BT = String.fromCharCode(96);
const D = '$';

function one(tag, oldText, newText) {
  if (text.includes(newText)) return;
  const hits = text.split(oldText).length - 1;
  if (hits !== 1) throw new Error(`[${tag}] 锚点命中 ${hits} 次`);
  text = text.replace(oldText, newText);
}

one(
  'table-head',
  "    console.log('| atk-mul | 种子 | μ (%/s) | 入伤/波 | 波 | 死亡 | maxHit | 还能挨几下 | 护盾段/波 | 吸收占比 |');\n" +
    "    console.log('|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');",
  "    console.log(\n" +
    "      '| atk-mul | 种子 | μ (%/s) | K（致死倍率） | 入伤/波 | 波 | 死亡 | maxHit | 还能挨几下 | 护盾段/波 | 吸收占比 |',\n" +
    "    );\n" +
    "    console.log('|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');",
);

// 行内加 K 列：把 K 插到 μ 之后
one(
  'table-row',
  "        `| ${r.mul} | ${r.seed} | ${f(r.muPctPerSec)} | ${f(r.hitsPerWave, 1)} |",
  "        `| ${r.mul} | ${r.seed} | ${f(r.muPctPerSec)} | ${f(deathMultiplier(r))} | ${f(r.hitsPerWave, 1)} |",
);

one(
  'summary-calc',
  "      const hitsToDieMed = med(base.map((x) => x.hitsToDie));",
  "      const hitsToDieMed = med(base.map((x) => x.hitsToDie));\n" +
    "      const kMed = med(base.map(deathMultiplier));\n" +
    "      const kMin = Math.min(...base.map(deathMultiplier).filter(Number.isFinite));",
);

one(
  'summary-print',
  "致死代理「还能挨几下」中位 ${f(hitsToDieMed, 1)}`,",
  "致死代理「还能挨几下」中位 ${f(hitsToDieMed, 1)} · " +
    BT +
    "**K 中位 ${f(kMed)}**（最险样本 ${f(kMin)}；K=1 表示窗口内正好被打死）" +
    BT +
    "`,",
);

one(
  'helper',
  "  for (const floor of FLOORS) {",
  "  const windowSeconds = WINDOW_MIN * 60;\n" +
    "  /** K = 1 / (μ% / 100 × 窗口秒数)：把怪物伤害乘多少倍才会在窗口内打死玩家。 */\n" +
    "  const deathMultiplier = (r) => {\n" +
    "    const mu = r.muPctPerSec;\n" +
    "    if (!Number.isFinite(mu) || mu <= 0) return Number.POSITIVE_INFINITY;\n" +
    "    return 100 / (mu * windowSeconds);\n" +
    "  };\n\n" +
    "  for (const floor of FLOORS) {",
);

const delta = text.length - before;
if (delta < 100 || delta > 6000) throw new Error(`改动量异常：${delta}`);
mkdirSync(ROOT + 'tools/_bak', { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
if (existsSync(path)) copyFileSync(path, `${ROOT}tools/_bak/measure-survival.mjs.${stamp}.bak`);
writeFileSync(path, crlf ? text.replace(/\n/g, '\r\n') : text, 'utf8');
console.log(`OK ${rel} ${before} → ${text.length}（+${delta}）`);
