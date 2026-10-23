// 一次性：把 A1 事故记录追加进 docs/DECISIONS.md（跑完即弃）
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/docs/DECISIONS.md';
const c = fs.readFileSync(p, 'utf8').trimEnd();

const add = `
## 事故记录 A1 · session.ts 被整文件覆盖（2026-10-22 08:33）

- **现象**：\`src/core/session.ts\`（14.6KB）在 08:33:24 变成 88 字节的一句话，tsc exit 2、6 个测试文件红、两名 teammate 的工具链全部瘫痪。
- **根因**：我写的一次性补丁脚本 \`tools/patch-talent-auto.mjs\` 里，辅助函数定义成 \`function repl(old, neu, tag)\`（3 参），调用却写成 \`repl(c, old, neu, 'tag')\`（4 参）。于是 \`old === c\`（整个文件内容），\`c.replace(c, neu)\` 把全文替换成一小段片段。同类错误在 \`tools/patch-probe-save.mjs\` 已经犯过一次（那次只毁了 \`tools/\` 下的探针，代价低所以没当回事）。
- **为什么难恢复**：目录不是 git 仓库、没有备份、VS Code 历史里没有这个文件（一直是脚本改的，没在编辑器里打开过）、Vite 已重新 transform 过坏文件、系统 shadow copy 都早于文件创建时间。
- **恢复方式**：按三路证据重建（5 个 import session 的测试文件当可执行契约 + \`tools/\` 下 20 多个 patch 脚本里残留的 old/new 源码片段 + 全部调用点），重建后 352 测试全绿、探针 25/25 与 26/26 通过、时间线约 400min，与 412.8min 的定稿同量级。
- **代价**：约 40 分钟 + 两名 teammate 阻塞。侥幸没有丢功能（测试覆盖到的地方都在）。

### 由此定下的三条硬规则（所有改源码的脚本必须遵守）

1. **\`repl\` 统一签名 \`(old, neu, tag)\`**，第一参永远是被替换的源码片段，绝不允许把整个文件内容当第一参传进去。
2. **写盘前做形状断言**：结果长度 < 原文 × 0.9 直接 throw，不写盘。这次事故的新内容只有原文的 0.6%，一条断言就能拦住。
3. **写盘前留快照**：\`tools/_bak/<文件名>.<时间戳>\`，至少留最近一份。**没有备份的自动化改写等于没有 undo 键**。

### 顺带发现的一条可测性设计

浮字抖动用 \`s.rng.float()\` 会让「第几条随机数」整体错位，后续所有掉落序列都跟着变 —— 重建时实测某颗种子满级时长因此偏离 10%。**纯显示的东西不许消耗 RNG**（改成基于伤害值的确定性抖动）。这条对以后加任何特效都适用。

### 天赋自动分配带来的时间线偏移（待 BALANCE 重标）

重建后加了「自动点天赋」开关（\`SessionOptions.autoTalents\`，默认 true），实测满级时长从 412min 掉到 345~370min（−11%~−16%）。原因清楚：天赋总威力按 BALANCE 设计约 ×1.05，但**自动点是「每个点都花掉」而设计预算是「玩家可能只花一部分」**，实际吃满。处理：①交给 shuzhi 按「自动点」口径重标（推荐）②或把天赋数值整体下调到等效 ×1.02。**在这件事定案前，24h 时间线验收一律用 \`autoTalents:false\` 口径**。
`;

fs.writeFileSync(p, c + '\n' + add, 'utf8');
console.log('ok', (c + add).length, 'B');
