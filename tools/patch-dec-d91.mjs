// D91：部署验收（probe-dist）+ Escape 一致性 + 面板探针三坑
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const DOC = 'docs/DECISIONS.md';
const before = readFileSync(DOC, 'utf8');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
mkdirSync('tools/_bak', { recursive: true });
writeFileSync(`tools/_bak/DECISIONS.md.${stamp}.bak`, before, 'utf8');

const block = [
  '',
  '### D91 部署验收：把 `dist/` 挂在子路径下真跑一遍（`tools/probe-dist.mjs` 11/11）',
  '',
  '- **为什么这条必须有**：所有别的验证都跑 `vite dev`，而 dev 的资源路径是 `/src/main.ts` 这种。',
  '  `vite.config.ts` 里那句 `base: \'./\'` 是**专门为子路径部署写的**，而 dev 环境**永远验证不到它**。',
  '  用户的原始目标是「做完给朋友和网友玩」，那么「发出去的链接打开是不是白屏」就是一等一的验收项，',
  '  不能靠推理。',
  '- **做法**：`tools/probe-dist.mjs` 用 Node HTTP 把 `dist/` 挂在 `/zhuoxian/` 前缀下（故意**不做** SPA 回退，',
  '  回退会掩盖路径错），再无头 Chrome 真打开，11 条断言：index 200 / 资源 URL 全带前缀 / 零 4xx /',
  '  canvas 真画了东西（`mean` 在 2~240 之间且亮像素 > 500）/ 生产构建**不带** `window.__zhuoxian` /',
  '  按 Enter 能进战斗 / 6 秒内画面像素 hash 变化（循环在跑）/ 写出 `zhuoxian.save.v1` / reload 后存档仍在 /',
  '  存储键不越界 / 控制台零报错。',
  '- **两个只有 dist 才暴露的事实**：①生产构建里 `window.__zhuoxian` 不存在（`main.ts` 的 `if (import.meta.env.DEV)`），',
  '  所以跑 dist 的验证**只能靠像素 + localStorage**，读不到 `session()`；②dist 首屏是**选道统**，',
  '  没有 `?cls=` 捷径的语义，必须先发 Enter 才进 play —— 否则「10 秒 kills 增长」会读到 0 并误判成「构建坏了」。',
  '- **`docs/DEPLOY.md`**：一页纸写清构建四条命令、三条硬约束（`base: \'./\'` / 零后端 / 生产不挂钩子）、',
  '  为什么必须跑 probe-dist、Cloudflare Pages（拖 `dist/`）、GitHub Pages（子路径，正好是探针模拟的形状）、',
  '  局域网试玩（`vite preview --host 0.0.0.0`，默认只听 127.0.0.1）、发布前 7 项清单。',
  '',
  '### D91.1 Escape 一致性：两个面板必须同一个关法',
  '',
  '- **问题**：`probe-marks-panel.mjs` 抓到的真缺口 —— 图鉴面板 `K`/`Escape` 都能关，',
  '  新加的渊痕价目表 `M` 只能再按 `M` 关。这是「玩家会当成 bug 的那类不一致」，不是口味问题。',
  '- **修法**（`src/main.ts`，在 `// M = 渊痕价目表` 分支之前）：',
  '  `if (renderer.marksPanelVisible && e.code === \'Escape\') { e.preventDefault(); renderer.toggleMarksPanel(); pushLog(...); return; }`。',
  '  放在 M 分支之前保证「面板开着时 Escape 只关面板」。',
  '- **纪律**：以后**每新增一个面板，必须同时接三种退出**（再按开关键 / `Escape` / 与其它面板一致的交互），',
  '  并写成探针断言。面板只进不出是最容易被漏、也最容易被玩家骂的缺口。',
  '',
  '### D91.2 面板像素探针的三个坑（ceshi 实测，已写进 `probe-marks-panel.mjs` 头注释）',
  '',
  '1. **「米白文字绝对量」断言必须先问「这个场景下这段文字是什么颜色」**：渊痕面板在 `marks = 0` 时',
  '   买不起的三行用暗色 `#8a8272`，`C.text` 米白只在买得起时出现 —— 在 `marks = 0` 场景断言米白会假红（实测米白 0）。',
  '   这不是阈值问题，是**场景与判据不匹配**。',
  '2. **金色总量不能跟「关闭态」比**：HUD 自己有金色（关闭态 642 > 打开态 558），面板盖住 HUD 反而更少。',
  '   正解是数**只属于面板的结构像素** —— 面板左缘 3px 金条，实测关闭 0 → 打开 474。',
  '   **以后所有面板探针优先用「结构像素」而不是「调色板像素」**。',
  '3. `Page.captureScreenshot` 在 `Cdp.send` 里返回的已经是 `result`，写 `shot.result.data` 会 TypeError；',
  '  截图失败被 `catch` 悄悄吞掉会变成「绿但没证据」，要么单独断言，要么在日志里显式写「截图失败」。',
  '',
].join('\n');

if (before.includes('### D91 ')) throw new Error('D91 已存在，拒绝重复写入');
const after = before.replace(/\s*$/, '\n') + block;
writeFileSync(DOC, after, 'utf8');

const grew = after.length - before.length;
console.log(`DECISIONS.md ${before.length} -> ${after.length} chars (+${grew})`);
if (grew < 1500) throw new Error(`追加量异常偏小：${grew}`);
const d91 = after.match(/^### D91 /gm) ?? [];
if (d91.length !== 1) throw new Error(`D91 标题出现 ${d91.length} 次`);
