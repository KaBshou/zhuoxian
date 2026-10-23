// D90：渊痕价目表（M 面板）
// 纪律同前：写盘前留 _bak 快照 + 长度断言 + 标题唯一性断言。
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const DOC = 'docs/DECISIONS.md';
const before = readFileSync(DOC, 'utf8');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
mkdirSync('tools/_bak', { recursive: true });
writeFileSync(`tools/_bak/DECISIONS.md.${stamp}.bak`, before, 'utf8');

const block = [
  '',
  '### D90 渊痕价目表（M 面板）：满级后唯一还在涨的数字，必须能点开看价',
  '',
  '- **问题（可达性缺口，不是数值问题）**：D36-A 的三档渊痕（洗灵石 / 定渊 / 夺造化）只有键位 `1/2/3` 和 HUD 上',
  '  一句「渊痕 N · 可换」。玩家**看不见能换什么、多少钱、还差多久** —— 三档价格是 D59/D81 重锚过的',
  '  （360k / 720k / 3.6M），玩家脑子里没有任何参照，等于这个系统只存在于代码里。',
  '- **做法**：新建 `src/render/marks-panel.ts`（`MARKS_PANEL_W = 520`、`formatMarks` 万/亿、`minutesUntil`、`sinkStatusText`），',
  '  `battle-renderer.ts` 加 `toggleMarksPanel()` / `get marksPanelVisible()`，`main.ts` 加 `KeyM`（在 D 面板之前），',
  '  右下角统计行加「M 渊痕」。面板**只读**：不拦 `Digit1/2/3`，换渊痕仍然只能靠这三键 —— 面板是账本，不是操作台。',
  '- **三行三档**：`1 洗灵石 价 360.0万 · 可换` / `2 定渊 价 720.0万 · 还差 12.0万 ≈ 8 分钟` / `3 夺造化 价 3600.0万 · …`，',
  '  右上角 `约 1.6万/分`（`MARKS_PER_MINUTE = 15_627`，D81 重锚值），底部「渊痕不产生无限战力（有界强化）　·　M 关闭」。',
  '- **`minutesUntil` 必须吃当前 `MARKS_PER_MINUTE`**：如果哪天速率重锚（D85 的 >10% 纪律），面板上的「还差几分钟」',
  '  必须跟着变。拿旧速率反推 = 一个**不报错、只撒谎**的数字（D81 那次就是这么来的）。',
  '- **标题不叫「渊痕」之外的术语**：`src/data/glossary.ts` 的 `TERM` 里没有 `marks` 键（引 `TERM.marks` 报',
  '  `TS2339: Property \'marks\' does not exist`）。选择直接写「渊痕」而不是往术语表里塞一个只有一处用的键 ——',
  '  术语表的用途是**同一概念多处出现时保证叫法一致**，只有一处的时候加条目只是多一个可漂的常量。',
  '- **验收**：`tests/marks-panel.test.ts` **12 条**（`validateMarks` 无错 / 三档名字非空 / `formatMarks` 四档量级与脏值按 0 /',
  '  `minutesUntil` 买得起返 0、缺口÷速率、整数倍不多算一分钟、NaN 兜底 / `sinkStatusText` 可换三档、买不起同时含「还差」与「分钟」、',
  '  与 `affordableSinks` 判定一致 / 面板高度 <540、宽 <960）；全仓 **582 passed / 38 files**、`tsc 0`、',
  '  `vite build 150.36 kB（gzip 53.05）`。CDP 探针 `probe-marks-panel.mjs` 交 ceshi 写（盘子 14 → 15 脚本）。',
  '- **没做的**：面板里不做「按 1/2/3 直接换」的确认交互（换渊痕是不可逆的消费，误触代价高，',
  '  现在的键位已经够用）；也不做「历史累计消耗」统计（没有玩家会看，且要新增存档字段）。',
  '',
].join('\n');

if (before.includes('### D90 ')) throw new Error('D90 已存在，拒绝重复写入');

const after = before.replace(/\s*$/, '\n') + block;
writeFileSync(DOC, after, 'utf8');

const grew = after.length - before.length;
console.log(`DECISIONS.md ${before.length} -> ${after.length} chars (+${grew})`);
if (grew < 900) throw new Error(`追加量异常偏小：${grew} 字符，疑似没写进去`);
const d90 = after.match(/^### D90 /gm) ?? [];
if (d90.length !== 1) throw new Error(`D90 标题出现 ${d90.length} 次，应为 1`);
const all = after.match(/^### D\d+ /gm) ?? [];
console.log(`决策条数 ${all.length}`);
