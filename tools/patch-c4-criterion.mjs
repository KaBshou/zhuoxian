// 一次性：判据 C 改成 C4（D68）—— 9/10 部位 ≥1.00 且最差部位 ≥0.70，并要求
// 「首次满足起**连续 30 分钟**不跌破」才算成型。
//
// 起因（shuzhi v4.32 用同口径六判据实测）：
//   现行 10/10   中位 276.1 / 最差 401.2（极差 45%）  ← 被单部位烂骰主导
//   纯 9/10      中位 187.1 / 最差 190.1（极差 1.6%） ← 但允许空槽/0.5 级烂骰，语义撑不住「成型」
//   **C4 9/10+下限 0.70  中位 190.1 / 最差 233.1（极差 23%）** ← 采用
//   纯 min≥0.85 与 10/10 读数**一字不差**（卡住的部位在 0.49~0.78，降阈值没松开约束）
//
// 更要紧的是：判据 C **不是单调量**（D61「带传奇就换」允许低战力仙品顶掉高战力宝品，
// 且换更高灵蕴的件时分母跟着涨），首次达成后仍会跌破 1~5 次，读数在 210~360 之间随机。
// 所以「首次达成」必须定义成「首次满足起连续 30 分钟不跌破，跌破重新计时」。
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/tools/session-runner.mjs';
const raw = fs.readFileSync(p, 'utf8');
const crlf = raw.includes('\r\n');
let c = raw.replace(/\r\n/g, '\n');

const repl = (oldText, newText, tag) => {
  if (!c.includes(oldText)) throw new Error(`MISS ${tag}`);
  c = c.replace(oldText, newText);
  console.log(`ok ${tag}`);
};

// 1) 常量与状态
repl(
  '  const FORMED_POWER_RATIO = 1.0;',
  [
    '  const FORMED_POWER_RATIO = 1.0;',
    '  // C4（D68）：9/10 部位过线 + 最差部位下限 0.70。',
    '  // 为什么要有下限：纯 9/10 允许那一个部位是空槽（ratio 0）或骰烂 50%，',
    '  // 「9 个部位成型了」这句话就撑不住；下限只用来挡住「根本没穿」和「烂到不配叫成型」。',
    '  const FORMED_MIN_SLOTS = 9;',
    '  const FORMED_WORST_FLOOR = 0.7;',
    '  // 持续窗口：判据 C 不是单调量（首次达成后会跌破），所以「成型」= 连续 30 分钟不跌破。',
    '  const FORMED_SUSTAIN_MIN = 30;',
  ].join('\n'),
  'consts',
);

repl(
  '  let formedPowerAt = NaN;',
  [
    '  let formedPowerAt = NaN;',
    '  /** 当前这一轮「连续满足」的起点（分钟）。跌破即清空 = 重新计时 */',
    '  let formedRunSince = NaN;',
    '  /** 判据 C 的采样统计（诊断用：有多少次采样是满足的） */',
    '  let powerChecks = 0;',
    '  let powerChecksOk = 0;',
    '  /** 判据 C 连续满足的最长一段（分钟），用来判断 30min 窗口是否过紧 */',
    '  let powerBestRun = 0;',
  ].join('\n'),
  'state',
);

// 2) 采样逻辑
repl(
  [
    '      let powerOk = true;',
    '      let worst = Number.POSITIVE_INFINITY;',
    '      for (const slot of EQUIP_SLOTS) {',
    '        const it = ch.equipment[slot];',
    '        const kind = slot.startsWith(\'ring\') ? \'ring\' : slot;',
    '        const base = slotBasePower(kind, it ? it.ilvl : 1);',
    '        if (!it || base <= 0) {',
    '          powerOk = false;',
    '          worst = 0;',
    '          continue;',
    '        }',
    '        const ratio = inventoryMod.itemPower(it) / base;',
    '        if (ratio < worst) worst = ratio;',
    '        if (ratio < FORMED_POWER_RATIO) powerOk = false;',
    '      }',
    '      minPowerRatio = worst;',
    '      if (powerOk) formedPowerAt = minute;',
  ].join('\n'),
  [
    '      let worst = Number.POSITIVE_INFINITY;',
    '      let passing = 0;',
    '      for (const slot of EQUIP_SLOTS) {',
    '        const it = ch.equipment[slot];',
    '        const kind = slot.startsWith(\'ring\') ? \'ring\' : slot;',
    '        const base = slotBasePower(kind, it ? it.ilvl : 1);',
    '        if (!it || base <= 0) {',
    '          worst = 0;',
    '          continue;',
    '        }',
    '        const ratio = inventoryMod.itemPower(it) / base;',
    '        if (ratio < worst) worst = ratio;',
    '        if (ratio >= FORMED_POWER_RATIO) passing += 1;',
    '      }',
    '      minPowerRatio = worst;',
    '      powerChecks += 1;',
    '      // C4：过线部位数 ≥9 且最差部位 ≥0.70（挡空槽与烂骰）',
    '      const powerOk = passing >= FORMED_MIN_SLOTS && worst >= FORMED_WORST_FLOOR;',
    '      if (powerOk) {',
    '        powerChecksOk += 1;',
    '        if (!Number.isFinite(formedRunSince)) formedRunSince = minute;',
    '        powerBestRun = Math.max(powerBestRun, minute - formedRunSince);',
    '        // 连续 30 分钟不跌破 → 成型时刻 = 这一段**起点**（不是确认时刻）',
    '        if (!Number.isFinite(formedPowerAt) && minute - formedRunSince >= FORMED_SUSTAIN_MIN) {',
    '          formedPowerAt = formedRunSince;',
    '        }',
    '      } else {',
    '        formedRunSince = NaN;',
    '      }',
  ].join('\n'),
  'c4-check',
);

// 3) 诊断字段透出（两处 return 都加）
repl(
  '    /** 判据 C（定稿）：每部位 itemPower ≥ 同部位同灵蕴宝品中位 ×1.0 的达成分钟 */\n    formedPowerAt,\n    /** 判据 C 的最差部位比值（满级那刻的值，>1 = 全身达标） */\n    minPowerRatio,',
  [
    '    /** 判据 C（D68 / C4）：9/10 部位 itemPower ≥ 同部位同灵蕴宝品中位 ×1.0 且最差部位 ≥0.70，',
    '     * 并连续 30 分钟不跌破，取这一段**起点**（判据 C 不是单调量，跌破会重新计时） */',
    '    formedPowerAt,',
    '    /** 判据 C 的最差部位比值（满级那刻的值，>1 = 全身达标） */',
    '    minPowerRatio,',
    '    /** 判据 C 的采样统计：采样次数 / 满足次数（诊断「30min 窗口是否过紧」用） */',
    '    powerChecks,',
    '    powerChecksOk,',
    '    /** 判据 C 连续满足的最长一段（分钟） */',
    '    powerBestRun,',
  ].join('\n'),
  'return-1',
);
repl(
  '        formedPowerAt,\n        minPowerRatio,',
  [
    '        formedPowerAt,',
    '        minPowerRatio,',
    '        powerChecks,',
    '        powerChecksOk,',
    '        powerBestRun,',
  ].join('\n'),
  'return-2',
);

fs.writeFileSync(p, crlf ? c.replace(/\n/g, '\r\n') : c, 'utf8');
console.log(`done crlf=${crlf} ${raw.length} -> ${c.length}`);
