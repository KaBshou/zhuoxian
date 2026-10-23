/**
 * 追加 D95 / D96 / D97 / D98 到 docs/DECISIONS.md。
 *
 * 纪律（A1 事故后定的）：
 *   1. 写盘前留 `tools/_bak/` 快照；
 *   2. 锚点必须唯一，替换/追加前断言；
 *   3. 追加后的长度必须**变长**（中文按字符算，不按字节估）；
 *   4. 正文一律用单引号行数组 join，不嵌套反引号模板（会 SyntaxError）。
 */
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const FILE = 'docs/DECISIONS.md';
const raw = readFileSync(FILE, 'utf8');
const before = raw.length;

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
mkdirSync('tools/_bak', { recursive: true });
copyFileSync(FILE, `tools/_bak/DECISIONS.md.${stamp}.bak`);

const BLOCK = [
  '',
  '### D95 怪物妖纹：8 条分 4 类、同类互斥（REQ §3 第 8 条的真正实现）｜2026-10-23',
  '',
  '**问题**：REQ §3 第 8 条要求「怪物 0~4 条妖纹，每条提供稀有度与物品数量加成」，而项目里',
  '`DROP_CHANCE` / `DROP_RARITY_BONUS` 的 magic / rare 两档**一直是死代码** —— `spawnRing` 调',
  '`spawnMonster(def, floor, uid, x, y)` 从不传 rarity，实战里除镇守全是 normal。',
  '`glossary.ts` 只有 `monsterAffix: \'妖纹\'` 一个词条、`modifier.ts` 有 `\'monster\'` 来源标签，但没有生产者。',
  '',
  '**做法**：',
  '- 新增 `src/data/monster-affixes.ts`（8 条定义 + `sumMonsterAffixes` + `monsterAffixSuffix`）与',
  '  `src/core/monster-roll.ts`（`rollMonsterRarity` / `rollMonsterAffixIds` / `rollMonsterIdentity`）。',
  '- **结构防死，不靠数值上限**：8 条分伤害/防御/速度/经济四类，**每类至多 1 条** ⇒「四条全叠伤害」在生成阶段不可能发生。',
  '  洗类别再抽（不是撞了重抽 —— 后者抽第 4 条时退化成一堆重试）。',
  '- 掷档**每只怪独立**（不是每波保底）：层 1~9 `8%/1%`、10~18 `10%/2%`、19~27 `12%/3%`、28~46 `15%/4%`（magic/rare）。',
  '- 数值口径：同类加成是 **increased（加法汇总后乘一次）**，`attackInterval` 是唯一乘法；',
  '  `dropBonus` 累加后钳到 `MONSTER_QTY_CAP = 0.24`（再大就会**挤压法宝份额** —— 4 条 ×0.12 时 rare 反而比 normal 穷）。',
  '- `DROP_RARITY_BONUS` magic `1.7 → 1.25`、rare `2.6 → 1.5`：仙品权重 `2(3b−2)` 对 b 三倍敏感，',
  '  留 1.7/2.6 会把仙品率抬 35%（段④ 6.2h → 4.6h）。',
  '- 妖纹**不进图鉴/成就**（会破 codex 唯一性与 20 条冻结口径）；渲染在血条右侧写「名 · 凶煞·厚皮 +1」。',
  '',
  '**实测（6 种子 × 900min）**：满级中位 302.9 → **316.2（+4.4%）**、击杀/min 11.10 → **10.73（−3.3%）**、',
  '法宝/kill 0.1154 → **0.1232（+6.8%）**、池化法宝/min 1.281 → **1.321（+3.1%）**、出货 3.46/分、',
  '三阶占比 74.7%、死亡 0×6。分稀有度闸通过率 27.9/42.5/75.3% 与 `DROP_CHANCE` 0.28/0.42/0.75 逐位吻合。',
  '',
  '**纪律**：妖纹倍率只作用于**个体**（在 `spawnMonster` 里算），绝不改 `BASE_MONSTER_HP` / `FLOOR_HP_MUL`',
  '这类全局常量 —— 否则整条层曲线一起漂、几轮验收基线全作废。',
  '',
  '### D96 尾部种子护栏：只降级「满级出窗」那颗，且最多 1 颗｜2026-10-23',
  '',
  '**问题**：九境量级线（`|dev| ≤ 50%`）在一颗慢种子上连报 7 格，而那颗种子同时「满级出窗」',
  '⇒ 同一个现象判两次，不增信息，还把红灯变成噪音（假红比漏检更贵 —— 它教人忽略红灯）。',
  '',
  '**规则**：`tailSeed = (!Number.isFinite(maxedAt) || maxedAt < MAX_MIN_MINUTES || maxedAt > MAX_MAX_MINUTES)`；',
  '量级线只对**非尾部种子**生效，尾部种子进「尾部种子（只记录，不判）」一行。',
  '**护栏**：尾部种子最多降级 1 颗；同轮出现 ≥2 颗就**不许降级**，按系统性问题查（本轮 12 种子协议下额度 = 2）。',
  '',
  '**第一次运行就被护栏挡住**：6 种子时出现 2 颗（`20265073` 362.6min 超上限、`20264060` 263.3min 低于下限）',
  '⇒ 拒绝豁免、量级线仍红。判断依据：两颗分居窗口两侧（一快一慢）⇒ 是**方差**不是偏移；',
  '而击杀率 −4.2% 恰好把中位推到 316.2（`1/0.958 = 1.044` 逐位对得上），中位本身在窗口内。',
  '',
  '### D97 `厚皮` 从护甲通道换成抗性通道（护甲妖纹近乎死词条）｜2026-10-23',
  '',
  '**证伪过程（`tests/_tmp-thick.test.ts` 临时诊断，跑完即删）**：同一只怪、同一份玩家伤害，',
  '比较「无妖纹 / 带厚皮」的 TTK：',
  '',
  '| 怪 @层 | 护甲 | 物理 TTK | 火系 TTK |',
  '|---|---:|---|---|',
  '| `fangshi-yuanke` @20 | 5→10 | +2.0% | **+0.6%** |',
  '| `yaoshi-zhu` @10 | 12→24 | +7.4% | **+2.0%** |',
  '| `yaoshi-zhu` @5 | 12→24 | +10.7% | +2.8% |',
  '| `shijie-pu` @任意 | 0→0 | **0.0%** | **0.0%** |',
  '',
  '根因：玩家伤害**全部带五行标签**（`src/core/battle.ts:776` 的 `tags: p.tags`），',
  '而 `mitigationOf` 里护甲只占 `PHYSICAL_MITIGATION_SHARE = 0.3` 权重（元素 0.7 走抗性）',
  '⇒ 护甲翻倍对元素伤害只剩 0.6~2.8%；15 只怪里 2 只 `armor === 0`（翻了还是 0）。',
  '',
  '**修法**：`hou` 的 `armorInc: 1.0` → `resistInc: 0.2`；`shi`（噬宝）`resistInc 0.25 → 0.15`',
  '（两条共用抗性通道，最坏组合 `厚皮+噬宝` = 加法汇总 ×1.35 ⇒ `resist 0.35 → 0.4725`，元素减伤 33.1%，不会「打不动」）。',
  '**顺带补数据**：`fangshi-yuanke` 补 `resMetal 0.15`、`duanqiang-gui` 补 `resFire 0.15` ——',
  '没有抗性表的怪会把这两条妖纹**安静吞掉**，而失效不报错。由此立不变量：',
  '**每只怪至少有一条自己的五行偏向**（`tests/monster-affixes.test.ts` 里用 `ALL_MONSTERS` 断言，新增 1 条测试）。',
  '',
  '**验收**：`tsc 0` / `vitest 642 passed / 42 files`（`hou` 断言从「护甲变大」改成「抗性 ×1.2 且护甲不变」）。',
  '',
  '### D98 预注册 12 种子协议（不许换种子重跑）｜2026-10-23',
  '',
  '**问题**：6 颗种子的极差能到 31.5%，`n=6` 时「尾部豁免 1 颗」= 16.7% 额度，一次撞 2 颗就红；',
  '更危险的是**调参时换种子** —— 换到自己满意的那组，数值看起来就「调好了」。',
  '',
  '**协议（写入 `tools/run-timeline.mjs` 头部注释与常量）**：',
  '- 种子数 **6 → 12**；`BASE_SEED = 2026`、`STEP_SEED = 1013` **写死并注释「预注册，跑一次即锁定，不许换种子重跑」**；',
  '- 尾部豁免额度改成**按比例** `Math.max(1, Math.round(SEEDS / 6))`（12 颗 → 2 颗 ≈ 16.7%）；',
  '- 新增**记录项**：满级极差 `(max − min) / 中位`，观察线 **≤35%**（不判，只记录）。',
  '',
  '**为什么要记极差**：它衡量的不是难度而是「种子方差」。方差一旦长期贴线，说明有系统性因素在放大个体差异',
  '（精英密度、层内掷档），那时该查分布，而不是调目标值。',
].join('\n');

if (raw.includes('### D95 ')) throw new Error('D95 已存在，拒绝重复追加');
const next = raw.endsWith('\n') ? raw + BLOCK + '\n' : raw + '\n' + BLOCK + '\n';
if (next.length <= before) throw new Error(`追加后未变长：${before} → ${next.length}`);
for (const id of ['D95', 'D96', 'D97', 'D98']) {
  const hits = next.match(new RegExp(`^### ${id} `, 'gm')) ?? [];
  if (hits.length !== 1) throw new Error(`${id} 标题数不是 1：${hits.length}`);
}
writeFileSync(FILE, next, 'utf8');
copyFileSync(FILE, dirname(FILE) + '/_bak-check.md');
console.log(`DECISIONS.md ${before} → ${next.length} 字符（+${next.length - before}）；快照 tools/_bak/DECISIONS.md.${stamp}.bak`);
