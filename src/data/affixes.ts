/**
 * 灵纹表（= 词缀表）—— 60 条，数值策划维护。
 *
 * 类型契约在 `src/data/affix-def.ts`（Lead 维护，本文件只填数据，不定义接口）。
 * 标定依据与推导过程在 `docs/BALANCE.md`，每条灵纹上方一行注释写「为什么是这个数」。
 *
 * ── 三条全局规则（60 条全部遵守，改表时必须一起改注释）──
 *
 * 1. **perIlvl = value × 3%**。理由：同一阶位区间 15 灵蕴 → 数值涨 1+0.03×14 = 1.42 倍，
 *    小于跨阶位的 1.7 倍。这保证「高阶位定义永远强于低阶位定义」不会在灵蕴 99 处反转
 *    （如果斜率给大，黄阶灵纹线性外推到灵蕴 99 会反超地阶，阶位制度就失效了）。
 *
 * 2. **跨阶位 ×1.7**（黄 1.0 / 玄 1.7 / 地 2.9 / 天 4.9）。推导：跨 5 层怪血 ×1.34^5 = 4.32，
 *    玩家同期另有法器基底（×1.18）、境界基础（×1.02）、天赋/神通（×1.01）三条通道 = 1.216，
 *    灵纹需承担 4.32 / 1.216 = 3.55，两阶开方 = 1.88，取 1.7（保守 10%，因为灵纹是随机洗出来的、供给比基底更不稳）。
 *
 * 3. **权重随阶位递减**（黄 100 → 天 40，utility 类再低一档）。affix-def.ts 的
 *    AFFIX_TIER_WEIGHT 还会再乘一次（1.0 / 0.55 / 0.28 / 0.12），两级叠加后
 *    黄:天 ≈ 21:1 —— 这是需求文档要的「高阶词缀权重明显低，出货才有喜悦感」；真正的稀有感来自灵蕴门槛（天阶只在灵蕴 46+ 出现）。
 *
 * ── 四条内容规则 ──
 * · 9 个部位各 6 条专属 + 6 条通用 = 60。部位专属是为了「不同部位洗出来的东西不一样」，
 *   否则洗练永远出同样几条。
 * · 武器不给法术/召唤词条，道袍不给攻速/破绽词条，戒指不给护体（重甲感）—— 部位边界见 slots.ts。
 * · 五行只写金/火/水三条（REQ 第八节 D3 默认值「五行先开 3 行」），木/土等待 v2。
 * · 带 tags 的灵纹只加成匹配标签的伤害实例（见 data/tags.ts 的 matchesTags），
 *   所以「火伤 +10%」对金系 BD 就是废词条 —— 这是刷取意义之所在，不是 bug。
 */

import type { AffixDef } from './affix-def';

/** 60 条灵纹。id 一旦发布不能改（存档里存的是它）。 */
export const AFFIXES: readonly AffixDef[] = [
  // ── 通用 6 条 · 9 个部位都能出（生命/护体/真元的「底线词条」） ──
  // 通用气血。20 = 初始气血 100 的 20%：一件灵品（1~2 条）在层 1 必须让玩家「感觉得到」，20% 是可感知下限。
  { id: 'affix-life-01', name: '厚土', stat: 'life', op: 'flat', value: 20, perIlvl: 0.6, tier: 'huang', ilvl: 1, weight: 100 },
  // 通用护体。12 让层 1 的护体减伤从 0 抬到 44/(44+60)=42%（配合道袍基底 25 与两条灵纹）。
  { id: 'affix-armor-01', name: '玄甲', stat: 'armor', op: 'flat', value: 12, perIlvl: 0.36, tier: 'huang', ilvl: 1, weight: 100 },
  // 通用真元。层 1 真元 50，一个神通约 10 点 → 15 点 = 多一次半施放，是「能不能连贯放招」的手感阈值。
  { id: 'affix-mana-01', name: '灵台', stat: 'mana', op: 'flat', value: 15, perIlvl: 0.45, tier: 'huang', ilvl: 1, weight: 70 },
  // 玄阶气血。34 = 20 × 1.7；1.7 的来历见 BALANCE.md §7.1：跨 5 层怪血 ×1.34^5 = 4.32，扣掉法器基底/境界/天赋三条通道的 1.216 后剩 3.55，两阶开方 = 1.88，保守取 1.7。
  { id: 'affix-life-02', name: '铸体', stat: 'life', op: 'flat', value: 34, perIlvl: 1.02, tier: 'xuan', ilvl: 16, weight: 80 },
  // 地阶护体。35 = 12 × 2.9。层 7 攻伐 7.31 × 命中 8 次/波 = 58 入伤/波，玩家需要 ~140 护体（道袍 t3 基底 99 + 玄甲 12×1.18 + 本条 35）把减伤做到 50%。
  { id: 'affix-armor-02', name: '太清', stat: 'armor', op: 'flat', value: 35, perIlvl: 1.05, tier: 'di', ilvl: 31, weight: 60 },
  // 天阶气血。98 = 20 × 4.9。天阶只在灵蕴 46+（层 10+）出现，是「无尽层才有的追装目标」。
  { id: 'affix-life-03', name: '长生', stat: 'life', op: 'flat', value: 98, perIlvl: 2.94, tier: 'tian', ilvl: 46, weight: 40 },
  // ── 法器（剑）· 6 条 · 攻击通道 ──
  // 法器攻击伤害 +10%。满装 30 条灵纹里约 10 条输出灵纹 → 合计 +170% increased，单条占 6%，不会一条定生死。
  { id: 'affix-damage-01', name: '剑锋', stat: 'damage', op: 'increased', value: 0.1, perIlvl: 0.003, tier: 'huang', ilvl: 1, weight: 100, slots: ['sword'], tags: ['attack'] },
  // 出手速度 +5%。攻速是乘算通道（1.0→1.05），5 条拉满 +25%；再高就会和「more 通道」打架，所以刻意压低。
  { id: 'affix-atkspd-01', name: '疾斩', stat: 'attackSpeed', op: 'increased', value: 0.05, perIlvl: 0.0015, tier: 'huang', ilvl: 1, weight: 70, slots: ['sword'] },
  // 玄阶「攻击+金」双标签。0.17 = 0.10 × 1.7。双标签意味着只有金系攻击吃，锐金门专属，是 BD 定向卡。
  { id: 'affix-damage-02', name: '裂金', stat: 'damage', op: 'increased', value: 0.17, perIlvl: 0.0051, tier: 'xuan', ilvl: 16, weight: 80, slots: ['sword'], tags: ['attack', 'metal'] },
  // 破绽率 +10 个百分点（基础 5% → 15%）。**必须用 flat，且必须给到 0.10。**
  // 判据：期望倍率 = 1 + 破绽率 × (破绽倍率 − 1)。基础 5% / 1.5 倍时，increased 通道几乎是死的：
  //   +30% increased 破绽率 = +1.5 个百分点 = +3% 期望伤害；+100% 也只有 +2.4%。
  //   所以破绽系一律用 flat 绝对值（一条 10 个点才有感），increased 只留给「破绽倍率」那条线。
  // 四档口径（×1.7）：黄 0.06 / 玄 0.10 / 地 0.17 / 天 0.29；本版 60 条只出玄阶，高阶留给后续扩池。
  // 破绽流账（BALANCE §15）：破军 0.10 + 贯头(玉简) 0.06 + 断念 0.20 + 断筋(玉简) 0.25 四件齐
  //   → 破绽率 21%、破绽倍率 1.9×1.25 = 2.125 → 期望 1.2363 = 基线的 +20.6%（超模投资，表 A 不含它）。
  //   再加破煞 + 凝神（六件全堆）→ 破绽率 24.4%、倍率 2.375 → +30.3%，是极限堆叠上限。
  { id: 'affix-crit-01', name: '破军', stat: 'critChance', op: 'flat', value: 0.1, perIlvl: 0.003, tier: 'xuan', ilvl: 16, weight: 50, slots: ['sword'] },
  // 地阶攻击伤害 0.29 = 0.10 × 2.9。层 7~9（灵蕴 35~45）正好是「装备成型」段的刷取目标。
  { id: 'affix-damage-03', name: '斩妄', stat: 'damage', op: 'increased', value: 0.29, perIlvl: 0.0087, tier: 'di', ilvl: 31, weight: 60, slots: ['sword'], tags: ['attack'] },
  // 天阶「更多伤害」+12%（乘算通道，无条件标签）。全游戏灵纹里唯一一条 more 伤害，是武器位的传奇级追求。
  { id: 'affix-damage-04', name: '诛仙', stat: 'damage', op: 'more', value: 0.12, perIlvl: 0.0036, tier: 'tian', ilvl: 46, weight: 25, slots: ['sword'] },
  // ── 本命法宝 · 6 条 · 法术/召唤/持续/范围通道 ──
  // 法术伤害 +10%。本命法宝是法修的「护符位」，所以法术词条集中在这里，法器（剑）不给法术词条。
  { id: 'affix-damage-05', name: '通玄', stat: 'damage', op: 'increased', value: 0.1, perIlvl: 0.003, tier: 'huang', ilvl: 1, weight: 90, slots: ['relic'], tags: ['spell'] },
  // 召唤物伤害 +10%。召唤物走同一条伤害管线（见 core/damage.ts），所以只靠标签就能吃到，不需要额外代码。
  { id: 'affix-damage-06', name: '御兽', stat: 'damage', op: 'increased', value: 0.1, perIlvl: 0.003, tier: 'huang', ilvl: 1, weight: 80, slots: ['relic'], tags: ['summon'] },
  // 持续伤害 +17%。dot 是独立标签（不是元素），所以它同时吃「火」和「持续」两条通道 → 焚炎堂的核心词条。
  { id: 'affix-damage-07', name: '燃魂', stat: 'damage', op: 'increased', value: 0.17, perIlvl: 0.0051, tier: 'xuan', ilvl: 16, weight: 70, slots: ['relic'], tags: ['dot'] },
  // 范围 +14%（关系 1.0→1.14）。范围是清波次效率的关键：一波 8 只怪，范围 +40% 约等于清怪速度 +20%，所以单条只给 14%。
  { id: 'affix-area-01', name: '布阵', stat: 'area', op: 'increased', value: 0.14, perIlvl: 0.0042, tier: 'xuan', ilvl: 16, weight: 50, slots: ['relic'] },
  // 地阶火伤 +29%。火是 v1 开放的三行之一（金/火/水），焚炎堂的毕业词条。
  { id: 'affix-damage-08', name: '焚天', stat: 'damage', op: 'increased', value: 0.29, perIlvl: 0.0087, tier: 'di', ilvl: 31, weight: 55, slots: ['relic'], tags: ['fire'] },
  // 天阶「更多召唤伤害」+10%。只加成召唤标签，御兽堂专属的天阶乘算通道。
  { id: 'affix-damage-09', name: '招魂', stat: 'damage', op: 'more', value: 0.1, perIlvl: 0.003, tier: 'tian', ilvl: 46, weight: 25, slots: ['relic'], tags: ['summon'] },
  // ── 冠 · 6 条 · 神识与护体罡气 ──
  // 神识 +8。按 §7 换算表（1 神识 = 2 真元 + 0.15% 破绽率）→ +16 真元 +1.2% 破绽率 ≈ 1.2 条黄阶灵纹的量级。
  { id: 'affix-spirit-01', name: '明镜', stat: 'spirit', op: 'flat', value: 8, perIlvl: 0.24, tier: 'huang', ilvl: 1, weight: 80, slots: ['crown'] },
  // 护体罡气 +20（= 初始气血的 20%）。罡气先于气血被消耗且脱战自回，是「挂机不死」的第一道保险。
  { id: 'affix-shield-01', name: '罡气', stat: 'shield', op: 'flat', value: 20, perIlvl: 0.6, tier: 'huang', ilvl: 1, weight: 90, slots: ['crown'] },
  // 玄阶神识 14 = 8 × 1.7。
  { id: 'affix-spirit-02', name: '降心', stat: 'spirit', op: 'flat', value: 14, perIlvl: 0.42, tier: 'xuan', ilvl: 16, weight: 70, slots: ['crown'] },
  // 机缘（掉落数量）+29%。
  // v4.17 D37(a)：原为「修为获取 +14%」，但 `xpGain` 是死属性（`character.ts` 的 gainXp
  // 不读任何属性，全库无消费方，见 BALANCE §20.17），玩家堆它是纯亏 → 改成同档的
  // 掉落数量（0.29 ≈ 14% 修为时间 × 2.07 的换算，按「一条玄阶 ≈ 省 7% 刷怪量」标定）。
  // 权重 45 的意义不变：它是「收益位」而不是「唯一解」。
  { id: 'affix-xp-01', name: '炼气', stat: 'lootQuantity', op: 'increased', value: 0.29, perIlvl: 0.0087, tier: 'xuan', ilvl: 16, weight: 45, slots: ['crown'] },
  // 地阶罡气 58 = 20 × 2.9。层 9 玩家气血约 300，罡气 58 相当于多 19% 的有效血条。
  { id: 'affix-shield-02', name: '天门', stat: 'shield', op: 'flat', value: 58, perIlvl: 1.74, tier: 'di', ilvl: 31, weight: 55, slots: ['crown'] },
  // 天阶罡气 98 = 20 × 4.9。天阶只出在灵蕴 46+，对齐「无尽层」段的生存压力。
  { id: 'affix-shield-03', name: '悬空', stat: 'shield', op: 'flat', value: 98, perIlvl: 2.94, tier: 'tian', ilvl: 46, weight: 30, slots: ['crown'] },
  // ── 道袍 · 6 条 · 抗性与回复 ──
  // 每秒气血回复 +0.2。标定：层 1 每波入伤 = 8 次 × 攻伐 3 = 24 点 / 75 秒 = 0.32/s，0.2/s 覆盖 62%，两条（龟息+周天）= 0.4/s 就够挂住 —— 这是「挂机不死需要两条回复」的设计值。
  { id: 'affix-liferegen-01', name: '龟息', stat: 'lifeRegen', op: 'flat', value: 0.1, perIlvl: 0.003, tier: 'huang', ilvl: 1, weight: 80, slots: ['robe'] },
  // 水抗 +8%。三条单抗（金/火/水）各给 8%：凑满 75% 上限需要 9~10 条，正好是「装备成型」段的主线任务。
  { id: 'affix-res-01', name: '水行', stat: 'resWater', op: 'flat', value: 0.08, perIlvl: 0.0024, tier: 'huang', ilvl: 1, weight: 90, slots: ['robe'] },
  // 火抗 +14% = 8% × 1.7。
  { id: 'affix-res-02', name: '火行', stat: 'resFire', op: 'flat', value: 0.14, perIlvl: 0.0042, tier: 'xuan', ilvl: 16, weight: 70, slots: ['robe'] },
  // 金抗 +14%。金行是锐金门的伤害类型，也是 v1 开放的三行之一。
  { id: 'affix-res-03', name: '金行', stat: 'resMetal', op: 'flat', value: 0.14, perIlvl: 0.0042, tier: 'xuan', ilvl: 16, weight: 70, slots: ['robe'] },
  // 护体 +30%（对「基底+灵纹」的全部护体生效）。道袍基底护体最大（70），所以这条只在道袍上才有意义。
  { id: 'affix-armor-03', name: '玄龟', stat: 'armor', op: 'increased', value: 0.3, perIlvl: 0.009, tier: 'di', ilvl: 31, weight: 45, slots: ['robe'] },
  // 体魄 +23。按 §7（1 体魄 = 3 气血 + 1 护体）→ +69 气血 +23 护体 ≈ 2 条地阶灵纹，但分散在两个属性上，适合体修。
  { id: 'affix-body-01', name: '镇脉', stat: 'body', op: 'flat', value: 23, perIlvl: 0.69, tier: 'di', ilvl: 31, weight: 55, slots: ['robe'] },
  // ── 护腕 · 6 条 · 攻速/施速/击中回气 ──
  // 结印速度 +5%。和出手速度同口径：法系没有出手，所以攻速与施速各有一条黄阶词缀，分别服务剑修与法修。
  { id: 'affix-castspd-01', name: '疾印', stat: 'castSpeed', op: 'increased', value: 0.05, perIlvl: 0.0015, tier: 'huang', ilvl: 1, weight: 70, slots: ['bracer'] },
  // 击中回气 +0.4。出手 1.0/s → +0.4/s，和「龟息 0.2/s」叠加后 0.6/s，覆盖层 1 入伤 0.32/s 的 188%；再高就不需要第二条回复灵纹了。
  { id: 'affix-onhit-01', name: '饮血', stat: 'lifeOnHit', op: 'flat', value: 0.25, perIlvl: 0.0075, tier: 'huang', ilvl: 1, weight: 60, slots: ['bracer'] },
  // 破绽率 +3.4 个百分点（基础 5% → 8.4%）。护腕是「小破绽」位：与法器「破军」(0.10) 同为 flat，
  // 但只有 1/3 的量，作用是给破绽流补最后一截，单穿它意义不大（一条 3.4 点 = 期望 +1.7%）。
  { id: 'affix-crit-02', name: '破煞', stat: 'critChance', op: 'flat', value: 0.034, perIlvl: 0.00102, tier: 'xuan', ilvl: 16, weight: 45, slots: ['bracer'] },
  // 破绽伤害 +0.20（1.5 → 1.7，相对 +13.3%）。critMulti 的基础值是 1.5，flat 直接加在倍率上
  // （见 core/damage.ts 的 critMultiplier）。与玉佩「凝神」同口径：两件是 +0.40，再乘玉简断筋的
  // +25% increased 就是 1.9 × 1.25 = 2.375（破绽流的上限倍率，BALANCE §15）。
  { id: 'affix-critmulti-01', name: '断念', stat: 'critMulti', op: 'flat', value: 0.2, perIlvl: 0.006, tier: 'xuan', ilvl: 16, weight: 40, slots: ['bracer'] },
  // 地阶出手速度 +14.5% = 5% × 2.9。攻速是乘算通道，所以地阶也不给到 20% 以上。
  { id: 'affix-atkspd-02', name: '双流', stat: 'attackSpeed', op: 'increased', value: 0.145, perIlvl: 0.00435, tier: 'di', ilvl: 31, weight: 40, slots: ['bracer'] },
  // 天阶击中回气 +1.0（= 0.4 × 2.5，**故意不按 ×4.9**）。理由：怪物入伤只按 1.12^5=1.76 增长，回复按 ×4.9 会给到 2.0/s、在层 12 直接碾压生存，把「配装求生」变成无意义。
  { id: 'affix-onhit-02', name: '摄魂', stat: 'lifeOnHit', op: 'flat', value: 0.6, perIlvl: 0.018, tier: 'tian', ilvl: 46, weight: 25, slots: ['bracer'] },
  // ── 踏云靴 · 6 条 · 身法与遁速 ──
  // 身法 +5%。移速只影响「走位/找怪」，不影响 DPS 曲线，所以可以给得相对大方；但超过 +30% 会让自动战斗的追击逻辑失效。
  { id: 'affix-move-01', name: '踏云', stat: 'resMetal', op: 'increased', value: 0.08, perIlvl: 0.0024, tier: 'huang', ilvl: 1, weight: 80, slots: ['boots'] },
  // 遁速 +8%。投射物速度影响「命中率」而非伤害，8% 是能感觉到但不破坏平衡的量。
  { id: 'affix-proj-01', name: '遁影', stat: 'resWater', op: 'increased', value: 0.08, perIlvl: 0.0024, tier: 'huang', ilvl: 1, weight: 60, slots: ['boots'] },
  // 玄阶身法 +8.5% = 5% × 1.7。
  { id: 'affix-move-02', name: '惊鸿', stat: 'resFire', op: 'increased', value: 0.14, perIlvl: 0.0042, tier: 'xuan', ilvl: 16, weight: 60, slots: ['boots'] },
  // 灵巧 +8。按 §7（1 灵巧 = 0.25% 出手速度）→ +2% 出手速度，比一条「疾斩」弱，但会进天赋结算。
  { id: 'affix-agility-01', name: '轻身', stat: 'agility', op: 'flat', value: 8, perIlvl: 0.24, tier: 'xuan', ilvl: 16, weight: 55, slots: ['boots'] },
  // 地阶身法 +14.5%。三条叠满约 +28%，刚好在「不影响追击」的上限内。
  { id: 'affix-move-03', name: '缩地', stat: 'armor', op: 'increased', value: 0.24, perIlvl: 0.0072, tier: 'di', ilvl: 31, weight: 40, slots: ['boots'] },
  // 天阶「更多遁速」+12%。乘算，只此一条，给御剑堂的「多投射物」BD 追求手感。
  { id: 'affix-proj-02', name: '御风', stat: 'armor', op: 'more', value: 0.15, perIlvl: 0.0045, tier: 'tian', ilvl: 46, weight: 20, slots: ['boots'] },
  // ── 腰带 · 6 条 · 资源与护体 ──
  // 玄阶每秒气血回复 +0.34 = 0.2 × 1.7。腰带是「资源位」，所以回复的第二条放在这里：层 5 入伤 0.5/s，龟息+周天 = 0.34+0.44 = 0.78/s 覆盖 156%。
  { id: 'affix-liferegen-02', name: '周天', stat: 'lifeRegen', op: 'flat', value: 0.17, perIlvl: 0.0051, tier: 'xuan', ilvl: 16, weight: 70, slots: ['belt'] },
  // 真元 +15。腰带是「资源位」：腰带 + 冠 = 真元总量，决定一场镇守战能放几次大招。
  { id: 'affix-mana-02', name: '纳灵', stat: 'mana', op: 'flat', value: 15, perIlvl: 0.45, tier: 'huang', ilvl: 1, weight: 70, slots: ['belt'] },
  // 每秒真元回复 +0.6（基础 2/s → 2.6/s，+30%）。不按 ×1.7 的直觉给 1.7 是因为基础值只有 2：一条 +85% 会让法系续航直接毕业。
  { id: 'affix-manaregen-01', name: '固元', stat: 'manaRegen', op: 'flat', value: 0.6, perIlvl: 0.018, tier: 'xuan', ilvl: 16, weight: 60, slots: ['belt'] },
  // 护体 +15%（对全部护体生效）。腰带没有基底护体，所以它放大了其他部位的护体，是「堆甲流」的乘算件。
  { id: 'affix-armor-04', name: '蓄力', stat: 'armor', op: 'increased', value: 0.15, perIlvl: 0.0045, tier: 'xuan', ilvl: 16, weight: 50, slots: ['belt'] },
  // 地阶气血 58 = 20 × 2.9。条骶位是气血大件（基底 56 @ 灵蕴 31），灵纹再加 58 → 单件贡献约 114 气血。
  { id: 'affix-life-04', name: '镇岳', stat: 'life', op: 'flat', value: 58, perIlvl: 1.74, tier: 'di', ilvl: 31, weight: 60, slots: ['belt'] },
  // 天阶真元回复 +30%。基础 2/s × (1+0.3) = 2.6/s；与「固元」的 flat 乘起来，是法系续航的 upper bound。
  { id: 'affix-manaregen-02', name: '归元', stat: 'manaRegen', op: 'increased', value: 0.3, perIlvl: 0.009, tier: 'tian', ilvl: 46, weight: 25, slots: ['belt'] },
  // ── 戒指 · 6 条 · 五行伤害与产出 ──
  // 火伤 +10%。戒指是「元素位」：三行元素各一条，玩家按自己的 BD 挑，挑错就得重洗。
  { id: 'affix-damage-10', name: '炽焰', stat: 'damage', op: 'increased', value: 0.1, perIlvl: 0.003, tier: 'huang', ilvl: 1, weight: 90, slots: ['ring'], tags: ['fire'] },
  // 水伤 +10%。玄水阁的对应词条。
  { id: 'affix-damage-11', name: '寒潭', stat: 'damage', op: 'increased', value: 0.1, perIlvl: 0.003, tier: 'huang', ilvl: 1, weight: 90, slots: ['ring'], tags: ['water'] },
  // 玄阶金伤 +17% = 10% × 1.7。锐金门毕业词条。
  { id: 'affix-damage-12', name: '锐金', stat: 'damage', op: 'increased', value: 0.17, perIlvl: 0.0051, tier: 'xuan', ilvl: 16, weight: 70, slots: ['ring'], tags: ['metal'] },
  // 仙缘 +20%（高品阶权重 ×(1+仙缘)）。5 条叠满 +100% → 宝品占比从 10% 抬到 ~15%，是「刷宝流」的乘区。
  { id: 'affix-lootRarity-01', name: '仙缘', stat: 'lootRarity', op: 'increased', value: 0.2, perIlvl: 0.006, tier: 'xuan', ilvl: 16, weight: 45, slots: ['ring'] },
  // 机缘 +29%（掉落次数 ×1.29）。比仙缘更「稳」：直接加掉落次数，很适合挂机流。
  { id: 'affix-lootQuantity-01', name: '机缘', stat: 'lootQuantity', op: 'increased', value: 0.29, perIlvl: 0.0087, tier: 'di', ilvl: 31, weight: 40, slots: ['ring'] },
  // 浊气亲和 +29%。本作招牌属性：浊气满了 +50% 伤害但也 -40% 回复，这条是把「越强越脏」的节奏加快一倍。
  { id: 'affix-turbid-01', name: '吞浊', stat: 'turbid', op: 'increased', value: 0.29, perIlvl: 0.0087, tier: 'tian', ilvl: 46, weight: 25, slots: ['ring'] },
  // ── 玉佩 · 6 条 · 神识与浊气 ──
  // 神识 +8。玉佩基底主属性就是神识（3~8），灵纹再叠 8 → 单件给到 +32 真元 +2.4% 破绽率。
  { id: 'affix-spirit-03', name: '洞玄', stat: 'spirit', op: 'flat', value: 8, perIlvl: 0.24, tier: 'huang', ilvl: 1, weight: 80, slots: ['pendant'] },
  // 结印速度 +5%。与护腕「疾印」同口径，法修可以从两处凑施速。
  { id: 'affix-castspd-02', name: '澄心', stat: 'castSpeed', op: 'increased', value: 0.05, perIlvl: 0.0015, tier: 'huang', ilvl: 1, weight: 70, slots: ['pendant'] },
  // 浊气亲和 +10% = 6% × 1.7 的玄阶档。浊气系统本身有上限（满 100 必爆），所以亲和只加快节奏、不破上限。
  { id: 'affix-turbid-02', name: '炼浊', stat: 'turbid', op: 'increased', value: 0.1, perIlvl: 0.003, tier: 'xuan', ilvl: 16, weight: 45, slots: ['pendant'] },
  // 破绽伤害 +0.20。和护腕「断念」同口径，凑「破绽流」需要两处以上。
  { id: 'affix-critmulti-02', name: '凝神', stat: 'critMulti', op: 'flat', value: 0.2, perIlvl: 0.006, tier: 'xuan', ilvl: 16, weight: 40, slots: ['pendant'] },
  // 地阶神识 23 = 8 × 2.9 → +46 真元 +3.45% 破绽率，地阶玉佩是法修的「毕业件」。
  { id: 'affix-spirit-04', name: '太乙', stat: 'spirit', op: 'flat', value: 23, perIlvl: 0.69, tier: 'di', ilvl: 31, weight: 55, slots: ['pendant'] },
  // 天阶浊气亲和 +29%。天阶只有此一条与浊气相关，配合戒指「吞浊」满配 +58% → 浊气循环从 25 分钟/轮压到 15 分钟。
  { id: 'affix-turbid-03', name: '泄浊', stat: 'turbid', op: 'increased', value: 0.29, perIlvl: 0.0087, tier: 'tian', ilvl: 46, weight: 22, slots: ['pendant'] },
];

/**
 * 按部位分组的便捷索引（UI 的「这件能洗出什么」列表用）。
 * 不参与掉落逻辑 —— 掉落一律走 affix-def.ts 的 affixCandidates（它带灵蕴门槛和阶位权重）。
 */
export const AFFIXES_BY_SLOT: Readonly<Record<string, readonly AffixDef[]>> = (() => {
  const slots = ['sword', 'relic', 'crown', 'robe', 'bracer', 'boots', 'belt', 'ring', 'pendant'];
  const out: Record<string, readonly AffixDef[]> = {};
  for (const slot of slots) {
    out[slot] = AFFIXES.filter((a) => a.slots === undefined || a.slots.includes(slot as never));
  }
  return out;
})();

/** 通用灵纹（不限定部位） */
export const UNIVERSAL_AFFIXES: readonly AffixDef[] = AFFIXES.filter((a) => a.slots === undefined);
