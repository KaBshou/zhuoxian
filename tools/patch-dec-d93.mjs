// D93：成就系统（D87 第一个落地系统）落 docs/DECISIONS.md
import fs from 'node:fs';

const P = 'F:/dsh-work/zhuoxian/docs/DECISIONS.md';
let raw = fs.readFileSync(P, 'utf8');
const nl = raw.includes('\r\n') ? '\r\n' : '\n';
const crlf = raw.includes('\r\n');
raw = raw.replace(/\r\n/g, '\n');
const before = raw.length;

if (raw.includes('### D93')) throw new Error('D93 已存在');
if (!/### D92\.1/.test(raw)) throw new Error('MISS D92.1 锚点');

const block = [
  '',
  '### D93 成就系统（D87 第一个落地系统）｜2026-10-23',
  '',
  '**背景**：`docs/BALANCE.md` §6.2 算过 24h 目标差 ~9h（段④ 只撑得住 9 件全仙品 ≈6.2h + 渊痕 3h）。',
  'shuzhi v4.42 明确「成就补 **0 小时**」—— 它发的渊痕本来就是段④ 的产出，给奖励等于把段④ 提前发一部分，',
  '不是加内容；9h 缺口只能靠「有离散刻度」的东西（打破层 46 封顶 + 周目/赛季）。那么为什么还做成就：',
  '24h 的每一段都需要「有终点」的反馈，段④ 尤其需要。成就的定位是**收集刻度**，不是时长来源。',
  '',
  '**数值（shuzhi v4.42 定稿，已落）**',
  '- 奖励四档 5k / 15k / 30k / 50k 渊痕，只发渊痕、一次性、有界；**禁给修为/战力/掉率**（会进 §2 供给并触发 D64）。',
  '- 阈值规则一句话：**阈值 = 时间锚 × 该计数速率**，三锚 0.75h / 4.5h / 20h（= 满级 300min 的 0.15× / 0.9× / 4×）。',
  '  所以击杀是 500 / 3 000 / 11 000（不是 100/1000/10000：100 那条 9 分钟就到）。层数走阶位节点 10 / 19 / 28 / 46。',
  '- 20 条合计 **39 万渊痕 ≈ 25 分钟**（16 627/分口径）= 段④ 产出 ~18.7M 的 **2%** ⇒ 不可能是捷径。',
  '  ⚠️ shuzhi 的估算写的是 35 万（≈22.4min），本实现实际 39 万，差 11%（同一档位规则、条数取整所致），已回她复核。',
  '',
  '**做法**',
  '- `src/data/achievements.ts`：20 条表（id/name/desc/target/reward/progress(f)）+ `EMPTY_FACTS` + 总数与奖励合计常量。',
  '  阈值与文案全在表里，将来重标只改这一处。',
  '- `src/core/achievement.ts`（纯状态机，与图鉴同一条存档铁律）：**只存已达成 id**，进度全靠事实现算；',
  '  `sanitizeAchievements` 对未知 id / 重复 / 非字符串安静丢弃并按数据表归一顺序；`unlockAchievements` 无新达成时**返回原对象引用**。',
  '- `src/core/session.ts`：`GameSession` 加 `achievements` 与 `deaths`；`player-died` 分支 `s.deaths += 1`；',
  '  **结算放在 tick 末尾一次算完**（`syncAchievements`），不在击杀/死亡/通关/拾取四处各插一遍 —— 图鉴当年就是这么漏的。',
  '  奖励只加 `character.marks`，不碰修为/战力/掉率。',
  '- 存档：`ProgressSave` 加 `achievements.unlocked` 与 `deaths`，serialize/deserialize 双向逐字段校验（漏一行 = 静默清零）。',
  '- 面板 `src/render/achievement-panel.ts`（W=760 两列各 10 行、左缘 3px 金条）+ 第 7 个 HUD 按钮 + `J` 键 + `Escape`。',
  '  键盘与点击共用 `activatePanel` 单一入口（D92），打开时接管 ↑↓ 翻条目（否则方向键会顺手回刷层）。',
  '',
  '**踩到的三个真问题（都不是数值问题）**',
  '1. **`activatePanel` 没有 achievement 分支** ⇒ `else` 落到 `toggleMarksPanel()`，按 J 开出的是渊痕价目表。',
  '   tsc 与 31 条单测全绿，只有探针「按 J 打开的是成就面板」这一条抓到了。',
  '2. **`panelsOpen()` 没把 `achievementsVisible` 算进去** ⇒ 面板开着但互斥逻辑看不见它（两个面板能叠开）。',
  '3. **`moveAchievementCursor` 对 NaN `count` 返回 NaN**（`Math.max(0, Math.floor(NaN))` 仍是 NaN）⇒ 光标 NaN、面板画不出来。',
  '   图鉴的 `moveCodexCursor` 同一个写法，一并修（`if (!Number.isFinite(count)) return 0`）。',
  '',
  '**验收**',
  '- `tests/achievement.test.ts` **31 条**：数据契约（id 唯一 / 奖励只四档 / 击杀三档 / 层数节点）+ 洗档脏值 + 条目夹取',
  '  + 结算幂等（再结算返回同一引用）+ 光标 + session 真路径（打 60 秒不白送、`kills=500` 只发渊痕不动修为、',
  '  死亡计数走 `setFloor(18)` 真挨打）+ 面板假 ctx。',
  '- `F:\\dsh-work\\zhuoxian\\tools\\probe-achievement.mjs` **20/20**：钩子 → 行数不写死 → 奖励档 → 新号 0 →',
  '  J 变暗 → **左缘 3px 金条 0→786（结构像素）** → 打开的确是 achievement → 光标 ↓ → 面板开着 ↑↓ 不改层号 →',
  '  真到门槛解锁（got=1/20）+ marks 0→5000 + xp 0→0（**只发渊痕**）+ 日志播报 → 关闭亮度回升金条消失 →',
  '  刷新后仍在 → 面板关着 → 仍回刷层 → 控制台干净。',
  '- 全链：`tsc 0` / `vitest 626 passed / 41 files` / `probe-touch 21/21`（新按钮没破坏触屏路径）。',
  '',
  '**没做的**：成就页签分组、成就给外观/称号（REQ 没要求）、每周目重置成就（等周目系统）。',
].join('\n');

raw = raw.replace(/\n+$/, '\n') + block + '\n';
if (!/### D93/.test(raw)) throw new Error('D93 未写入');
if (raw.length < before) throw new Error('长度断言失败');
if (crlf) raw = raw.replace(/\n/g, nl);
fs.mkdirSync('F:/dsh-work/zhuoxian/tools/_bak', { recursive: true });
fs.writeFileSync(`F:/dsh-work/zhuoxian/tools/_bak/DECISIONS.md.${Date.now()}.bak`, fs.readFileSync(P));
fs.writeFileSync(P, raw);
console.log(`DECISIONS.md: ${before} -> ${raw.length} chars, D93 added`);
