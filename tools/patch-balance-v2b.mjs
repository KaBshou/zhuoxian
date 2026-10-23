// 一次性补丁（v2 第二轮）：修两处实际文本不匹配。跑完即弃。
import fs from 'node:fs';

let misses = [];
function load(p) { return fs.readFileSync('F:/dsh-work/zhuoxian/' + p, 'utf8'); }
function save(p, c) { fs.writeFileSync('F:/dsh-work/zhuoxian/' + p, c, 'utf8'); }
function replIn(p, c, old, neu, tag) {
  if (!c.includes(old)) { misses.push(p + ':' + tag); return c; }
  return c.split(old).join(neu);
}

{
  const p = 'src/data/monsters.ts';
  let c = load(p);
  c = replIn(p, c, 'export const MAX_FLOOR = 9;', 'export const MAX_FLOOR = 27;', 'mfloor');
  save(p, c);
}
{
  const p = 'src/core/drop.ts';
  let c = load(p);
  c = replIn(p, c,
    "/** 灵蕴 = 5 × 层数（BALANCE §13 D1；层 1 = 5，二阶基底门槛 10 要到层 2 才开） */\nexport function ilvlForFloor(floor: number): number {\n  const f = Math.max(1, Math.min(19, Math.floor(floor)));\n  return Math.min(99, 5 * f);\n}",
    "/** 灵蕴映射（BALANCE v2 表 F）：affixIlvlOfFloor = round(99×f/27)。\n * 层 1~4 黄、5~8 玄、9~12 地、13~27 天（15/15/15/56%）。旧的 5×层 在 27 层下\n * 最高 29，地/天两档永远洗不出来，作废。 */\nexport function ilvlForFloor(floor: number): number {\n  const f = Math.max(1, Math.floor(floor));\n  return Math.max(1, Math.min(99, Math.round((99 * f) / 27)));\n}",
    'ilvl');
  save(p, c);
}

if (misses.length > 0) { console.error('MISS:', misses.join(' | ')); process.exit(1); }
console.log('OK round2');
