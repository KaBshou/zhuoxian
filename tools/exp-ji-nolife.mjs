// 临时实验：把 `ji` 的 `lifeInc` 行拿掉（只保留 intervalMul 0.85），跑一次 c0 门禁看是否中性。
// 用法：node tools/exp-ji-nolife.mjs <on|off>
import fs from 'node:fs';

const P = 'src/data/monster-affixes.ts';
const BAK = 'tools/_bak/monster-affixes.ts.ji';
const mode = process.argv[2] ?? 'on';

if (mode === 'off') {
  const cur = fs.readFileSync(P, 'utf8');
  fs.mkdirSync('tools/_bak', { recursive: true });
  fs.writeFileSync(BAK, cur, 'utf8');
  const next = cur.replace(/^\s*lifeInc: -0\.2,\r?\n/m, '');
  if (next === cur) throw new Error('MISS lifeInc 行');
  fs.writeFileSync(P, next, 'utf8');
  console.log('lifeInc 行已移除');
} else {
  if (!fs.existsSync(BAK)) throw new Error('没有备份，无法还原');
  fs.writeFileSync(P, fs.readFileSync(BAK, 'utf8'), 'utf8');
  console.log('已还原');
}
