// 追加 D79：v4.37 常量重标（满级 300 / 窗口 [270,345] / 副红线 250 / 段② 相对红线改中位判）
//
// 纪律（A1 事故之后）：
//   1. 写盘前先做「锚点存在」断言 + 「目标不存在」断言（防重复追加）
//   2. 写盘前留 tools/_bak/ 快照
//   3. 替换文本一律用行数组 join('\n')，不写嵌套反引号模板（.mjs 里反引号嵌套会直接 SyntaxError）
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const DOC = join(ROOT, 'docs', 'DECISIONS.md');
const BAK_DIR = join(ROOT, 'tools', '_bak');

const raw = readFileSync(DOC, 'utf8');
const before = raw.length;

const ANCHOR = '### D78';
if (!raw.includes(ANCHOR)) throw new Error('MISS anchor: 找不到 D78，先确认文档结构没变');
if (raw.includes('### D79')) throw new Error('SKIP: D79 已存在，不要重复追加');

const lines = [
  '',
  '### D79（v4.37 重标：满级 330→300、副红线 250、段② 相对红线改「中位判」）',
  '',
  '- **背景**：D78 修好 `castSpeed` / 玉简破绽率两个死属性之后，6 种子满级中位从 340.2 掉到 297.6（−9.8%）。',
  '  这不是「玩家莫名变弱」，是**模型假设终于生效**：`§15.7` 的 2.429× 上限里那个 ×1.25 速度通道以前是假的，',
  '  修前玩家实得 ≈ `2.429 / 1.25 = 1.94×`；修后 `1.25 × 0.4（技能段约占 DPS 40%）+ 0.6 = 1.10` ⇒ 正好 −10%（实测 −9.8%）。',
  '  **对账式比「重跑看中位动了多少」强**：它把「假设没实现」和「数值变强」分开。以后修死属性都先写这一行对账。',
  '- **重标（shuzhi v4.37 定稿，已落 `tools/run-timeline.mjs`）**：',
  '  - `TARGET_MAX_MINUTES` 330 → **300**。300 就是 GDD 段③ 的 5h 需求值；之前用 330 是 D64 为「传奇让玩家变快」做的让步，',
  '    现在实测 297.6 正好回到需求值 ⇒ 让步失去理由。**不是「为了让门禁绿而调目标」**：调的是「需求值本身」，且方向是收紧。',
  '  - 窗口 `[300, 385]` → **`[270, 345]`**（−10%/+15%，分布偏左，不用 ±15% 对称）。',
  '  - `FLOOR_MIN_MINUTES` 290 → **250**。为什么不是 261（= 300×0.87）：实测最差 265，261 只剩 4min（1.4%），换种子必红；',
  '    250 留 15min（5.7%），同时仍能抓住「某颗种子快到离谱」的真事故。',
  '  - `FORMED_RATIO 0.62` **不动**（两次独立实测 0.618 / 0.617），目标自动变 **186**；',
  '    **段② 绝对上沿从写死 260 改成算出来的 `FORMED_TARGET × 1.15 = 214`**（写死会在重标时静默变宽/变窄）。',
  '  - **段② 相对红线：逐种子 ≤0.85 → 中位 ≤0.75 + 逐种子 ≤0.98 兜底**。',
  '    理由：成型/满级 这个比值**跨种子摆 0.44~0.89（45pp）**（成型由最倒霉的那个部位决定，与满级不同源），',
  '    逐种子 0.85 只剩 5pp、0.90 只剩 1pp —— 那是噪声开关，不是判据。中位判（实测 64.7%）语义仍是',
  '    「平均而言，装备成型时还剩 ≥25% 练级时间」；逐种子 0.98 只抓真事故（成型贴满级 / 晚于满级）。',
  '- **落地**：`tools/patch-v437.mjs`（`run-timeline.mjs` 31778 → 32602 chars；CRLF 保留；写盘前 `_bak` 快照 + 长度断言）。',
  '  `tools/slot-power-base.json` **不重跑** —— 它的输入只有 `bases.ts` / `affixes.ts` / `itemPower()`，与战斗管线无关（D78 改的是 `battle.ts`）。',
  '- **验收（6 种子 900min `--post-cap --talents=off`，`tmp\\v437.log`，EXIT=0）**：',
  '  满级 min 265.0 / 中位 **297.6（−0.8%）** / max 314.6，副红线 265 ≥ 250 通过；',
  '  段② C4 中位 **183.5（−1.3%）· 6/6**，相对线 中位 **64.7%**、最差 89.0%（种子 20263047）；',
  '  九境量级 通过（第 2/3/4 境 +21.6 / +26.9 / +20.7% 只记录，**不为对齐形状重排 `BREAKTHROUGH_XP`**）；',
  '  四段下界全 PASS；段④ 仙品/3h 中位 13.8、旗子 34.5%；渊痕 15627/分；死亡 0×6。`tsc 0` / `vitest 531 passed`。',
  '- **遗留（已交 shuzhi 判，我不擅自动她的文档口径）**：`段④ 仙品/3h` 那列的分母是「满级后窗口长度」，',
  '  满级目标一变它就跟着变（155 件 → 286 件，7.7 → 13.8）。建议表述固定成「层 46 满级后每 3h 的仙品件数」，与窗口长度解耦。',
  '',
];

const next = raw.replace(/\s*$/, '') + '\n' + lines.join('\n');
if (next.length <= before) throw new Error('长度断言失败：输出没有变长，拒绝写盘');
mkdirSync(BAK_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
copyFileSync(DOC, join(BAK_DIR, 'DECISIONS.md.' + stamp + '.bak'));
writeFileSync(DOC, next, 'utf8');
console.log('D79 追加完成：' + before + ' → ' + next.length + ' chars（+' + (next.length - before) + '）');
