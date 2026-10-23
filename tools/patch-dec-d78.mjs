// 追加 D78：两个「死属性」（castSpeed / 玉简破绽率）+ 神通冷却不吃速度
//
// 纪律（A1 事故之后）：
//   1. 写盘前先做「锚点存在」断言 + 「目标不存在」断言（防重复追加）
//   2. 写盘前留 tools/_bak/ 快照
//   3. 替换文本一律用行数组 join('\n')，不写嵌套反引号模板（.mjs 里反引号嵌套会直接 SyntaxError）
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const DOC = join(ROOT, 'docs', 'DECISIONS.md');
const BAK_DIR = join(ROOT, 'tools', '_bak');

const raw = readFileSync(DOC, 'utf8');
const before = raw.length;

const ANCHOR = '### D76';
if (!raw.includes(ANCHOR)) throw new Error('MISS anchor: 找不到 D76，先确认文档结构没变');
if (raw.includes('### D78')) throw new Error('SKIP: D78 已存在，不要重复追加');

const lines = [
  '',
  '### D78（死属性二例：`castSpeed` 与玉简破绽率 · 神通冷却不吃速度）',
  '',
  '- **问题（真 bug，三处同一类）**：',
  '  1. `castSpeed` 从来没被战斗读过 —— `playerBattleFromCharacter` 不传、`skillCooldown` 不存在，',
  '     神通冷却一直写死 `skill.cooldown`。受影响：急切玉简 +25%、凝神/印成两点天赋，**全是死属性**（面板说「结印更快」，实战一点不变）。',
  '  2. `贯头`（`critChance flat +6pp`）是死属性 —— `skillStrike` 用 `rng.chance(p.critChance)`，',
  '     而 `p.critChance` 是角色面板的**已解析值**，不含玉简。',
  '  3. 更根本：`attackSpeed` 只作用于普攻，**attack 类神通的冷却也不吃它** —— 猛攻玉简同样只对普攻有效。',
  '- **修法（单一出口，不许第二套算法）**：',
  '  - 新增 `export function skillCooldown(baseCooldown, skill, p, gemMods)`：`面板冷却 ÷ (面板速度 × (1 + 玉简速度 increased))`；',
  '    attack 类走 `attackSpeed`、spell 类走 `castSpeed`（`speedStatOf(skill)` 一处判定）。',
  '  - `PlayerBattle` 增加 `castSpeed`（`createPlayerBattle` 夹 `≥0.1`，`playerBattleFromCharacter` 传 `s.castSpeed`）。',
  '  - 破绽改成 `Math.min(1, applyAggregate(p.critChance, aggregate(gemMods, \'critChance\')))`，走统一聚合。',
  '- **为什么这不是「调参」而是「修 bug」**：BALANCE §15.7 的组合穷举（最优 2.429×）里那个 ×1.25 速度通道，',
  '  以前是**装了不生效**的 —— 战斗一直弱于模型。修完战斗才第一次达到模型假设的水平，所以基线该重标，',
  '  不该反过来把 bug 当难度保留（否则「面板数字」与「实战数字」永远差 25%）。',
  '- **实测（6 种子 900min `--post-cap --talents=off`）**：满级 min 265.0 / 中位 **297.6（−9.8% vs 330）** / max 314.6；',
  '  副红线最差 265.0 < 290 → **红**；段② 判据 C4 中位 **183.5（−10.5%）**、6/6；段② 相对线最差 **89.0% > 85% → 红**；',
  '  九境量级通过；死亡 0/0/0/0/0/0。',
  '- **待 shuzhi 定**（本决策只记录修法与实测，不含新常量）：满级目标 330→300？窗口/副红线？',
  '  `FORMED_RATIO 0.62` 是否保持（0.62×300=186 vs 实测 183.5）？段② 相对红线 0.85 是否放到 0.90 或改中位比值？',
  '  基表 `tools/slot-power-base.json` 是否重跑（分母建立在旧战斗上）。',
  '- **验收基建**：`tests/gem-power.test.ts` **24 条**（四条通道 ×1.00/×1.25/×1.30/×1.69/×1.15/×1.35、',
  '  续航不再冒充通道、自动装配是上限参照、`playerBattleFromCharacter` 必须传 castSpeed、`skillCooldown` 吃面板速度与玉简速度、',
  '  attack/spell 各走各的速度通道、冷却 0 不参与换算）；`tsc 0` / `vitest 531 passed / 35 files`。',
  '- **坑（写下来）**：`aggregate(mods, \'damage\')` 不传第三个标签参数时，元素玉简（`tags: [\'metal\'|\'fire\'|\'water\']`）',
  '  会被**全部过滤掉** —— 面板第一版把 1.69 显示成 1.00。凡是「按标签限定」的修正器，聚合时必须传本次伤害实例的 tags。',
  '- **坑**：`applyGemLoadout` 是**原地改、返回 void**；写成 `const ch = applyGemLoadout(...)` 会拿到 `undefined`，',
  '  报错会出现在很远的地方（`characterGemLoadout` 读 `ch.gemLoadouts`）。',
  '',
];

const next = lines.join('\n');
const out = raw + next;
if (out.length < before) throw new Error('LENGTH SANITY: 追加后反而变短，拒绝写盘');

mkdirSync(BAK_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
copyFileSync(DOC, join(BAK_DIR, `DECISIONS.md.${stamp}.bak`));
writeFileSync(DOC, out, 'utf8');
console.log(`D78 追加完成：${before} → ${out.length} chars（+${out.length - before}）`);
