// 一次性补丁 3：progression.ts 头注释（补丁 2 的 MISS 是全角空格问题）。跑完即弃。
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/src/core/progression.ts';
let c = fs.readFileSync(p, 'utf8');

const old = " *   本境突破所需修为 R(k) = 180 × 1.56^k   （k = 大境界序号 0~8）";
const neu = " *   本境总修为 R(k)：显式数组 BREAKTHROUGH_XP（合计 158617 ≈ 336min = 5.6h）";
if (!c.includes(old)) { console.error('MISS'); process.exit(1); }
c = c.split(old).join(neu);

const old2 = " * 数值已按 `docs/BALANCE.md` §4 标定（不再是占位值）：";
const neu2 = " * 数值已按 `docs/BALANCE.md` §4（v2，shuzhi 2026-10-22 定稿）标定：";
if (!c.includes(old2)) { console.error('MISS2'); process.exit(1); }
c = c.split(old2).join(neu2);

fs.writeFileSync(p, c, 'utf8');
console.log('OK');
