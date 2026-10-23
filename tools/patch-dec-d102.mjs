/**
 * 追加 D102：跨帧测量与探针基建的两条硬规矩（同帧快照钩子 + 端口独占）。
 */
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';

const FILE = 'docs/DECISIONS.md';
const raw = readFileSync(FILE, 'utf8');
const before = raw.length;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
mkdirSync('tools/_bak', { recursive: true });
copyFileSync(FILE, `tools/_bak/DECISIONS.md.${stamp}.bak`);

const BLOCK = [
  '',
  '### D102 跨帧测量不算数，与探针的两类「假红基建」｜2026-10-23',
  '',
  '**问题一：跨帧比较得出的「没变」和「变了」都不作数。**',
  '`probe-achievement` 有一条断言「成就解锁只发渊痕、不动修为」，写法是',
  '「设 kills → `sleep(1200)` → 比 xp」，结果报 `xp 0 → 2` 红了 —— 而 `XP_PER_KILL_PER_FLOOR = 2`，',
  '也就是说这 1.2 秒里战斗循环自己杀了 1 只怪。**产品没错，是测量错了。**',
  '',
  '修法：`src/main.ts` 新增调试钩子 `syncAchievementsNow()`，它**在同一次同步调用里**',
  '先取 `xpBefore/marksBefore/unlockedBefore`，再真跑 `syncAchievements(session)`，再取 `*After`，',
  '中间不跨帧、不经过 rAF、不给战斗循环插入机会。探针因此可以断言「同一次结算内 xp 不变、marks 增加」。',
  '',
  '> 规矩：**凡是「某操作不该改变 X」的断言，操作与读数必须在同一帧内完成**；',
  '> 跨帧的差值只能用来测「应该变大/变小」，不能用来测「应该完全不变」。',
  '',
  '**问题二：探针的两种基建假红，比产品 bug 更贵（教人忽略红灯）。**',
  '1. **CDP 端口被上一次的 chrome 占着**：探针固定 `--remote-debugging-port=9364`，上一轮崩溃后 chrome 不死，',
  '   新 chrome 绑不上端口 → 探针连到**旧 chrome 里的旧页面**，于是「钩子不存在」「新钩子不是函数」。',
  '   现象极具误导性：明明刚重启了 dev server、源码里也有钩子。',
  '   → 规矩：跑盘子前先确认调试端口空闲；单跑探针前 `kill` 掉占端口的进程。',
  '2. **reload 期间的 `Runtime.evaluate` 可能永不 resolve**：`reset()` 会 `location.reload()`，',
  '   「钩子可用」那一次检查可能在 reload **开始前**就通过，随后采样循环里 `window.__zhuoxian` 变 undefined',
  '   （`TypeError: Cannot read properties of undefined (reading \'session\')`，exit=13），',
  '   更糟的是只 catch 异常不够 —— CDP 那次调用会一直挂着，Node 报 `unsettled top-level await` 后不退出。',
  '   → 规矩：采样体内每次 eval 都要有 **超时护栏 `Promise.race`** + 「等钩子回来」重试；',
  '   一次性的「钩子可用」检查不能当永久保证。',
  '',
  '**同类根源**：这三条（含 D101 的快照坑）都是「测量工具本身不成立于它所测量的世界」。',
  '写探针的成本里，一半应该花在「怎么证明这次红灯不是假的」上。',
].join('\n');

if (raw.includes('### D102 ')) throw new Error('D102 已存在');
const next = raw.endsWith('\n') ? raw + BLOCK + '\n' : raw + '\n' + BLOCK + '\n';
if (next.length <= before) throw new Error(`未变长：${before} → ${next.length}`);
if ((next.match(/^### D102 /gm) ?? []).length !== 1) throw new Error('D102 标题数不为 1');
writeFileSync(FILE, next, 'utf8');
console.log(`DECISIONS.md ${before} → ${next.length}（+${next.length - before}）`);
