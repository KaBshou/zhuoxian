// v4.1 测试迁移第二轮：硬编码值 1.5 → 1.2（第一轮只改了标题，断言行在文件更下方）
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/tests/battle.test.ts';
let c = fs.readFileSync(p, 'utf8');
let miss = 0;
function repl(oldS, neu, tag) {
  if (!c.includes(oldS)) { console.error('MISS: ' + tag); miss++; return; }
  c = c.replace(oldS, neu);
  console.log('OK: ' + tag);
}

repl("expect(boss.dmgMul, `tier ${t} dmg val`).toBe(1.5);", "expect(boss.dmgMul, `tier ${t} dmg val`).toBe(1.2);", 'dmg val 1.2');

// v2 的解释注释也过时了
repl(
  "// v2 定稿：×25 血不变（单场 239s，血和 DPS 同步缩放），攻伐降回 ×1.5，",
  "// v4.1 定稿：×25 血不变，攻伐 ×1.2（v2 是 ×1.5，v4.1 因层 27 镇守战 99.1% 入伤再降），",
  'comment',
);

if (miss > 0) process.exit(1);
fs.writeFileSync(p, c, 'utf8');
console.log('written');
