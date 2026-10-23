// 追加 D92.1：点空白处 = 跳过一条引导（手机上"没有空格键"的收尾）
import fs from 'node:fs';

const FILE = 'docs/DECISIONS.md';
const raw = fs.readFileSync(FILE, 'utf8');
if (raw.includes('### D92.1')) throw new Error('D92.1 已存在');

const block = [
  '### D92.1 点空白处 = 跳过一条引导（手机上的"空格"）',
  '',
  '**问题**：D92 之后手机能点卡片进游戏、能点按钮开面板，但引导条上写的是「空格 / Enter 跳一条」——',
  '手机上没有这个键，等于在告诉手机玩家"你没法跳过"。引导本身会自动推进（`elapsed` 兜底），',
  '所以这不是"卡死"，是**文案在撒谎**（玩家会以为界面坏了）。',
  '',
  '**做法**：',
  '1. `src/main.ts` 的 `pointerdown` 里，命中按钮之后补一条兜底：`!tutorialFinished(...)` 时',
  '   `session.tutorialStep = clampTutorialIndex(session.tutorialStep + 1)` + `autosaver.saveNow()`。',
  '   **只跳一条**（与空格同语义）—— 一键全关等于让玩家永远不知道漏了什么。',
  '2. `src/render/tutorial-overlay.ts` 的右上角文案从 `progress` 改成',
  '   `` `${progress}　·　点一下 / 空格 跳过` ``，让"点一下"这条路径自己说出来。',
  '',
  '**判据**：`tools/probe-touch.mjs` 从 19 → **21/21**，新增两条：',
  '- 「点空白处推进一条引导」`0 → 1`（只认步数涨 1，不认像素 —— 引导是纯文本条，像素说不清是哪条）；',
  '- 「点面板按钮不会顺手跳掉引导」`1 → 1`。这条不是形式：**两个功能一起动最难查**，',
  '  本项目已经踩过「空格换玉简时顺手把引导跳掉」。',
  '',
].join('\n');

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
fs.mkdirSync('tools/_bak', { recursive: true });
fs.writeFileSync(`tools/_bak/DECISIONS.md.${stamp}.bak`, raw, 'utf8');
const next = raw.endsWith('\n') ? raw + block : raw + '\n' + block;
if (next.length <= raw.length) throw new Error('长度断言失败');
fs.writeFileSync(FILE, next, 'utf8');
console.log(`D92.1 已追加：${raw.length} → ${next.length} chars`);
