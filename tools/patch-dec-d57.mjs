// 追加 D57 到 docs/DECISIONS.md（重铸「保底不亏」= 把赌改造成单调算子）
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const FILE = path.join(ROOT, 'docs/DECISIONS.md');
const before = fs.readFileSync(FILE, 'utf8');

const lines = [
  '',
  '### D57 重铸「保底不亏」：把赌改造成单调算子（2026-10-22，ceshi B 反证后的第三版）',
  '- **背景**：ceshi 真 session 反证「D55 只修了一半」——`craftAddAffix` 显式优先已穿件、`craftReforgeWorstAffix` 漏 `!isWorn`，',
  '  把已穿玉佩从 55.9 洗到 51.09。第一版修法是「赌类操作一律只作用于背包件」，但实测三个副作用：',
  '  ① 段② 成型 299.3 → **336.6min（+16.1%，门禁红）**；② 黄阶花掉率 96.8% 仍高但**灭灵石跌到 84.9%（目标 95%）**；',
  '  ③ 已穿件永远吃不到「重掷最弱一条」这个**期望为正**的改进（新骰平均 > 当前最弱）。',
  '- **真正的判据不是「改没改身上件」，而是「身上件的战力有没有可能下降」**。据此把打造操作分成两类：',
  '  - **单调**：添灵纹（只会多一条正向灵纹）→ 允许作用于已穿件，且优先挑已穿件（自动换装会把好东西瞬间穿上，通货花在身上那件才不是白扔）。',
  '  - **赌**：洗灵石（全重掷）、灭灵石（删一条）→ 只作用于背包件。',
  '  - **赌但有保单**：满条兜底重铸 → **改成保底不亏**（见下），因此可以作用于已穿件。',
  '- **保底不亏的写法**（`src/core/crafting.ts` `craftReforgeWorstAffix`）：掷完算 `itemPower`，**若比原来低就保留原样，但通货照扣**。',
  '  保单的钱不退 —— 退了就等于无限免费重掷。这样「赌」被改造成「只会向上的随机游走」：',
  '  收益随时间收敛到「该灵蕴下这条灵纹的最好骰点」（有界，不产生无限战力，符合 D45）。',
  '- **实测（3 种子 900min `--post-cap`）**：段② 成型 **299.3 / 202.5 / 286.3，中位 286.3（−1.3%），3/3 达成 → 通过**；',
  '  满级 351.3 / 337.1 / 399.5，中位 **351.3（−13.5%）**—— 仍在 ±15% 窗口内但已靠近边缘（重铸保底带来的成长加速）；',
  '  出货 2.37~2.84/分、法宝 0.91~1.17/分、死亡 0/0/0；`craft-econ --hours=5` **通过**（黄阶 100.0%、灭灵石 97.7%、洗灵石 100.0%）。',
  '- **测试**（`tests/equip-craft.test.ts` 18 条 + `tests/crafting.test.ts` 8 条）：新增「已穿件可作为重铸目标但战力绝不下降」、',
  '  「连续 40 次重铸（真 rng）已穿件战力单调不降」；旧「黄阶永远有出口」断言恢复为 `spent=3` 但语义换成「保底不亏」。',
  '- `tsc 0` / `vitest 458 passed / 32 files` / `run-timeline` 硬门禁（满级窗口 + 判据 C + 结构性断言）**全绿 EXIT=0**。',
];

const next = before.trimEnd() + '\n' + lines.join('\n') + '\n';
if (next.length < before.length * 1.01) throw new Error(`长度断言失败 ${before.length} -> ${next.length}`);
fs.mkdirSync(path.join(ROOT, 'tools/_bak'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'tools/_bak/DECISIONS.md.bak-d57'), before);
fs.writeFileSync(FILE, next);
console.log(`ok: ${before.length} -> ${next.length}`);
