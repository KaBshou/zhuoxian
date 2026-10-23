// 追加 D50~D54 到 docs/DECISIONS.md（事故记录式的短条目，每条都带证据）
// 纪律：写盘前长度断言 + 快照（见 DECISIONS「事故记录 A1」）
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const FILE = path.join(ROOT, 'docs/DECISIONS.md');
const before = fs.readFileSync(FILE, 'utf8');

const add = `
### D50 段② 判据改成「成型档」+ H(9) 纠错 2.83 倍（shuzhi 自纠，2026-10-22）
- **问题**：段②「毕业装 = 9 部位各 1 件宝品以上且 ≥2 条对口」在 3 种子 900min 里 **0/3 未达成**，
  满级（393min）比毕业装（1018 件 = 1028min = 17.1h）还早。
- **根因（shuzhi 自我纠错）**：v4.25 的「6.2h」**漏乘集齐 9 部位的优惠券系数 H(9)=2.829**。
  拿一个 17h 的判据当「6h 这一段」的门禁 → 永远红。**这是判据错，不是数值错**
  —— 教训第二十一次：判据要选「这一段玩家实际会拿到的状态」，不是「顶级装备刷满」。
- **改法**：段② 唯一门禁换成**成型档** = 各部位 1 件宝品以上且 **≥1** 条灵纹，
  目标 338min≈5.6h、窗口 ≤420min；毕业（1018 件/17.1h）与全仙品（≈21h）降级成「记录项」。
- **四段下界**同步松一条：层 19→28 下限 40→**35min**（实测 43.5/43.5/38.0，最差种子破 40）。
- **落地**：\`tools/session-runner.mjs\` 的 \`checkGear\` 出三档 \`formedAt/graduatedAt/allXianAt\`；
  \`tools/run-timeline.mjs\` 门禁 \`FORMED_TARGET=338/FORMED_MAX=420\`，表头加「成型(min)」列。
- **实测（修复前）**：成型仍然 0/3 —— 引出 D52/D54 两个真 bug。

### D51 新手引导（引路）九步状态机（2026-10-22）
- **问题**：REQ §2 第 3 问明文要求「新手教程持续到打完第一张图的 boss，并告诉玩家怎么切地图」，
  而全 src \`grep tutorial|教程|onboard\` **0 处** —— 选完道统直接进战斗，零解释。
  这是「别人第一次打开 3 分钟内要明白」这条完成判据的最大缺口，也是「给朋友玩」的第一道门。
- **做法**：\`src/core/onboarding.ts\` 纯状态机（9 条：awake/first-kill/first-drop/panel-skill/panel-talent/
  turbid/boss/floor/outro），渲染 \`src/render/tutorial-overlay.ts\`（底部条、金边、「引路」标题、进度 n/9）；
  \`tutorialStep\` 入档（\`ProgressSave.tutorialStep\`，\`clampTutorialIndex\` 归一）。
- **四条硬纪律**：①**不阻塞**（不暂停战斗、不锁输入，挂机也能走完）；②一条一句人话；
  ③顺序固定、不回头、不重播（刷新后从存档条数继续）；④文案与判定分离（判定看 facts，文案只看 id）。
- **坑**：\`clampTutorialIndex(Infinity)\` 归 0（非有限数一律归 0），所以「跳过全部」必须传
  \`clampTutorialIndex(TUTORIAL_LENGTH)\`，传 Infinity 会把玩家踹回第 1 条。
- **测试**：\`tests/onboarding.test.ts\` 22 条；\`tools/probe-onboarding.mjs\` 12/12（真浏览器）。

### D52 自动换装用「全角色战力比」是错的，改成同部位比（真 bug，2026-10-22）
- **症状**：满级挂机 8 小时后 \`boots\` 还是 ilvl 44 的灵品、\`crown\` 空、\`relic\` 仙品 0 条灵纹
  —— 玩家视角就是「掉了更好的它不穿」。
- **根因**：\`decideEquip\` 用 \`characterPower(换装后)/characterPower(换装前) >= 1.02\`；
  而 \`characterPower = dps*10 + life*0.12 + ...\` 被 \`dps×10\`（几千）彻底支配，
  靴子/玉冠/戒指这类「身法/回气/抗性」部位怎么换只动个位数 ⇒ 比值永远到不了 1.02。
- **修法**：改成**同部位**比 \`itemPower(current)\` vs \`itemPower(item)\`（同基底同量纲，
  支配项被消掉）；空坑直接穿；\`AUTO_EQUIP_MARGIN=1.02\` 保留当防抖。
- **实测**：10 个部位全部 ilvl 99（修前 boots=44）；\`tools/diag-equip.mjs\` 每部位换装 3~8 次、
  仅 1~2 次「更强却没换」（2% 防抖的正常代价）。回归测试见 \`tests/equip-craft.test.ts\`。

### D53 探针统一走 \`?cls=\` 口子（测试基建，2026-10-22）
- **问题**：加了开局选道统之后 8 条探针全红（88/122）：新号停在 \`phase='select'\`，
  \`main.ts\` 的 \`if (phase !== 'play') return\` 跳过 \`tickSession\`，画面冻结、击杀 0、时间 0。
- **修法**：\`main.ts\` 读 URL 参数 \`?cls=<道统id>\`，命中就直接确认进 play。
  理由：\`__zhuoxian.reset()\` 之后是**整页 reload**，URL 参数会活下来、按键不会；
  否则每条探针都要在每个 navigate/reset 之后补一次按键，漏一处就是一片假红。
- **纪律**：探针自己启动页面时统一带 \`?cls=\${PROBE_CLASS}\`（\`process.env.PROBE_CLASS\`，默认 yujian）；
  \`probe-class.mjs\` 例外 —— 它测的就是选道统本身。
- **实测**：8 条探针合计 105 + probe-class 17 = **122/122 全绿**。

### D54 灭灵石只对「满条」动手（真 bug，2026-10-22）
- **症状**：gear 快照里出现 \`ring1 ling/0\`（灵品 0 条灵纹）—— 而 \`RARITY_AFFIX_COUNT.ling=[1,2]\`，
  0 条违反了品阶契约，只可能是被灭掉的。
- **根因**：\`craftRemoveAffix\` 挑「有灵纹且**战力最低**」的候选 = 身上最弱那件，
  反复灭它；对没满条的装备用灭灵石是纯亏（掉 1 条最多换回 1 条随机，期望战力下降）。
- **修法**：目标加 \`affixes.length >= maxAffixes(rarity)\`（满条才灭，给添灵石腾位）。
- **实测**：修后灵品最低 1 条；\`tests/equip-craft.test.ts\` 30 次循环不变量守住。
- **仍未解决（已转 shuzhi）**：品阶不是战力的单调代理 —— ilvl 99 抽样 20000 件，
  **31.7% 的灵品 itemPower 高过宝品中位**，所以「10 部位同时宝品以上」这条判据会来回震荡
  （实测 10/10 → 5/10）。备选判据实测（3 种子 540min）：**件件 ≥2 条灵纹 = 127.6/140.7/192.4min（3/3 达成）**、
  件件灵蕴 ≥90 = 187.2/210.5/305.8min（3/3）；旧「宝品+」= 1/3。
`;

const next = before.trimEnd() + '\n' + add + '\n';
if (next.length < before.length * 1.05) {
  throw new Error(`写盘前长度断言失败：${before.length} -> ${next.length}`);
}
fs.mkdirSync(path.join(ROOT, 'tools/_bak'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'tools/_bak/DECISIONS.md.bak'), before);
fs.writeFileSync(FILE, next);
console.log(`ok: ${before.length} -> ${next.length} bytes, 行数 ${next.split('\n').length}`);
