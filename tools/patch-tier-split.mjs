// 一次性补丁：27 层模型下三阶的层段划分。跑完即弃。
// tierOfFloor：1~9 阶1、10~18 阶2、19~27 阶3（BALANCE v2：27 层 = 三段各 9 层）
// floorOfTier：该阶第一层 1/10/19（兼容包装用；怪表选取已改用 tierOfFloor 直查）
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
  c = replIn(p, c,
    "export function floorOfTier(tier: 1 | 2 | 3): number {\n  return tier * 3;\n}",
    "export function floorOfTier(tier: 1 | 2 | 3): number {\n  // 27 层模型：三段各 9 层，该阶第一层是 1/10/19\n  return (tier - 1) * 9 + 1;\n}",
    'flooroftier');
  c = replIn(p, c,
    "  if (f <= 3) return 1;\n  if (f <= 6) return 2;\n  return 3;\n}",
    "  if (f <= 9) return 1;\n  if (f <= 18) return 2;\n  return 3;\n}",
    'tieroffloor');
  save(p, c);
}
{
  const p = 'src/core/drop.ts';
  let c = load(p);
  // ilvlForFloor 的 clamp 19 是旧 9 层模型残留，放开到 27
  c = replIn(p, c, "  const f = Math.max(1, Math.floor(floor));\n  return Math.max(1, Math.min(99, Math.round((99 * f) / 27)));",
    "  const f = Math.max(1, Math.min(27, Math.floor(floor)));\n  return Math.max(1, Math.min(99, Math.round((99 * f) / 27)));",
    'clamp27');
  save(p, c);
}

if (misses.length > 0) { console.error('MISS:', misses.join(' | ')); process.exit(1); }
console.log('OK');
