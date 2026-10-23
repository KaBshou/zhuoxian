// 追加 D55 到 docs/DECISIONS.md（P0 打造改背包件 + 段② 判据 C 落地）
// 纪律：写盘前长度断言 + 快照（见 DECISIONS「事故记录 A1」）
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const FILE = path.join(ROOT, 'docs/DECISIONS.md');
const before = fs.readFileSync(FILE, 'utf8');

const add = `
### D55 打造只作用于背包件（P0）+ 段② 门禁换成判据 C（2026-10-22）
- **问题**：段② 成型档修完 D52/D54 后仍 1/3，且 gearTrail 出现「宝品以上 210min 10/10 → 390min 5/10」的**回落**。
- **根因（shuzhi 用对照实验钉死）**：同 3 种子、同掉落，唯一差别是压掉打造（\`s.craftTimer=0\`）：
  | 组 | 归一化 ≥0.7 后退出次数 | 全 ≥2 纹退出次数 | 终态最差部位归一化 |
  |---|---:|---:|---:|
  | 含打造 | **11 / 6 / 9** | **35 / 14 / 41** | **0.39** |
  | 压制造 | **0 / 0 / 0** | **0 / 0 / 0** | 1.10 |
  ⇒ 换装（D52 后同部位比 itemPower）本身单调、退出 0 次；**是打造在削弱玩家**：
  \`craftReroll\`（全重掷，4 条能洗成 1 好 3 垃圾）与 \`craftRemoveAffix\` 都作用在**已穿装备**上。
  实测同一颗种子的戒指被洗到「同部位宝品中位的 39%」。这是 D54「条数守住、数值没守住」的第二个面。
- **修法（\`src/core/crafting.ts\`）**：
  1. \`craftReroll\` 目标加 \`!isWorn(ch, t)\` —— **只洗背包件**；
  2. \`craftRemoveAffix\` 同上 —— **只灭背包件**；
  3. \`runCraftPlan\` 顺序由「洗 → 灭 → 添」改成 **「灭 → 添 → 洗」**：灭是为了腾位、添是填位，两步必须相邻；
     洗排最后，且只碰背包件。
- **段② 门禁换判据 C**（shuzhi v4.27 定稿）：\`每部位 itemPower ≥ 该部位「同灵蕴宝品 itemPower 中位」×1.0\`。
  为什么不能用品阶：\`itemPower\` 的部位量纲差 **7.4 倍**（戒指 p50 21.9 vs 玉佩 161.8）⇒ 全局阈值必错；
  而品阶不是战力的单调代理（31.7% 的灵品强过宝品中位）⇒ 按品阶判必然震荡。**判据必须建在单调量上**（教训第二十二次）。
- **落地**：\`tools/gen-slot-base.mjs\` 离线生成 \`tools/slot-power-base.json\`（24 档灵蕴 × 9 部位，每格 200 件宝品取中位，
  固定种子可复现；改动 \`bases.ts\`/\`affixes.ts\`/\`itemPower\`/\`loot\` 权重后必须重跑）；
  \`tools/session-runner.mjs\` 加 \`slotBasePower(slot, ilvl)\` 插值 + 判据 \`formedPowerAt\`/\`minPowerRatio\`（每模拟秒最多算一次）；
  \`tools/run-timeline.mjs\` 注入 \`inventoryMod\`、门禁 \`FORMED_TARGET=290 / FORMED_MAX=420\`。
- **实测（3 种子 900min \`--post-cap\`，判据 C 修后）**：成型 **299.3min 中位（+3.2%，3/3 达成）→ 通过**；
  满级 **387.6min 中位**（上一轮 419.5，−7.6% —— 打造不再削弱玩家的直接收益）；
  出货 2.54/分、法宝 1.04/分、三阶占比 77.7%、死亡 0/0/0。
- **测试**：\`tests/equip-craft.test.ts\` 13 条（新增「已穿件即使满条也绝不被动」「背包满条件才被灭」
  「洗灵石不洗已穿件」「\`runCraftPlan\` 一轮后已穿件 uid/灵纹/战力都不下降」）；
  \`tsc 0\` / \`vitest 455 passed / 32 files\`。
- **待 shuzhi 复核**：满级 387.6 对原目标 406 是 −4.5%（±15% 内），但段② 目标 290 与段④ 下界是否要跟着动，
  由她按新口径重标。
`;

const next = before.trimEnd() + '\n' + add + '\n';
if (next.length < before.length * 1.02) {
  throw new Error(`写盘前长度断言失败：${before.length} -> ${next.length}`);
}
fs.mkdirSync(path.join(ROOT, 'tools/_bak'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'tools/_bak/DECISIONS.md.bak-d55'), before);
fs.writeFileSync(FILE, next);
console.log(`ok: ${before.length} -> ${next.length} bytes`);
