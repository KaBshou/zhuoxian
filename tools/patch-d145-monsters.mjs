// D145（shuzhi 排序 B）：每阶 +2 只新怪（12 → 18），同阶 hpMul/dmgMul/xpMul 均值不变
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve('.');
const p = 'src/data/monsters.ts';
const raw = fs.readFileSync(path.join(ROOT, p), 'utf8');
const crlf = raw.includes('\r\n');
let t = raw.replace(/\r\n/g, '\n');

// ① 一阶末尾插两只（在「// ── 第二阶」注释之前）
const t1Anchor = '  // ── 第二阶（数值形态沿用旧表相对比例，绝对量交给层曲线） ──';
const t1New = [
  '  // D145（shuzhi B 批）：一阶补两只，凑齐「木」元素偏向 —— 一阶原本只有金/火/水/土，',
  '  // 玩家在层 1~9 看不到木属性怪；+1.10/0.90 与 +0.90/1.10 成对插入，四只合成均值仍 1.00。',
  '  M({',
  "    id: 'lingtian-kunong',",
  "    name: '灵田枯农',",
  '    tier: 1,',
  "    element: 'wood',",
  '    hpMul: 1.1,',
  '    dmgMul: 0.9,',
  '    armor: 4,',
  '    resist: { resWood: 0.3, resFire: -0.2 },',
  '    speed: 24,',
  '    attackInterval: 1.5,',
  '    attackRange: 32,',
  '    size: 30,',
  '    xpMul: 1.0,',
  '  }),',
  '  M({',
  "    id: 'beilin-shuli',",
  "    name: '碑林书吏',",
  '    tier: 1,',
  "    element: 'earth',",
  '    hpMul: 0.9,',
  '    dmgMul: 1.1,',
  '    armor: 14,',
  '    resist: { resEarth: 0.25, resMetal: -0.15 },',
  '    speed: 30,',
  '    attackInterval: 1.7,',
  '    attackRange: 36,',
  '    size: 28,',
  '    xpMul: 1.0,',
  '  }),',
  '',
  t1Anchor,
].join('\n');
if (!t.includes(t1Anchor)) throw new Error('MISS t1');
t = t.replace(t1Anchor, t1New);

// ② 二阶末尾插两只（在「// ── 第三阶」之前）
const t2Anchor = '  // ── 第三阶 ──────────────────────────────────────────────';
const t2New = [
  '  // D145：二阶补两只（水/土）；1.05+0.95 与 1.10+0.90 ⇒ 六只合计均值仍 1.00。',
  '  M({',
  "    id: 'zhuodan-tong',",
  "    name: '浊丹童',",
  '    tier: 2,',
  "    element: 'water',",
  '    hpMul: 1.05,',
  '    dmgMul: 1.1,',
  '    armor: 8,',
  '    resist: { resWater: 0.35, resEarth: -0.2 },',
  '    speed: 26,',
  '    attackInterval: 1.4,',
  '    attackRange: 34,',
  '    size: 30,',
  '    xpMul: 3.3,',
  '  }),',
  '  M({',
  "    id: 'yaowang-shitong',",
  "    name: '药王侍童',",
  '    tier: 2,',
  "    element: 'earth',",
  '    hpMul: 0.95,',
  '    dmgMul: 0.9,',
  '    armor: 20,',
  '    resist: { resEarth: 0.3, resWood: -0.2 },',
  '    speed: 18,',
  '    attackInterval: 1.9,',
  '    attackRange: 34,',
  '    size: 32,',
  '    xpMul: 3.2,',
  '  }),',
  '',
  t2Anchor,
].join('\n');
if (!t.includes(t2Anchor)) throw new Error('MISS t2');
t = t.replace(t2Anchor, t2New);

// ③ 三阶末尾插两只（MONSTERS 数组闭合处 —— 用最后一只的尾巴当锚点）
const closeAnchor = ['    attackRange: 46,', '    size: 36,', '    xpMul: 10.6,', '  }),', '];'].join('\n');
const closeNew = [
  '    attackRange: 46,',
  '    size: 36,',
  '    xpMul: 10.6,',
  '  }),',
  '  // D145：三阶补两只（火/木）。三阶 hpMul 全部是「相对 D18 归一值 ×0.7」（D30），',
  '  // 新增两只同样按 0.7 口径给（0.68 / 0.72），六只合计均值仍 0.70。',
  '  M({',
  "    id: 'dujie-yujin',",
  "    name: '渡劫余烬',",
  '    tier: 3,',
  "    element: 'fire',",
  '    hpMul: 0.68,',
  '    dmgMul: 1.05,',
  '    armor: 25,',
  '    resist: { resFire: 0.35, resWater: -0.2 },',
  '    speed: 34,',
  '    attackInterval: 1.1,',
  '    attackRange: 44,',
  '    size: 34,',
  '    xpMul: 10.1,',
  '  }),',
  '  M({',
  "    id: 'taiqing-canling',",
  "    name: '太清残灵',",
  '    tier: 3,',
  "    element: 'wood',",
  '    hpMul: 0.72,',
  '    dmgMul: 0.95,',
  '    armor: 35,',
  '    resist: { resWood: 0.3, resFire: -0.25 },',
  '    speed: 24,',
  '    attackInterval: 1.6,',
  '    attackRange: 40,',
  '    size: 36,',
  '    xpMul: 9.8,',
  '  }),',
  '];',
].join('\n');
if (!t.includes(closeAnchor)) throw new Error('MISS close');
t = t.replace(closeAnchor, closeNew);

if (t.length < raw.length) throw new Error('SHRINK');
fs.writeFileSync(path.join(ROOT, p), crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
console.log(`patched ${p} (${raw.length} -> ${t.length})`);
