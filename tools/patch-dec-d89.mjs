// 追加 D89（装备对比显示：面板上的数必须等于验收用的数）
import fs from 'node:fs';

const FILE = 'docs/DECISIONS.md';
const before = fs.readFileSync(FILE, 'utf8');

const block = [
  '',
  '### D89（装备对比显示：面板上的数 = 判据 C 的数，分位表与基表同源）',
  '',
  '- **问题**：玩家看到「战力 128」没有任何参照 —— itemPower 的量纲因部位而异（玉佩中位是戒指的 **7.4 倍**），',
  '  所以一个全局数字既不能横向比也不能纵向比。而判据 C 天天在用「同部位、同灵蕴的宝品中位」这个分母，',
  '  玩家却看不见它。',
  '- **口径 1（最重要）：显示的比值必须与判据 C 是同一个数** = `itemPower(item) / slotBasePower(kind, item.ilvl)`。',
  '  **一致性 > 好看** —— 两套算法各算一遍，等于天天用一个数验收、给玩家看另一个数。',
  '  因此 `src/core/power-rank.ts` 读的 `src/data/slot-power-table.json` 与 `tools/session-runner.mjs` 读的',
  '  `tools/slot-power-base.json` **由同一个脚本、同一个种子产出**（重跑时基表逐字节不变，已核对）。',
  '- **口径 2：分位表必须由 `gen-slot-base.mjs` 一并产出**（`slot × rarity` 的 p10/p50/p90，每格 4000 次抽样）。',
  '  手抄或另写脚本 = 又一张会**静默失效**的表（§5.4.3 的教训：基表失真不报错，只让判据悄悄变宽）。',
  '  低灵蕴仙品每格只有 ~60 个样本，所以带 `minCount` 并在不足 30 时**不显示分位**（只给品阶名）。',
  '- **口径 3：`itemPower` 不读传奇效果**（只权重 base+affixes）⇒ 带传奇的件基数偏低是正常的，',
  '  详情面板必须在传奇描述下加一行「（传奇效果不计入战力）」，否则右上角那个 × 会骗人',
  '  （历史上出现过 90~95% 的仙品「战力」不如宝品，玩家会以为是 bug）。',
  '- **两个百分号必须分开读**：背包行 `宝品 · 1.03× · 身上+12%` —— 前者是判据 C 的归一化战力，',
  '  后者是和身上同部位那件比（换装决策用）。**不许混用同一个名字**，也不许只显示后者（那会让玩家永远不知道自己在判据 C 里的位置）。',
  '- **界面落点**：背包 3 行（`hud-panels.ts`）+ 法宝详情 9 张卡（`detail-panels.ts`，右上角 `1.03×` 金色 + `前 30%` 灰色；`CARD_H 132 → 148`）。',
  '- **代价**：`vite build` 125.88 → **147.93 kB（gzip 41.82 → 52.27）**，就是那张 JSON 表。可接受 ——',
  '  比手抄一张会失真的表强，而且 gzip 后只多 10 KB。',
  '- **验收**：`tests/power-rank.test.ts` **16 条**（九部位都有分母 / 两端夹取不外推 / 插值落两格之间 / 分位单调不减 / 分位缺失只给品阶名 / 对比文案四种说法 / 除零给空串）；',
  '  全仓 **570 passed / 37 files**、`tsc 0`；`probe-detail 7/7`、`probe-breakdown 7/7`、`probe-battle 25/25`。',
  '- **重跑纪律（写进 `power-rank.ts` 头注释）**：改 `src/data/bases.ts` / `affixes.ts` / `core/item.ts` 的 itemPower / loot 稀有度权重',
  '  → **必须重跑 `node tools/gen-slot-base.mjs`**，它同时更新 `tools/slot-power-base.json` 与 `src/data/slot-power-table.json`。',
  '',
].join('\n');

const out = before + block;
if (!out.startsWith(before)) throw new Error('追加后前缀变了，说明不是纯追加');
if (out.length < before.length + 1500) throw new Error(`追加量可疑：${before.length} → ${out.length}`);
if ((out.match(/### D89（/g) ?? []).length !== 1) throw new Error('D89 标题不唯一');

if (!fs.existsSync('tools/_bak')) fs.mkdirSync('tools/_bak', { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
fs.writeFileSync(`tools/_bak/DECISIONS.md.${stamp}.bak`, before, 'utf8');

fs.writeFileSync(FILE, out, 'utf8');
console.log(`patched ${FILE}: ${before.length} → ${out.length} chars`);
