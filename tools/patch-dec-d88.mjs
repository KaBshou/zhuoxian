// 追加 D88（图鉴落地）：docs/DECISIONS.md 是纯追加，本脚本自带长度断言与快照。
import fs from 'node:fs';

const FILE = 'docs/DECISIONS.md';
const before = fs.readFileSync(FILE, 'utf8');

const block = [
  '',
  '### D88（图鉴：D87 的第一个「收集类」系统，24 行，只存 id）',
  '',
  '- **动机**：D87 记的账 —— 24h 目标还差 ~9h，且「段④ 只有装备收集」这一条撑不住长线。图鉴是第一个纯收集进度的系统：',
  '  它**不改战力**（不产生任何修正器），所以不触发 D64 棘轮刹车，也不影响 §2 的任何供给口径。',
  '- **数据量**：浊物 **15**（`ALL_MONSTERS` = 12 普通 + 3 镇守）+ 传奇 **9**（`LEGENDARY_DEFS`）= **24 行**。',
  '  三个总数常量（`CODEX_MONSTER_TOTAL` / `CODEX_LEGENDARY_TOTAL` / `CODEX_TOTAL`）**全部由数据表算出**，不许写死。',
  '- **三条纪律**（与新手引导同款）：',
  '  ① **只存 id**，不存名字/描述/计数 —— 名字和描述是数据表的事，存了就会有一天跟数据表不一致；',
  '  ② **读档必过 `sanitizeCodex`**：未知 id / 重复 id / 非字符串一律安静丢弃，且按数据表顺序归一（同一档在不同机器上 diff 稳定）；',
  '  ③ **顺序只由数据表决定**，不按解锁先后 —— 否则「第 3 行」在不同存档上指的不是同一只怪。',
  '- **收录触发**（两处，都在 `core/session.ts`）：击杀 → 收录浊物（`recordMonsterKill`）；拾取带 `legendary` 的法宝 → 收录传奇。',
  '  传奇判定用**掉落物本身**（`g.item.legendary`），不是重掷 —— 重掷会和掉落时的 rng 抽序打架。',
  '- **性能**：`recordMonsterKill` / `recordLegendary` 在「已收录」时**返回同一个对象引用**，击杀是热路径，不为一条旧记录复制数组。',
  '- **UI**：`K` 开/关（`Escape` 也关），`↑↓` 翻行；左列浊物、右列传奇，未收录显示「？」+「尚未遭遇 / 尚未获得」（不剧透）。',
  '  已收录浊物显示「`镇守 · `+`N 阶 · 五行 + 行 · 气血 ×… · 攻伐 ×… · 护体 …`」，五行名唯一来源是 `ELEMENT_TERM`（写死会拼出「metal行」）。',
  '- **验收**：`tests/codex.test.ts` **20 条**（含「灌 3 倍重复 id 仍 100%」「差一条不显 100%」「脏光标归 0 且不吃这次位移」）+ `tools/probe-codex.mjs` **17/17**；',
  '  全仓 **554 passed / 36 files**、`tsc 0`、`vite build 125.87 kB（gzip 41.82）`。',
  '- **两个探针坑（写进探针注释了）**：',
  '  ① **米白像素不能跟「关面板时」比** —— 面板把 HUD 一起盖掉，关面板时 HUD 的文字反而更多（实测 328 vs 276）；只能看绝对量，且新号 22/24 行故意是暗色，下限取 200。',
  '  ② **reload 后不许断言「恰好 = 注入条数」** —— 刷新后会话继续打，可能又收一只怪（首次实测 got=3）；要钉的是「注入的那两个 id 还在」。',
  '- **没做的事**：成就/《渊痕图录》不做；图鉴不加奖励（一旦给奖励就要进 §2 供给表，那是下一轮的事）。',
  '',
].join('\n');

const out = before + block;
if (!out.startsWith(before)) throw new Error('追加后前缀变了，说明不是纯追加');
if (out.length < before.length + 1200) throw new Error(`追加量可疑：${before.length} → ${out.length}`);
if ((out.match(/### D88（/g) ?? []).length !== 1) throw new Error('D88 标题不唯一');

if (!fs.existsSync('tools/_bak')) fs.mkdirSync('tools/_bak', { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
fs.writeFileSync(`tools/_bak/DECISIONS.md.${stamp}.bak`, before, 'utf8');

fs.writeFileSync(FILE, out, 'utf8');
console.log(`patched ${FILE}: ${before.length} → ${out.length} chars`);
