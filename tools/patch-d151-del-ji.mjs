// D151（shuzhi v4.69 定案 C）：**删除 `ji`（疾行）条目**，速度类只剩 `xun` 单条；
// 同时删除 `speedInc` 这个已无生产者的通道（不留第 7 个死通道）。
// 依据：0.97/−0.05 版本「过门禁的原因就是它没效果」= 数值低于感知阈值的假词条，比代码没人消费更危险。
import fs from 'node:fs';

function patch(file, edits) {
  const raw = fs.readFileSync(file, 'utf8');
  const crlf = raw.includes('\r\n');
  let t = raw.replace(/\r\n/g, '\n');
  for (const [a, b] of edits) {
    if (!t.includes(a)) throw new Error('MISS in ' + file + ': ' + a.slice(0, 70));
    t = t.replace(a, b);
  }
  if (t.length >= raw.replace(/\r\n/g, '\n').length) {
    // 删除总是变短；这里只做兜底提示，个别编辑可能等长（如替换同长字符串）
    if (!t.includes('ji')) console.log('  (file shrunk as expected: ' + file + ')');
  }
  fs.writeFileSync(file, crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
  console.log('patched', file);
}

// ① 删数据表条目
const jiBlock = `  {
    id: 'ji',
    name: '疾行',
    category: 'speed',
    desc: '腿骨被浊气撑长了半寸：出手快，骨头也脆。',
    // D150：**删掉纯移速通道**（\`speedInc\`）。
    // 实测（\`tools/measure-ji.mjs\`，12 种子配对）：speedInc 0 / 0.25 / 0.5 三档，
    // 击杀/分 13.99 / 14.26 / 13.65（+50% 反而低 2.4%），而承伤/kill 10.89 → 11.45 → 11.51 单调上升。
    // 机制：总伤害 = 单体 DPS × 接触时长，接触时长 = 存活时长 − 走路时长；
    // speed ↑ 只缩短走路 ⇒ 存活时长由玩家 DPS 决定 ⇒ **击杀率不变，只是把伤害提前兑现**。
    // 也就是说移速在「固定波次 + 挂机」里不是威胁通道、也不是收益通道 —— 是纯负面的假词条。
    // 替换成「快但脆」：出手间隔 ×0.85、气血 ×0.80 ⇒ 出手快 17.6%、单只总伤害 ×0.94（略偏玩家），
    // 与 \`kuang\`（狂怒：伤害 +70% / 间隔 ×1.5 = 慢而重）形成对称。
    intervalMul: 0.97,
    lifeInc: -0.05,
    dropBonus: 0.05,
  },
`;
const note = `  // ── 速度 ────────────────────────────────────────────────
  // D151：原来这里有 \`ji\`（疾行，speedInc +50%）。实测它是**净负面假词条**
  // （击杀率不升反降 2.4%、承伤/kill 单调 +5.7%），改成「快但脆」又会让满级提前 7.3%
  // 或低于感知阈值（0.97/−0.05 版本"过门禁的原因就是它没效果"）。
  // 结论：**删条目**。速度类只留 \`xun\`；不变量是「每类至多 1 条」（上限约束，不是等量约束）。
  // 若将来要恢复「快但脆」，规格是 \`intervalMul 0.85 + lifeInc -0.20\`，
  // **启用条件 = 下一次时间轴本来就要重标的时候**（那时 XP×1.08 与整链重跑本来就是那一轮的事）。
`;
patch('src/data/monster-affixes.ts', [
  ['  // ── 速度 ────────────────────────────────────────────────\n', note],
  [jiBlock, ''],
  ['  readonly speedInc?: number;\n', ''],
  ['  readonly speedInc: number;\n', ''],
  ['  speedInc: 0,\n', ''],
  ['  let speedInc = 0;\n', ''],
  ['  speedInc += def.speedInc ?? 0;\n', ''],
  ['    speedInc,\n', ''],
]);

// ② 战斗侧：speed 不再吃妖纹（移速通道已随条目一起删除）
patch('src/core/battle.ts', [
  ['        speed: def.speed * (1 + affix.speedInc),', '        // D151：移速通道已随 `ji` 条目一起删除（移速在挂机里既不加威胁也不加收益）。\n        speed: def.speed,'],
]);
