// 追加 D92：触屏/鼠标输入层（手机上没有键盘这件事，是"链接打不开"级别的问题）
// 用法：node tools/patch-dec-d92.mjs
import fs from 'node:fs';

const FILE = 'docs/DECISIONS.md';
const raw = fs.readFileSync(FILE, 'utf8');
if (raw.includes('### D92')) throw new Error('D92 已存在，不重复追加');

const block = [
  '### D92 触屏 / 鼠标输入层（点卡片选道统、点按钮开面板、缩放后仍点得中）',
  '',
  '**问题**：`src/main.ts` 里原本【零个】click / pointer / touch 监听。手机上没有 K/T/G/M/D/E 键，',
  '连开局确认道统都要按 Enter ⇒「发个链接给朋友、手机点开就能玩」这个原始目标**物理上做不到**。',
  '这不是少个快捷键，是链接打不开。',
  '',
  '**做法**：',
  '1. 新建 `src/render/hud-buttons.ts`：`layoutHudButtons(canvasW, canvasH)` 右上角六按钮',
  '   （detail/breakdown/talent/skill/codex/marks，顺序与底部提示行一致）、',
  '   `hitTestHudButtons(px, py, canvasW)` 闭区间命中、`toCanvasPoint(clientX, clientY, rect, cw, ch)`',
  '   CSS 缩放换算（rect 宽高 0 时不给 NaN）、`drawHudButtons(ctx, canvasW, theme, activeIds)`',
  '   （面板开着的按钮描金边，键位印在按钮右上角 9px —— 电脑玩家一眼看出有快捷键）。',
  '2. 布局**必须自适应**：`avail = max(0, canvasW - EDGE*2)`，放不下压窄 `btnW`，窄到 40 以下折两行。',
  '   单测在 320 宽抓到第一版 `x = -96`（画到屏幕外），与 `class-select.ts` 那次同类。',
  '3. `src/main.ts` 键盘与点击**共用唯一入口 `activatePanel(id)`**：原六个 Key 分支全部改写成一行调用。',
  '   理由：两套逻辑各写一遍，迟早出现「按 K 能开、点按钮关不掉」（本项目伤害 4 入口已经吃过一次）。',
  '4. `canvas.addEventListener("pointerdown")`：选道统阶段点卡片 → `classCardRects` 命中 → `confirmClass()`',
  '   （一次点击走完，不要求点两下）；play 阶段 → `hitTestHudButtons` → `activatePanel`。',
  '5. **面板互斥**：`renderer.panelOpen(id)` + `renderer.closeAllPanels()`，`activatePanel` 先记',
  '   「本来开着吗」→ 全关 → 再决定开不开。六个面板都是整块覆盖层，两个同时开会互相盖住一半，',
  '   玩家看到的是「界面坏了」而不是「我开了两个」（手机上点按钮尤其容易连开）。',
  '',
  '**验收**：',
  '- `tests/hud-buttons.test.ts` 12 条：六按钮都在画布内、窄画布 320 不越左边界、右边缘恒距 14、',
  '  不重叠且顺序/键位正确、中心与边框都命中、按钮下方判空、脏坐标安静判否、`toCanvasPoint` 1:1 /',
  '  缩放×2 / rect 0 宽不产 NaN、**缩放 0.5 后仍能点中按钮**（手机真实路径）。',
  '- `tools/probe-touch.mjs` **19/19**：清档后停在 select → 点第 3 张卡片 → `phase=play` 且',
  '  `classId` 是第 3 个（不是默认第一个）→ 六按钮布局与顺序 → 点图鉴开/再点关 → 面板压上来平均亮度',
  '  27.9→19.2 → **开着一个再点另一个只留新的那个** → 六按钮逐一点开都对 → 全部能点关闭 →',
  '  按钮下方点击不误开 → CSS 缩到 60%（926→587px）后点「渊痕」仍打开 → 键盘 K 仍能开关 →',
  '  截图写出 → 控制台零报错零 4xx。',
  '',
  '**探针纪律（新增）**：',
  '- **不许抄坐标常量**：按钮布局走 `hudButtons()`、卡片矩形走 `classCards()`。抄了就会在',
  '  「按钮自适应压窄」「卡片按视口重排」之后静默点空，而点空只表现为「面板没开」——像产品没做。',
  '- 新增两个调试钩子 `panelsOpen()` / `hudButtons()`：面板权威在 main.ts，探针读这里不用猜。',
  '- **点完必须读状态**，像素只证明画出来了（沿用 D91.2「结构像素 > 调色板像素」）。',
  '',
  '**代价**：`vite build` 152.99 kB（gzip 53.88）。',
  '',
].join('\n');

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
fs.mkdirSync('tools/_bak', { recursive: true });
fs.writeFileSync(`tools/_bak/DECISIONS.md.${stamp}.bak`, raw, 'utf8');
const next = raw.endsWith('\n') ? raw + block : raw + '\n' + block;
if (next.length <= raw.length) throw new Error('长度断言失败：追加后没有变长');
fs.writeFileSync(FILE, next, 'utf8');
console.log(`D92 已追加：${raw.length} → ${next.length} chars`);
