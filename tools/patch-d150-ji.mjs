import fs from 'node:fs';
const P = 'src/data/monster-affixes.ts';
const raw = fs.readFileSync(P, 'utf8');
const crlf = raw.includes('\r\n');
let t = raw.replace(/\r\n/g, '\n');
const a = [
  "    id: 'ji',",
  "    name: '疾行',",
  "    category: 'speed',",
  "    desc: '腿骨被浊气撑长了半寸，跑起来比你快。',",
  '    speedInc: 0.5,',
].join('\n');
const b = [
  "    id: 'ji',",
  "    name: '疾行',",
  "    category: 'speed',",
  "    desc: '腿骨被浊气撑长了半寸：出手快，骨头也脆。',",
  '    // D150：**删掉纯移速通道**（`speedInc`）。',
  '    // 实测（`tools/measure-ji.mjs`，12 种子配对）：speedInc 0 / 0.25 / 0.5 三档，',
  '    // 击杀/分 13.99 / 14.26 / 13.65（+50% 反而低 2.4%），而承伤/kill 10.89 → 11.45 → 11.51 单调上升。',
  '    // 机制：总伤害 = 单体 DPS × 接触时长，接触时长 = 存活时长 − 走路时长；',
  '    // speed ↑ 只缩短走路 ⇒ 存活时长由玩家 DPS 决定 ⇒ **击杀率不变，只是把伤害提前兑现**。',
  '    // 也就是说移速在「固定波次 + 挂机」里不是威胁通道、也不是收益通道 —— 是纯负面的假词条。',
  '    // 替换成「快但脆」：出手间隔 ×0.85、气血 ×0.80 ⇒ 出手快 17.6%、单只总伤害 ×0.94（略偏玩家），',
  '    // 与 `kuang`（狂怒：伤害 +70% / 间隔 ×1.5 = 慢而重）形成对称。',
  '    intervalMul: 0.85,',
  '    lifeInc: -0.2,',
].join('\n');
if (!t.includes(a)) throw new Error('MISS ji def');
t = t.replace(a, b);
if (t.length < raw.replace(/\r\n/g, '\n').length) throw new Error('SHRINK');
fs.writeFileSync(P, crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
console.log('ji -> intervalMul 0.85 / lifeInc -0.2 (speedInc removed)');
