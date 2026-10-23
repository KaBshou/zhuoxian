/**
 * 追加 D100（妖纹定稿 / BALANCE §5.9）与 D101（12 种子协议 + 双阈值 + 达成率 + 快照坑教训）。
 * shuzhi v4.45 里这两个编号标的是「建议编号」，本文件确认采用 D100/D101。
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
  '### D100 妖纹定稿（BALANCE §5.9 对齐）｜2026-10-23',
  '',
  '**采纳 shuzhi v4.45 §5.9**：8 条 / 4 类 × 2、每类至多 1 条；掷档 8/1 → 15/4%（按层）；',
  '`厚皮` 走抗性通道、`噬宝` 降到 +15%；`MONSTER_QTY_CAP = 0.24` 的份额挤压推导',
  '（`法宝份额 = 1 − 0.6(1+q)`，给到 0.48 会让 rare 的法宝比 normal 还少 = **越精英越穷**）；',
  '`DROP_RARITY_BONUS` magic 1.25 / rare 1.5（仙品权重 `2(3b−2)` 对 b **三倍敏感**）。',
  '',
  '**否决的备选**：「每波至少 1 只精英」—— 会把精英密度锁死在 25%，「越往下越凶」直接消失。',
  '',
  '**代价单列（不许用妖纹的好处掩盖）**：法宝 1.31 → 1.39/分、段② 205 → 194、仙品 +13%、',
  '段④ 6.2 → 5.4h、满级 +2%。这些是正当代价：妖纹让游戏更难一点是 REQ §5 的设计意图。',
  '',
  '**长期不变量（标注「不许删」）**：`tests/monster-affixes.test.ts` 里「每只怪至少有一条五行抗性」。',
  '理由：这是项目**第二次**撞同一个死通道（第一次是 §16.7 的怪物 armor）—— 加词条时最容易漏的就是',
  '「它要落到的通道，在这只怪身上到底存不存在」。',
  '',
  '### D101 12 种子协议、量级双阈值、段② 达成率，与「快照坑」教训族｜2026-10-23',
  '',
  '**协议**：种子 12 颗预注册（`BASE_SEED 2026` / `STEP_SEED 1013`，跑一次锁定，**不许换种子重跑** ——',
  '否则调参时会不知不觉挑到「能过的那一组」）；尾部豁免 `Math.max(1, round(SEEDS/6))`；',
  '记录项「满级极差 ≤35%」（本轮 26.8%，已贴线：**再出现两颗新尾部要先查妖纹掷档方差，不是先动门槛**）。',
  '',
  '**量级双阈值**（D99）：`|相对偏差| > 50%` **且** `|绝对偏差| > 40min` 才红；',
  '**段② 达成率**：成型早于满级的种子数 / 总数 ≥ 90%（本轮 11/12 = 91.7%）。',
  '',
  '**快照坑（第二十四次教训，归成一族）**：',
  '`castSpeed`（面板有、战斗里冷却写死）→ `xpGain`/`lootQuantity`/`lootRarity`（有定义无消费方）→',
  '`厚皮`（面板有、通道是死链）→ **判据自己**（`preMax().formedAt` 在满级那一刻恰好是 `null`，',
  '所以「成型晚于满级」的告警永远打不出来，报表只写「达成 11/12」而不说是哪颗）。',
  '> 一句话：**「存在」和「被读」是两件事，读到的还得是「当时的真相」。**',
  '',
  '与「修死属性先写对账式」是同一动作的两个时机：**改之前问「谁读它」，改之后问「它读到了什么」**。',
  '',
  '**基线（下轮沿用）**：满级 313.7 / 段② 199.9 / 达成 11-12 / 法宝 1.330 分、0.1243 杀 / 击杀 10.697 分。',
].join('\n');

if (raw.includes('### D100 ')) throw new Error('D100 已存在');
const next = raw.endsWith('\n') ? raw + BLOCK + '\n' : raw + '\n' + BLOCK + '\n';
if (next.length <= before) throw new Error(`未变长：${before} → ${next.length}`);
for (const id of ['D100', 'D101']) {
  const hits = (next.match(new RegExp(`^### ${id} `, 'gm')) ?? []).length;
  if (hits !== 1) throw new Error(`${id} 标题数 ${hits}`);
}
writeFileSync(FILE, next, 'utf8');
console.log(`DECISIONS.md ${before} → ${next.length}（+${next.length - before}）；快照 ${stamp}`);
