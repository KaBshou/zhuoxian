// D108：生存性度量（D105）落地 + 首轮基线读数。
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const ROOT = 'F:\\dsh-work\\zhuoxian\\';
const PATH = ROOT + 'docs/DECISIONS.md';
const raw = readFileSync(PATH, 'utf8');
const crlf = raw.includes('\r\n');
const text = raw.replace(/\r\n/g, '\n');
const before = text.length;
if (text.includes('### D108')) throw new Error('D108 已存在');

const lines = [
  '',
  '### D108 · 生存性度量落地（`tools/measure-survival.mjs`）+ 首轮基线：μ 比模型小两个数量级',
  '',
  '**背景**：D103 上线护盾后，12 个种子跑 900min 的满级时刻与改之前**逐位相同**。这不是「护盾没用」，',
  '而是**门禁测不到 EHP** —— 死亡数是 0/1 事件，在零死亡区间里信息量为零（shuzhi §6.4 / D105）。',
  '',
  '**做法**：',
  '1. `src/core/battle.ts` 加四个**运行时**计数（全部不入档）：`shieldAbsorbed`、`shieldRecharges`（数「段」不数帧，'),
  '   配 `shieldRecharging` 布尔）、`maxHit`、`incomingMul`（默认不设 = 1，只有度量脚本会设）。',
  '2. `tools/session-runner.mjs` 加 `survivalWindows` / `survivalMinutes` / `incomingMul`：从**首次到达该层**',
  '   开始开 N 分钟观测窗，窗口期间把层钉住（不钉住玩家会下潜，窗口凑不满 3 分钟）。',
  '   为什么是「首次到达」：**典型装备的唯一定义就是玩家第一次走到这里时身上的东西**；事后再回层 27 量的是满级装备。',
  '3. `tools/measure-survival.mjs`：层 27 / 层 40 × 12 预注册种子（base 2026 / step 1013）× 3 分钟；',
  '   输出 μ、入伤/波、波数、死亡、`maxHit`、致死代理 `lifeMax/maxHit`、护盾回充段/波、吸收占比；',
  '   `--muls` 扫 atk-mul 求 K（最高零死亡倍率）。',
  '4. `tests/shield-recharge.test.ts` 加 4 条计数器测试（**没有测试的计数器等于没有**：恒为 0 的计数器和「玩家真没挨打」无法区分）。',
  '',
  '**首轮基线（12 种子 × 2 层，`tmp/survival-v105a.log`，atk-mul 1/1.5/2/3）**：',
  '',
  '| 层 | μ 中位 (%/s) | μ 最差 | 死亡 | 护盾回充（段/波） | 护盾吸收占比中位 | 还能挨几下（中位） | K |',
  '|---|---:|---:|---:|---:|---:|---:|---:|',
  '| 27 | **0.00** | 0.10 | 0 | 1.27 | 98.8% | 109.3 | **≥3** |',
  '| 40 | **0.00** | 0.11 | 0 | 1.33 | 100.0% | 124.4 | **≥3** |',
  '',
  '**三条结论**：',
  '1. **μ 比模型小两个数量级**（模型反推 0.9 %/s，实测中位 0.00、最差 0.11）。按 shuzhi 的钉子「实测与推导差 >2 倍',
  '   就先查模型」，这条**不是调门槛**，是要重查入伤模型 —— 现在这版模型假设「每秒吃固定比例的伤」，',
  '   而真实战斗是「一波挨两三下、波间几乎满血」，两种形状的 μ 根本不是一个量。',
  '2. **K ≥ 3**：即使把所有怪物伤害 ×3，12 个种子仍是零死亡。所以「满级时长对 EHP 不敏感」的原因不是护盾，',
  '   是**整个战斗对 EHP 都不敏感** —— 玩家在层 27/40 的致死距离是「再挨 100 多下」。',
  '3. **护盾吸收占比 98.8~100%**，远超 D103 验收线「≥5%」：波间回满（波末无伤窗口 3.4s > 回充延迟 3.0s）',
  '   让护盾每波都能重新吃满。**护盾不是死属性，但它现在是「每波免费取消前几次受击」**，',
  '   实际 EHP 增益远大于标定的 8%。是否收紧（回充延迟 3→4s，或按「每波只回一次」）交 shuzhi 判。',
  '',
  '**没做的**：K 的原始规格是「扫到首例死亡的前一档」，但 3× 都没死亡 ⇒ K 的上界还没找到；下一轮可扫到 6×/10×。',
  '**纪律**：防御向改动**不许**只跑满级时长（D103 已经吃过一次）；改完必须跑 `tools/measure-survival.mjs`。',
  '',
].join('\n');

const next = text.replace(/\n*$/, '\n') + lines;
const delta = next.length - before;
if (delta < 1500 || delta > 8000) throw new Error(`追加量异常：${delta}`);
mkdirSync(ROOT + 'tools/_bak', { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
if (existsSync(PATH)) copyFileSync(PATH, `${ROOT}tools/_bak/DECISIONS.md.${stamp}.bak`);
writeFileSync(PATH, crlf ? next.replace(/\n/g, '\r\n') : next, 'utf8');
console.log(`OK ${before} → ${next.length}（+${delta}）`);
