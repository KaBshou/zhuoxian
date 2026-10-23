// 一次性：D48（闸前移落地）+ D49（开局选道统补齐 D1）追加进 docs/DECISIONS.md
import fs from 'node:fs';

const P = 'F:/dsh-work/zhuoxian/docs/DECISIONS.md';
let c = fs.readFileSync(P, 'utf8');
const before = c.length;

const LINES = [
  '',
  '### D48 掉落闸前移已落地（D46.1 的修法，2026-10-22）',
  '- **改法**：`drop.ts` 新增 `rollDropGate(rng, rarity)`（按 `DROP_CHANCE` 掷一次）；',
  '  `session.ts` 的击杀三分类外面套这层闸，法宝支传 `alreadyGated=true` 不再掷第二次；',
  '  `offline.ts` 同步（闭关产出必须与在线同口径，否则「挂机更划算」）。',
  '- **实测（3 种子 `run-timeline --seeds=3`）**：满级 **393.3min（−3.1%，通过）**、',
  '  **出货总数 2.44/分**（设计 2.34）、**法宝 0.93/分**（设计 0.97，扫 `s.ground` 真实落地物）、',
  '  三阶占比 **71.7%**（闸前移前 77.1%，因通货/玉简变少、物件流变稀而下降，只记录）。',
  '- **`craft-econ` 通过**：黄阶灵石 98.6%（目标 85%）、灭灵石 100%、洗灵石 100%，池底 0~1。',
  '  闸前移后「通货超发 3.57 倍」消失，段② 的打造吞吐随之下降 —— 这正是 D46.1 预测的代价。',
  '- **新出现的问题（转交 shuzhi 重标）**：段②「毕业装 = 395min≈6.6h」在 3/3 种子**满级前都没达成**',
  '  （满级 393.3min 比它更早）。两个方向：①把段② 判据放宽到「成型（37min 档）」；',
  '  ②承认段② 跨越满级继续跑（装备成型本来就该跨境界）。等 shuzhi 给数后再定，不先改代码。',
  '- **回归**：新增 `tests/drop-gate.test.ts` 6 条（28% 抽样 / 镇守必出 / 同种子可复现 /',
  '  `alreadyGated` 不再掷闸 / 默认仍按 28% / 表外品阶安静判否）；`tests/offline-save.test.ts` 的',
  '  「物件数、通货/法宝比例」断言按新口径重写（旧断言写的是「每杀都分流」的错口径）。',
  '',
  '### D49 开局选道统（补齐 D1 的「6 职业选一个」，2026-10-22）',
  '- **问题**：`main.ts` 一直写死 `createSession({ classId: \'yujian\' })`，',
  '  `data/classes.ts` 里另外 5 个道统（yushou/fenyin/xuanshui/houtu/ruijin）**在玩家眼里不存在** ——',
  '  这是「系统做了但玩家看不见」的典型，和面板类问题同一类。',
  '- **做法**：新建 `src/render/class-select.ts`（`classCardRects` 布局 / `moveClassIndex` 回绕 /',
  '  `indexFromDigit` 数字键）；`BattleRenderer.renderClassSelect()` 负责画（入口层不许自己持 ctx）；',
  '  `main.ts` 加 `phase: select | play` 状态机：方向键/数字键选、Enter 确认、选完落盘进 play。',
  '- **两条硬纪律**：①**选道统期间绝不写盘**（否则会把临时 yujian 空档写进新档，玩家下次打开就「已经被选过了」）；',
  '  ②卡片坐标只在 `classCardRects` 算一次，渲染与选中用同一份（不许渲染器另写一套）。',
  '- **测试**：`tests/class-select.test.ts` 7 条（6 张不重叠 / 顺序与 CLASSES 一致 / 三种画布尺寸不出界 /',
  '  左右上下回绕 / 非法下标归一 / 数字键映射）；**布局测试抓出真 bug**：800 宽视口下卡片跑到 x=−42（画到屏幕外），',
  '  已改成按视口宽度反算列宽并夹在 [200, 280]。',
  '- **探针 `tools/probe-class.mjs` 17/17**：新号进 select / 6 名候选 / 默认高亮第 1 张 / 暗遮罩 + 金色高亮 + 米白文字 /',
  '  → 移动 / Digit4 直选 / ↓ 跨行回绕 / Enter 进 play / 道统真的生效 / 开好第一波 / 刷新不再问且道统还在。',
  '',
].join('\n');

if (!c.includes('### D47 ')) throw new Error('MISS: D47 锚点');
if (c.includes('### D48 ')) {
  console.log('SKIP: D48 已存在');
} else {
  c = c.trimEnd() + '\n' + LINES;
  if (c.length < before * 0.95) throw new Error('结果比原文短，拒绝写盘');
  fs.writeFileSync(P, c, 'utf8');
  console.log('written', before, '->', c.length);
}
