// 一次性：落 D68（判据 C 改成 C4 + 持续窗口 + 成型比值 0.56），并把段④ 旗子比例口径写死。
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/docs/DECISIONS.md';
const raw = fs.readFileSync(p, 'utf8');
const crlf = raw.includes('\r\n');
const before = raw.replace(/\r\n/g, '\n');

const block = [
'',
'### D68 段② 判据改 C4（9/10 过线 + 最差 ≥0.70 + 连续 30 分钟不跌破），比值 0.80→0.56（2026-10-22，shuzhi v4.32）',
'- **背景**：D66 记的「min-of-10 由最倒霉部位决定」被 shuzhi 用**六判据同口径实测**夯实（她自己建探针',
'  `F:\\dsh-work\\tmp\\criteria-fine.mjs`，3 种子、dt=1/30、无天赋、每分钟采样）：',
'',
'  | 判据 | 中位(min) | 最差种子(min) | 极差 |',
'  |---|---:|---:|---:|',
'  | C0 现行 10/10 | 276.1 | **401.2** | **45%** |',
'  | C1 纯 9/10 | 187.1 | 190.1 | 1.6% |',
'  | C2 min ≥0.85（我提的） | 276.1 | 401.2 | 45% |',
'  | C3 平均≥1.00 且 min≥0.70 | 190.1 | 233.1 | 23% |',
'  | **C4 9/10 且 min≥0.70（采用）** | **190.1** | **233.1** | **23%** |',
'  | C5 平均≥1.00 | 49.0 | 80.0 | 63% |',
'',
'- **为什么否决我提的「最差 ≥0.85」**：读数与现行 10/10 **一字不差** —— 卡住的部位在 **0.49~0.78**，',
'  把门槛从 1.00 降到 0.85 根本没松开约束。它只能救「差 15%」的种子，救不了「骰烂 50%」的种子。',
'- **为什么不选纯 9/10**：允许那一个部位**任意烂、甚至空槽**（ratio 0），「9 个部位成型了」这话语义撑不住。',
'  C4 加下限 0.70，时间几乎不变（190.1 vs 187.1），但挡得住空槽与 0.5 级烂骰。',
'- **比更换判据更重要的发现（这条才是根因）**：判据 C **不是单调量**。`gearTrail` 的 min 序列在首次达成后',
'  仍跌破 1~5 次（1.17→1.08→**0.81**→1.54；1.05→**0.70→0.70**→0.92→1.08；1.18→**0.58**→1.12）。',
'  根因两条：① **D61「带传奇就换」允许低 `itemPower` 的仙品顶掉高战力宝品**；',
'  ② 换更高灵蕴的件时**分母跟着涨**（`slotBasePower(kind, it.ilvl)` 用该件自己的灵蕴）。',
'  ⇒ 「首次达成」这个读数取决于当天运气（210 也可能 360），必须定义成',
'  「**首次满足起连续 30 分钟不跌破，跌破重新计时**」。',
'- **落地**（`tools/session-runner.mjs`）：`FORMED_MIN_SLOTS = 9`、`FORMED_WORST_FLOOR = 0.7`、',
'  `FORMED_SUSTAIN_MIN = 30`；采样时算 `passing` 与 `worst`，满足即记 `formedRunSince`，跌破清空；',
'  `minute - formedRunSince >= 30` 才把 `formedPowerAt = formedRunSince`（**成型时刻取这一段起点**，',
'  不是确认时刻）。新增诊断字段 `powerChecks / powerChecksOk / powerBestRun`。',
'- **常数（`tools/run-timeline.mjs`）**：`FORMED_RATIO` **0.80 → 0.56**、`FORMED_TARGET` **264 → 185**、',
'  `FORMED_MAX` **350 → 240**。别用 0.63~0.69 的直觉 —— 那是**纯 9/10** 的比值 0.552；C4 带下限后是 0.561。',
'- **`run-timeline` 复跑（3 种子 900min `--post-cap`，无天赋 dt=1/30）**：成型 **193.9 / 254.6 / 148.3**，',
'  中位 **193.9（+4.8% vs 185）**、**3/3 达成**、结构性断言通过（最晚 254.6 < 满级 323.2）→ **段② 转绿**。',
'  与 shuzhi 探针的 190.1 相差 3.8min（她已披露自身探针绝对时长在 seed2 差 100min，属口径差）。',
'- **遗留（待判）**：`FORMED_MAX = 240` 是按「最差种子 233.1 ×1.03」定的，但本轮实测**最差种子 254.6 > 240**；',
'  现行门禁只判中位，所以没红。是否给段② 也加一条「最差种子」副红线（像满级那样），等 shuzhi 定。',
'- **段④ 旗子比例口径（采纳 ceshi）**：旗子占比**单种子不可判**（seed1 仅 3 件 → 6.67:1），',
'  口径改为「**多种子合计 n≥60 时看比例**」，且它是记录项不是门禁。本轮 83 件仙品 / 22 件旗子 = 26.5%，',
'  与设计 33.3% 差 1.3σ，在噪声内。',
'',
].join('\n');

const after = before.replace(/\s*$/, '\n') + block;
if (after.length < before.length + 1200) throw new Error('ASSERT block too small');
if (!after.includes('### D68')) throw new Error('ASSERT block missing');

fs.mkdirSync('F:/dsh-work/zhuoxian/tools/_bak', { recursive: true });
fs.writeFileSync(`F:/dsh-work/zhuoxian/tools/_bak/DECISIONS.before-d68.${Date.now()}.md`, raw, 'utf8');
fs.writeFileSync(p, crlf ? after.replace(/\n/g, '\r\n') : after, 'utf8');
console.log(`ok crlf=${crlf} ${before.length} -> ${after.length} chars, decisions=${(after.match(/^### D\d+/gm) ?? []).length}`);
