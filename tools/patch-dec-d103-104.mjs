// 追加 D103（护盾回充）与 D104（五行碎片）到 docs/DECISIONS.md
//
// 纪律（A1 事故之后定的）：
//   ① 写盘前留 tools/_bak/ 快照；
//   ② 写盘前做长度断言与标题唯一性断言（漏了就会把整段覆盖掉，A1 就是这么发生的）；
//   ③ 替换文本一律用行数组 join（不用模板字符串 —— 正文里有 markdown 反引号）。
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const PATH = 'docs/DECISIONS.md';
const raw = readFileSync(PATH, 'utf8');
const before = raw.length;
if (!raw.includes('### D102')) throw new Error('MISS 锚点 D102（文件结构变了，先确认当前最后一条编号）');
if (raw.includes('### D103')) throw new Error('D103 已存在，拒绝重复追加');
if (raw.includes('### D104')) throw new Error('D104 已存在，拒绝重复追加');

const lines = [];
lines.push('');
lines.push('---');
lines.push('');
lines.push('### D103　护盾回充：从「一次性吸收」改成「脱战 3 秒后回充」');
lines.push('');
lines.push('**问题**：REQ §3 要求护体罡气「可随时间再生」，实现里 `shield` 只有一次性吸收（`battle.ts` 的 `damagePlayer`），');
lines.push('掉光就永远为 0 —— 面板看得见（HUD 顶栏有「罡气」条）、实战不复原。这是本项目第 5 次撞「存在但没人读」的坑，');
lines.push('只是这次是「读了开头没读结尾」。');
lines.push('');
lines.push('**参数（BALANCE §5.10 定稿）**：');
lines.push('- 延迟 `SHIELD_RECHARGE_DELAY = 3.0s`：**不是 4s**。波末唯一无伤窗口 = `WAVE_GAP 0.9s` + 怪走完攻击距离约 2.5s ≈ 3.4s，');
lines.push('  4s 落在窗口外 ⇒ 面板有、实战永不回，等于换一种方式做死属性；');
lines.push('- 速率 `min(shieldMax / 4, 0.05 × lifeMax)` 每秒（双钳制：大盾按 1/4，小盾按气血比例）；');
lines.push('- 受击**打断并重置计时，但不清空已有护盾**（清空是双罚，深层高频受击永远攒不起来）；');
lines.push('- 只补到上限；不吃 `lifeRegen`、不吃治疗；复活时护盾归 0（死亡已罚修为，不给满盾）。');
lines.push('');
lines.push('**为什么这是等价替换不是加难度**：12 种子 900min `--post-cap` 逐种子满级时刻与改前**一位不差**');
lines.push('（279.7/326.2/351.1/363.4/299.0/308.0/319.4/320.1/279.3/303.3/294.5/334.3），因为护盾只加 EHP 不改 DPS，');
lines.push('而 12 个种子全部 0 死亡 ⇒ 时间线对 EHP 完全不敏感。');
lines.push('');
lines.push('**由此立一条新账（重要）**：`满级时长` 这条门禁**测不到生存性**。要验收护盾/生存，必须另建一条度量');
lines.push('（例如固定深层的承伤曲线、或 `damageTaken` 的分布），不能指望「满级会不会更早」。');
lines.push('本轮没有建这条度量，所以护盾的收益是「按 BALANCE 推导的 EHP 上限 +8%」（层 27 每波入伤 70~120 HP、回充 ≤35 HP/波），');
lines.push('不是实测值。**这条账不许被忘掉** —— 否则以后所有防御向改动都会以为自己是零影响。');
lines.push('');
lines.push('**验收**：`tests/shield-recharge.test.ts` 10 条（双钳制各一支、延迟必须 3、2.8s 不回复、过门槛回 50、');
lines.push('不越上限、`shieldMax=0` 永不回、`lifeRegen` 不作用于护盾、真怪打到玩家后计时归零但护盾不清空、');
lines.push('被打断后要重新等满 3 秒）。`src/core/battle.ts` 里 `shieldRechargeRate()` 是速率的**唯一出处**。');
lines.push('');
lines.push('### D104　五行碎片：镇守定向掉落，打造时把对应五行灵纹权重 ×4');
lines.push('');
lines.push('**动机**：REQ §3 第 7 条「boss 掉材料改通货参数（金系碎片抬金属性词条权重）」整块没做 ——');
lines.push('这是 v1 需求里剩下最后一条「有明确玩法收益」的缺口。');
lines.push('');
lines.push('**做了什么**（`src/data/fragments.ts` + `core/item.ts` 的 `AffixWeightBoost` + `core/crafting.ts` 的 `CraftOptions`）：');
lines.push('- 只做 **金 / 火 / 水** 三系：木、土在 v1 没有任何带 `wood`/`earth` 标签的灵纹，做了也没人能加权（`data/tags.ts` 有 `wood`/`earth` 元素但灵纹池里没有）；');
lines.push('- **每镇守必掉 1 颗**，属性按层/阶：1~9 金、10~18 火、19~27 水，无尽层 28~46 按 `(floor − 28) % 3` 轮转');
lines.push('  （不轮转的话三阶镇守恒为玄冥 ⇒ 进无尽层后再也拿不到金/火，分段投放直接断掉）；');
lines.push('- 单属性上限 **99**；满上限时打印一句「已满 99，不再累积」（不刷屏、也不让玩家以为掉率坏了）；');
lines.push('- 使用时机：玩家按 **F** 循环「未定向 → 金 → 火 → 水 → 未定向」，定向后**下一次添灵纹**消耗 1 颗，');
lines.push('  把池里带该五行标签的灵纹权重 **×4**（不叠乘：×16 会让单条到 74%，定向就变成指定）；');
lines.push('- **只有添灵纹吃碎片**。洗（全重掷）/ 灭（删一条）/ 满条兜底重掷都是赌（D55），');
lines.push('  碎片一旦能给赌类操作兜底，就等于把负期望抹平的免费重掷券。');
lines.push('');
lines.push('**三条结构纪律**：');
lines.push('1. **走镇守独立掉落槽，不进 `DROP_CHANCE` 三分类**：三分类是「先过 0.28 闸再分流」，');
lines.push('   碎片挂进去会挤压法宝份额（`法宝份额 = 1 − 0.6(1+q)`，D95 妖纹就在这上面踩过）；');
lines.push('2. **不进 `s.pocket`**：pocket 是黄阶/灭/洗三种通货的余额表，碎片进它会破坏 `craftPlanFromPocket` 语义、糊掉 D28 囤积监测；');
lines.push('3. **必须入档**（`player.fragments`），读档走 `sanitizeFragments`（脏值归零、上限夹取、非整数向下取整）。');
lines.push('');
lines.push('**产量与定位**：一轮约 32 颗，黄阶灵石一轮约 314 个 ⇒ 碎片是黄阶的 1/10。它是**定向工具**，不是主力通货 ——');
lines.push('所以它解决的是「我想让这件出火行」而不是「我要更多灵纹」。');
lines.push('');
lines.push('**UI**：放在渊痕价目表（M 面板）底部一行「碎片　金 x　火 y　水 z ／ 定向 X 行 · F 切换」。');
lines.push('不新开面板的理由：两者都是「长线积累物」，玩家想花渊痕时正好也在想「要不要定向」，');
lines.push('一块界面处理两类余额 ⇒ 少一个键位、少一条探针、少一处要同步的互斥逻辑。');
lines.push('');
lines.push('**验收**：`tests/fragments.test.ts` 16 条（数据契约与映射、洗档、镇守掉/普通不掉、满上限、存档往返、');
lines.push('定向消耗/不消耗、无碎片时安静降级、洗与灭不吃碎片、×4 加权同种子对照确实抬升、面板那行存在）。');
lines.push('踩到的两个测试坑也记下来：①往 `s.battle.events` 塞假击杀事件**无效**（`tickBattle` 开头就清空 events），');
lines.push('只能真的把怪摆上场再打到死；②`startWave()` 自己会 `wave += 1`，想测第 10 波镇守要先设 `wave = 9`；');
lines.push('③`AffixInstance` **没有 `id` 字段**（只有 `defId` + 冗余 `tags`），读 `added.id` 得到 undefined 会让「加权有没有生效」恒为 0（假绿）。');
lines.push('');

const block = lines.join('\n');
const next = raw.trimEnd() + '\n' + block;

// 写盘前断言：只能变长，且新增量接近预期（防止锚点写错把正文覆盖成一小截）
const delta = next.length - before;
if (delta < 2000 || delta > 12000) throw new Error(`追加量异常：${delta} 字符（预期 2000~12000）`);
if ((next.match(/### D103/g) ?? []).length !== 1) throw new Error('D103 标题数不为 1');
if ((next.match(/### D104/g) ?? []).length !== 1) throw new Error('D104 标题数不为 1');

const bakDir = join(dirname(PATH), '..', 'tools', '_bak');
mkdirSync(bakDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const bak = join(bakDir, `DECISIONS.md.${stamp}.bak`);
if (existsSync(PATH)) copyFileSync(PATH, bak);
writeFileSync(PATH, next, 'utf8');

console.log(`OK ${before} → ${next.length} 字符（+${delta}），快照 ${bak}`);
