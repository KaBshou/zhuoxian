/**
 * 追加 D99：九境量级双阈值 + 段② 达成率口径 + 一个「判据看不见自己要抓的东西」的坑。
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
  '### D99 九境量级双阈值 + 段②「成型早于满级」改达成率（12 种子协议第一次跑红之后）｜2026-10-23',
  '',
  '**背景**：D98 把种子数改成 12 颗后第一次跑，两个红都不是妖纹数值错，而是**判据口径在 n=12 下太紧**：',
  '',
  '| 红 | 实测 | 结论 |',
  '|---|---|---|',
  '| 九境量级（`|dev|>50%`）| `3039` 境3 +56.6%、`6078` 境2 +63.1% / 境3 +61.5% | 绝对偏差只有 30.6 / 24.0 / 33.2 min |',
  '| 段② 逐种子「成型早于满级」| `3039` 成型 336.8 > 满级 326.2（103%）| 1/12 = 8.3% 的方差 |',
  '',
  '**① 量级线改双阈值（不做「境 ≥4 豁免」）**：`REALM_MAGNITUDE_LIMIT = 0.5` **且** `REALM_MAGNITUDE_ABS_MIN = 40`',
  '（`|相对偏差| > 50%` 且 `|绝对偏差| > 40min` 才红）。依据：满级时长的种子散布是 ±8~13%（12 颗实测 279.3~363.4），',
  '每一次到达时刻都带 **±25~40min 的噪声地板**；判据容差低于 2× 噪声地板时，它测的是种子不是设计。',
  '按位置豁免（「境 ≥4 才判」）是把症状按位置切掉，以后没人说得清「为什么是 4」。',
  '双阈值仍抓得住「一错一倍」：境 6（152min）变 306 ⇒ 绝对偏 153min ⇒ 红。',
  '',
  '**② 段② 改聚合层，不改常数**：`成型早于满级的种子数 / 总种子数 ≥ 90%`（`FORMED_BEFORE_MAX_RATE = 0.9`）。',
  '段② 是**带方差的设计目标**，不是正确性不变量；11/12 = 91.7% 是达成率，不是失败；系统性回归（6/12）照样红。',
  '**明确不做**：不放宽 `≤0.98`、不动 `FORMED_SUSTAIN_MIN 30` / `FORMED_WORST_FLOOR 0.70` —— 动它们等于把门禁挪开迁就数据。',
  '',
  '**③ 改的过程中踩到「判据看不见自己要抓的东西」**：`structuralOk` 先改成达成率后，`段②` 仍然红，',
  '原因是另外两处还写着逐种子口径（`formedRuns.length === runs.length`、`formedRelSeedOk`），',
  '同一颗种子被三处各判一次 ⇒ 只改一处等于没改。',
  '更阴的是：`lateFormed` 当时用 `preMax(r).formedAt` —— 那是**「满级那一刻的值」**，',
  '而「成型晚于满级」的种子在那一刻恰好还是 `null` ⇒ **告警行一行都打印不出来**（`达成 11/12` 却看不到是哪颗）。',
  '改成绝对值 `r.formedPowerAt > r.maxedAt` 才看见 `3039 成型 336.8 > 满级 326.2`。',
  '**教训：一条判据如果永远不报，先怀疑它读的是「判决时刻的快照」而不是「事实本身」。**',
  '',
  '**④ 改完 12 种子全绿（`tmp/v448.log`、`--seeds=12 --minutes=900 --post-cap --talents=off`，EXIT=0）**：',
  '- 满级 min 279.3 / 中位 **313.7（+4.6%）** / max 363.4，副红线 279.3 ≥250 ✓，极差 **26.8%**（观察线 35%）；',
  '- 段② 判据 C 中位 **199.9**（目标 186 = 满级 × 0.62，+7.5%，窗口 ≤214）、达成 **11/12（91.7%）**；',
  '- 段② 相对副红线中位 **66.4%**（≤75%）、最差 84.9%（只打印）；',
  '- 九境量级 **通过**（尾部 2 颗 4052/5065 按 D96 降级，额度 2 颗内）；死亡 0×12；',
  '- 池化产出：法宝 **1.330/分**、法宝/kill **0.1243**、击杀 **10.697/分** —— 与 D97 之前逐位一致。',
  '',
  '**⑤ shuzhi 记账**：`hou`/`shi` 改抗性通道后读数与改前「逐位一致」⇒ 这是**等价替换死词条**，不是加难度；',
  '`armor +100%` 记为**死通道**（玩家伤害全带五行，护甲只占 30% 且与抗性二选一），这是项目第二次撞死通道',
  '（第一次是 §16.7 的怪物 armor）—— 「每只怪至少有一条五行抗性」的不变量测试要长期留着。',
].join('\n');

if (raw.includes('### D99 ')) throw new Error('D99 已存在');
const next = raw.endsWith('\n') ? raw + BLOCK + '\n' : raw + '\n' + BLOCK + '\n';
if (next.length <= before) throw new Error(`未变长：${before} → ${next.length}`);
const hits = (next.match(/^### D99 /gm) ?? []).length;
if (hits !== 1) throw new Error(`D99 标题数 ${hits}`);
writeFileSync(FILE, next, 'utf8');
console.log(`DECISIONS.md ${before} → ${next.length}（+${next.length - before}）；快照 ${stamp}`);
