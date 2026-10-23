import fs from 'node:fs';

const path = 'F:/dsh-work/zhuoxian/docs/DECISIONS.md';
let raw = fs.readFileSync(path, 'utf8');
const before = raw.length;
const block = [
  '',
  '### D93.1 成就 20 条定稿：删 2 补 2（shuzhi v4.43）｜2026-10-23',
  '',
  '**问题**：D93 落的 20 条里 `floor-10` ≡ `clear-9`、`floor-28` ≡ `clear-27` —— 层数推进的唯一条件就是「清完上一层」，同一个事件发两次奖励，玩家会以为在追两个进度。',
  '',
  '**定稿（20 条 / 385 000 渊痕 ≈ 24.6 min ≈ 段④ 产出的 2.1%）**：',
  '- 删 `floor-10`（5k）、`floor-28`（30k）→ 18 条 / 355k；',
  '- 补 `codex-m-12`（图鉴浊物 12/15，锚 ~50min）15k、`xian-3`（身上 3 件仙品，`3×H(3)=5.5` 件 ÷ 4.1/h ≈ 80min）15k；',
  '- 保留 `floor-19` / `floor-46`（`clear-18` / `clear-45` 不在表里，不构成重复）；',
  '- `step-80` 保持 50k（满级 297.6min 严格晚于层 46 的 208min，奖励不能倒挂）；',
  '- `death-1` 保留 5k（安全前提是**成就一次性**；将来若做「死亡次数」多档，那条必须压到 0 —— 可重复的负向事件给钱一定被刷）。',
  '',
  '**档位规则改写**：档位 ≈ 该成就在 20 条梯子上的位置（前段 5k / 中段 15k / 后段 30k / 收尾 50k），不是「时间锚带宽」—— 按带宽切会把 50k 档清空（只有 3 条够格），那就不叫收尾奖励了。',
  '',
  '**验收**：`ACHIEVEMENT_DEFS.length === 20`、`ACHIEVEMENT_REWARD_TOTAL === 385000`（单测断言与表一致）；`tests/achievement.test.ts` 31 条全过；`probe-achievement.mjs` 20/20。',
].join('\n');

if (!raw.includes('\n')) throw new Error('DECISIONS.md 无换行');
if (raw.includes('### D93.1')) throw new Error('D93.1 已存在');
raw = raw.replace(/\s+$/, '') + '\n' + block + '\n';
if (raw.length - before < 400) throw new Error('追加量过小');
fs.writeFileSync(`F:/dsh-work/zhuoxian/tools/_bak/DECISIONS.md.${Date.now()}.bak`, fs.readFileSync(path));
fs.writeFileSync(path, raw);
console.log(`DECISIONS.md: ${before} -> ${raw.length}`);
