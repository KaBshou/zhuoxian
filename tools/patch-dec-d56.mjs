// 追加 D56 到 docs/DECISIONS.md（满级目标窗口验收 + 段④ 度量改产出 + run-timeline 硬断言）
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const FILE = path.join(ROOT, 'docs/DECISIONS.md');
const before = fs.readFileSync(FILE, 'utf8');

const lines = [
  '',
  '### D56 满级目标保持 406（改窗口）+ 段④ 度量改「产出」+ run-timeline 加硬断言（2026-10-22）',
  '- **满级 387.6min 对 406 是 −4.5%：不动 BREAKTHROUGH_XP**，验收改成窗口 **[345, 467] min**（406±15%）。',
  '  三条理由（shuzhi 复核）：① 4.5% **小于本项目自己的种子噪声**（实测散布 9~15%：380.9/388.5/414.6 差 8.9%，v4.26 三个种子差 30%），',
  '  为 18min 改数组 = 对着噪声调参（第二十二次教训）；② 这 18min 是「打造不再削弱玩家」的正常回报，不该让玩家为我们的 bug 付时间；',
  '  ③ 要收回难度，唯一诚实的杠杆是把渊痕产出接满，**抬修为门槛等于用玩家的时间掩盖内容缺口**。',
  '- **判据 C 常量 290 / 420 不动**：299.3 差 9.3min，而种子散布 43min（286.3~329.7）。段②→段④ 有 88min 重叠区（刷修为 + 继续刷装备），',
  '  符合「一条时间轴、多个进度条」。',
  '- **「满级后段时长」是假指标**：段④ 系统里没有「长度」（满级后修为丢弃、xpForStep(80)=Infinity、层 46 封顶），',
  '  这个数必然等于「窗口 − 满级」，跑多久涨多久。**段④ 改度量产出**（BALANCE §6.2 / D57）：',
  '  层 21 仙品率 2.04%（3h 3.8 件）、层 46 仙品率 3.85%（3h 7.2 件）；9 件全仙品需 25.46 件 ⇒ 3h 只走 7%~15%，**段④ 是长线收集**。',
  '  工具侧 run-timeline 那句已改名「**窗口剩余（非设计量，仅记录）**」，主指标是「渊痕产出/分」（实测中位 10804/分）。',
  '- **tools/run-timeline.mjs 两条硬断言**（tools/patch-timeline-assert.mjs）：',
  '  1. **formedAt <= maxedAt** —— 成型必须早于满级。若 loot 权重重标导致「满级后才成型」，段② 整套判据就失去意义，',
  '     这是结构性错误，不许靠人眼看两条时间线（违规打印 ❌ 结构性错误 并让门禁红）；',
  '  2. **硬门禁不过 → process.exitCode = 1** —— 红要能在一行命令里看见，不能只打一行字。',
  '- **坑**：tools/run-timeline.mjs 是 **CRLF** 文件，补丁脚本先用 LF 匹配再写回 CRLF，否则 anchor 全部 MISS。',
];

const next = before.trimEnd() + '\n' + lines.join('\n') + '\n';
if (next.length < before.length * 1.01) throw new Error(`长度断言失败 ${before.length} -> ${next.length}`);
fs.mkdirSync(path.join(ROOT, 'tools/_bak'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'tools/_bak/DECISIONS.md.bak-d56'), before);
fs.writeFileSync(FILE, next);
console.log(`ok: ${before.length} -> ${next.length}`);
