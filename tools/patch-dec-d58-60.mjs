// 一次性：落 D58（满级两条门禁）/ D59（渊痕定价 ×2.5）/ D60（传奇效果）
// 纪律（事故 A1 之后定的）：写盘前留 _bak 快照 + 长度断言，throw 前不写盘。
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/docs/DECISIONS.md';
const raw = fs.readFileSync(p, 'utf8');
const crlf = raw.includes('\r\n');
const before = raw.replace(/\r\n/g, '\n');

const block = [
'',
'### D58 满级验收拆成「主门禁 + 副红线」：406 不是硬指标（2026-10-22，shuzhi v4.29）',
'- **问题**：3 种子满级 **337.1 / 351.3 / 399.5**，种子散布 **17.8%** 比窗口半宽（15%）还大。',
'  工具的 verdict 按中位判，于是 `pass=true, dev=-13.5%` —— 单种子 337.1 已经出窗（−17.0%）却静默通过。',
'- **框架纠正（shuzhi）**：**406 不是需求，是内部标定值**。GDD 1.7 第③段是 **5h = 300min**；',
'  351.3 = 5.85h（+17%），406 = 6.77h（**+35%**）—— 351.3 反而更贴需求。',
'  所以「351.3 是退步 13.5%」这个说法本身是错的，正确说法是「回到更靠近 GDD 的位置」。',
'- **判定**：**接受 351.3，`BREAKTHROUGH_XP` 数组不动**。否决两条替代：收紧重铸保底（351.3 已过关，',
'  收紧会同时破坏通货消化 100%/97.7%/100%、`minPowerRatio≥1.0`、判据 C 3/3 三件刚拿到的好性质）；',
'  抬修为门槛（只让升级变慢，掩盖不了段④ 无内容，且第 4 次触发 D34 验收链）。',
'- **门禁拆两条**（`tools/run-timeline.mjs`）：',
'  1. **主门禁**：3 种子中位 ∈ [345, 467]（406 ±15%）；',
'  2. **副红线**：`FLOOR_MIN_MINUTES = 325`，**任一种子 < 325 直接 FAIL**；',
'     `verdict` 增加 `floorMin / floorLimit / floorOk`，输出行加「｜副红线：最差种子 Xmin >= 325min → 通过」。',
'- **理由**：只判中位会放跑「一个种子严重偏差、另两个刚好偏高」；只判逐种子又把 9~18% 的种子噪声当错误。',
'  两条一起才是**校准过的**判据 —— 这不是放宽标准，是把抖动容忍度调到真实抖动。',
'',
'### D59 渊痕定价锚按实测重标：8 900 → 10 843 渊痕/分，三档价格 ×2.5（2026-10-22）',
'- **实测**（`--post-cap`，3 种子）：渊痕 **10 161 / 10 843 / 11 477 / 分**，而 `MARKS_PER_MINUTE` 当时是 8 900、',
'  更早是 4 400 —— 定价锚的是**分钟数**，速率错 2.46 倍则「3h 能买什么」全部失真且**不会报错**。',
'- **改法**（`src/data/marks.ts`）：`MARKS_PER_MINUTE = 10_843`；`setStartFloor` 500 000（45.5min）、',
'  `rerollCurrency` 250 000（22.7min）、`divineReforge` 2 500 000（230.6min）。',
'- **夺造化 2.5M > 3h 产出（1.95M）是刻意的**：它换的是终局收益（单件定向重铸天阶），',
'  如果 3h 就能买到，满级后三小时就没事干了。旧值 1.5M 是按 8 900/分定的，速率修正后同步放大。',
'- **同步**：`F:\\dsh-work\\tools\\probe-marks.mjs` 的三条断言（种子渊痕 1 250 000、聚灵扣 250 000、',
'  定渊扣 500 000、夺造化 2 500 000 买不起必须被拒）。**注意探针脚本在外层 `F:\\dsh-work\\tools\\`，不在 `zhuoxian\\tools\\`**。',
'- **纪律**：改掉落或修为曲线 → 必须重跑 `--post-cap` 并同步 `MARKS_PER_MINUTE`，否则「3h 能买一次」的心理账户静默失真。',
'',
'### D60 传奇效果：仙品固定 1 条，独立字段（不是第五条灵纹）（2026-10-22）',
'- **缺口**：REQ §4 写「仙品 = 4 条灵纹 + 1 条传奇效果」，而 `legendary` 字段**根本不存在**，',
'  `rarity.ts:46` 的注释写了这句话但没有实现 —— 这是 REQ 最后一块真缺口。',
'- **做法**：`src/data/legendary.ts` 9 条 = **6 条纯数值**（走 `itemModifiers` 统一聚合，不新开访求入口）',
'  + **3 条机制旗子**（`kill-heal` 血祭 击杀回气 8%、`double-strike` 双影 18% 追加一击、`boom-more` 浊魄 浊气上限 +50%）。',
'  仙品由 `rollLoot` 固定掷一条，**抽序放在灵纹之后**（保持既有 rng 序列，否则历史验收数据全部作废）。',
'- **为什么必须是独立字段而不是第五条灵纹**：洗灵石 / 灭灵石 / 满条重铸 / 淬炼这些算子只认「灵纹条数」，',
'  如果传奇也做成 `AffixInstance`，它们迟早会把它删掉或重掷 —— 玩家刷几十小时的仙品会被通货洗成普通件。',
'  现在 `legendary?: string` 与 `affixes` 并列，上述算子全部只 spread `...item`，天然带不走它。',
'- **三个旗子必须有界**（合 D45）：`legendaryFlags()` 汇总后封顶 killHeal 0.5 / doubleStrike 1 / boomMore 1；',
'  10 部位全带同一条旗子也不产生无限战力（测试里有「塞 20 件血祭 → 最终 0.5」的钉子）。',
'- **验收**：`tests/legendary.test.ts` **20 条**（数据契约 / 仙品必带 & 非仙品必无 / 纯数值走管线 / 四类通货洗不掉 /',
'  存档往返 / 旗子有界 / 三旗子在战斗里真的生效且对照组不生效）；ceshi 另有两份独立探针',
'  `tools\\probe-legendary.mjs` **9/9**（画布像素差分证明传奇真占一行：962 vs 939）与',
'  `tools\\verify-legendary-invariants.mjs` **16/16**（4000 次 rollLoot 中 371 件仙品全部带传奇、0 件非法 id；',
'  赌类算子跑满一轮 `legendary` 全部 `taiyi → taiyi`）。探针盘子 134 → **143/143**。',
'- `tsc 0` / `vitest 478 passed / 33 files`。',
'- **副作用（须重标）**：传奇让仙品明显更强（more +30% / +45% 气血 / +18% 追击量级），',
'  3 种子实测满级中位从 351.3 掉到 **322.2（−20.6%）**、最差种子 322.0 **跌破副红线 325** → 数值待 shuzhi 重标。',
'',
].join('\n');

if (before.length < 8000) throw new Error('原文异常短，拒绝写入');
const next = before + block;
if (next.length < before.length * 1.005) throw new Error('增长量异常，拒绝写入');

fs.mkdirSync('F:/dsh-work/zhuoxian/tools/_bak', { recursive: true });
fs.writeFileSync(`F:/dsh-work/zhuoxian/tools/_bak/DECISIONS.md.${Date.now()}.bak`, raw, 'utf8');
fs.writeFileSync(p, crlf ? next.replace(/\n/g, '\r\n') : next, 'utf8');
console.log(`ok crlf=${crlf} ${raw.length} -> ${next.length}`);
