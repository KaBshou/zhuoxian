// 一次性补丁：DECISIONS.md 三条（修为曲线收口 / 破绽量纲 / 真元单源）。跑完即弃。
import fs from 'node:fs';
const p = 'F:/dsh-work/zhuoxian/docs/DECISIONS.md';
let c = fs.readFileSync(p, 'utf8');

const old1 = '修为曲线换模型 | `每重=R(k)×8%`（渡劫 28%），`R(k)=180×1.56^k`；废弃 100×2.6^realm×1.1^stage | BALANCE §12 明确旧三系数不能用。**遗留偏差**：R(k) 几何合计 14114 vs 表 C 时长反算 25638（差 45%），已反馈数值策划定稿 |';
const neu1 = '修为曲线换模型 | `每重=R(k)×8%`（渡劫 28%）；R(k) 用 **BREAKTHROUGH_XP 显式数组**（合计 158617=336min=5.6h） | 几何式 180×1.56^k 合计只有 154min，与表 C 差 45%——修为/小时是线性，几何式 R÷速率比值必递减，硬套底数永远对不上；shuzhi 2026-10-22 定稿显式数组，progression.ts 已落地（realmXp 查表，两个 RATIO 保留） |';
if (!c.includes(old1)) { console.error('MISS 1'); process.exit(1); }
c = c.split(old1).join(neu1);

const anchor = '| lifeRegen/lifeOnHit 战斗生效 |';
const add = '| 破绽通道改量纲 | 破绽率词条一律 **flat**（基数 0.05 太小，increased 在上面等于没写）；倍率词条保留 increased | 期望=1+率×(倍率−1)：破绽率 +100% increased 只 +2.4% 期望、+30% increased 只有 +1.5 个百分点。shuzhi 实测两条 crit 玉简合计只值 +3.1%。方案：贯头 flat 0.06（已落）/ 破军 flat 0.10 四档（待 shuzhi）/ 断筋+断念留 inc（合计 +45% → 倍率 2.175）。3 件凑齐期望 1.2468 vs 1.025 = +21.6%，§3 明写「无破绽基准」不改怪血 |\n| 真元回复单源 | `MANA_REGEN_PER_SEC = STAT_META.manaRegen.base`（B1：基线 2→4 由 shuzhi 改 stats.ts） | battle.ts 原来自写 2，stats.ts 改基线必漂——两处写数必漂，收口单出处 |\n';
if (!c.includes(anchor)) { console.error('MISS anchor'); process.exit(1); }
c = c.split(anchor).join(add + anchor);

fs.writeFileSync(p, c, 'utf8');
console.log('OK');
