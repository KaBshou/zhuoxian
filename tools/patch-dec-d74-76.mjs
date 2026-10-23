// 追加 D74 / D75 / D76 到 docs/DECISIONS.md
// 纪律：行数组 join('\n')，不用嵌套反引号；锚点 MISS 或长度异常就 throw，不写盘。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const p = 'docs/DECISIONS.md';
const raw = readFileSync(p, 'utf8');
const crlf = raw.includes('\r\n');
let n = raw.replace(/\r\n/g, '\n');

const anchor = '### D73 段④「全仙品」主口径 = 层 46（9.9h），层 21 的 21h 降为保守下限（2026-10-23）';
if (!n.includes(anchor)) throw new Error('MISS D73 锚点');

const block = [
  '',
  '### D74 四段下界改「中位判 + 量级红线」，逐种子只记最差（2026-10-23，shuzhi v4.35）',
  '- 6 种子实测两条破线：二阶最差 **32.5 < 35**、层19→28 最差 **32.7 < 35**，**都来自同一颗快杀种子 20263047**（它满级也最快）。',
  '- 逐种子判 ⇒ **1/6 假红**；假红比漏检更贵（教人忽略红灯）。改判：',
  '  - **主判 = 中位 ≥ `medianMin`**；',
  '  - **逐种子只记录最差**；',
  '  - **量级红线 = 任一种子 < `medianMin × 0.5` 才 FAIL** —— 专抓「整段被跳过」这类一错就是一倍的事故。',
  '- 落地：`tools/_segments.mjs` 的表改成 `| 段 | ≥medianMin | 中位 | 最差（量级红线 ≥medianMin×0.5） | 判定 |`。',
  '- `TIMELINE_BANDS` 仍是唯一常量来源（BALANCE §5.1），工具里不许另立一套。',
  '',
  '### D75 项目里有**两套「阶」**：渊层阶位按层号、灵纹阶按灵蕴（2026-10-23，shuzhi v4.35）',
  '- 渊层阶位：`tierOfFloor` 1~9 黄 / 10~18 玄 / 19~27 地（**按层号**）。术语表原来**没有**这个词。',
  '- 灵纹阶：`AFFIX_TIER_ILVL` 1~15 黄 / 16~30 玄 / 31~45 地 / 46+ 天（**按灵蕴**）。',
  '- `ilvlForFloor(10) = 37` ⇒ 层 10 的玩家已在洗**地阶**灵纹，却才刚进**玄**渊层阶位，两套差约 5 层。',
  '- 处置：①`glossary.ts` 新增 `floorTier: \'渊层阶位\'`（附注释说明为什么必须分开叫）；②引导文案写成「第十层起进玄域 —— 渊层每 9 层一阶；灵纹阶看灵蕴，是另一套。」；③**禁止**写「玄阶的怪掉玄阶灵纹」（错 5 层）；④`tests/onboarding.test.ts` 加钉子断言文案同时含「渊层」「灵纹阶」且不含「灵蕴也高」。',
  '',
  '### D76 神通/玉简从「只读面板」改成「可交互」（2026-10-23）',
  '- 问题：`CharacterState.gemLoadouts` 与 `characterGemLoadout()` 早就在，但**没有任何 UI 入口**（`skill-panel.ts` 头注释直接写「只读」）。6 主动 × 4 槽 × 12 玉简是本作最贵的组合层，不能改 = 不存在。',
  '- 新增 `src/core/gem-edit.ts`（纯函数 + 一个提交函数）：`orderedSkillRows` / `gemOptions` / `gemSlotOptions` / `setGemAt` / `cycleGemAt` / `resetGemLoadout` / `applyGemLoadout` / `moveSkillCursor` / `moveSlotCursor` / `gemAtSlot`。校验一律**安静判否**（未解锁 / 不命标签 / 重复 / 越界 → 返回原装配，不抛）。',
  '- **语义改动**：`characterGemLoadout` 从「`raw.length > 0` 才用显式装配」改成「**只要写过就用**」。',
  '  - 旧行为下玩家把 4 条玉简全摘光会被自动装配悄悄填回 ⇒ 点「清空」等于没反应。',
  '  - 默认体验的保护改由「没写过该字段才自动填」承担：不碰 = 永远最优默认；碰了 = 玩家说了算。',
  '- 交互（`main.ts`）：面板打开时接管 `↑↓`（选神通）/ `←→`（选槽）/ `空格·Enter`（轮换玉简，空槽也在候选里）/ `R`（恢复自动）。**必须插在「空格跳引导」之前**，否则换玉简会顺手把引导跳掉。',
  '- 坑（探针抓到）：`R` 一度走 `commitGemLoadout(skillId, resetGemLoadout(...))`，把「默认装配」又写回 `gemLoadouts` 当覆盖项 ⇒ R 之后覆盖项还在，且以后解锁新玉简不再自动补。修法：`R` 只 `resetGemLoadout` + `saveNow`，**不经过 apply**。',
  '- 面板：`drawSkillPanel(ctx, s, ch, cursor)` 画整行描边 + 光标槽双层金框 + 底部键位提示；`SkillPanelResult` 多返 `cursorSkill/cursorSlot`。',
  '- 验收：`tests/gem-edit.test.ts` **24 条**（含「四槽全清真能空」「同玉简不占两格」「未解锁装不上」「越界安静返回」「光标夹取/环绕」「R 后仍可再改」）；`tools/probe-gem.mjs` **16/16**（G 面板变暗 + 米白文字 + 光标金框像素 627 + ↓→ 移动光标 + 空格换玉简 + **reload 后改动还在** + R 后覆盖项消失 + 面板关闭后 → 仍是回刷层 + 控制台干净）。',
  '- 全链：`tsc 0` / `vitest 507 passed / 34 files`。',
  '- 教训（写下来防复发）：「纯函数单测全绿」证明不了「按键接到了函数上」。本项目已经两次在这里吃亏（换装、灭灵石都是真 session 才暴露）。',
].join('\n');

const next = n.replace(anchor, () => anchor + '\n' + block);
const added = next.length - n.length;
if (added < 1200) throw new Error('追加内容过短，疑似锚点替换异常 ' + added);
if (next.split('### D74').length - 1 !== 1) throw new Error('D74 出现次数异常');

mkdirSync('tools/_bak', { recursive: true });
writeFileSync('tools/_bak/DECISIONS.md.d74.bak', raw, 'utf8');
writeFileSync(p, crlf ? next.replace(/\n/g, '\r\n') : next, 'utf8');
console.log('ok', raw.length, '->', next.length, 'added', added);
