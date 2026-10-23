#!/usr/bin/env node
/**
 * 死属性审计（audit-stats.mjs）
 *
 * 背景：已经靠「撞运气」抓到三处假属性 —— `castSpeed`（战斗从不读）、
 * 贯头玉简的 `critChance`（被面板已解析值掩盖）、`xpGain`（`gainXp` 从不读属性）。
 * 三处都是「面板上有数字、公式里有词缀、战斗里没人读」。这类 bug 不会报错、
 * 不会让测试红、只在玩家觉得「升了装备没变化」时才被发现。
 *
 * 所以做一次穷举：对 `src/data/stats.ts` 的每个 StatKey，扫全 `src/`，
 * 看它**是否出现在战斗/角色/掉落/离线的真实计算链里**（不是只在类型、词缀表、
 * 面板文案里出现）。
 *
 * 判定口径（保守，宁可误报）：
 *   - `defOnly`：只出现在定义处（stats.ts / affix 数据 / 面板显示），没有任何消费点
 *   - `read`：被读到（`x.stat` / `.get(key)` / `'stat'` 出现在聚合或公式里）
 *   - 输出三类：DEAD（零消费）/ DISPLAY-ONLY（只被面板读）/ OK（出现在 core/ 里）
 *
 * 用法：node tools/audit-stats.mjs [--json]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = 'src';
const CORE = join('src', 'core');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p.replaceAll('\\', '/'));
  }
  return out;
}

const files = walk(SRC);
const texts = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));

// 1) 取 StatKey 列表（从 stats.ts 的 STAT_META 键名或联合类型解析）
const statsSrc = texts.get('src/data/stats.ts') ?? '';
// 不要用「正则截块」—— STAT_META 的注释里也有 `}` 和 `{`，截出来只有 367 字符（踩过）。
// 改用「行区间 + `key: 'x'`」：每条元数据都自带 `key: '...'`，这是唯一权威枚举。
const startAt = statsSrc.indexOf('export const STAT_META');
const endAt = statsSrc.indexOf('ALL_STAT_KEYS');
if (startAt < 0 || endAt < 0 || endAt <= startAt) throw new Error('stats.ts 结构变了：找不到 STAT_META / ALL_STAT_KEYS 区间');
const metaBlock = statsSrc.slice(startAt, endAt);
const keys = [...new Set([...metaBlock.matchAll(/key:\s*'([a-zA-Z][a-zA-Z0-9]*)'/g)].map((m) => m[1]))];
if (keys.length === 0) throw new Error('解析不到 STAT_META 的键名，先确认 src/data/stats.ts 结构没变');

// 2) 定义/展示类文件（出现不算「消费」）
const DEF_FILES = new Set([
  'src/data/stats.ts',
  'src/data/affixes.ts',
  'src/data/bases.ts',
  'src/data/legendary.ts',
  'src/data/support-gems.ts',
  'src/data/talents.ts',
  'src/data/talent-def.ts',
  'src/data/marks.ts',
]);
const DISPLAY_FILES = new Set([
  'src/render/hud-panels.ts',
  'src/render/detail-panels.ts',
  'src/render/skill-panel.ts',
  'src/render/talent-panel.ts',
  'src/render/battle-renderer.ts',
  'src/render/class-select.ts',
  'src/render/tutorial-overlay.ts',
  'src/data/glossary.ts',
]);

const rows = [];
for (const key of keys) {
  const hits = { core: [], data: [], display: [], def: [], other: [] };
  const re = new RegExp("(['\\\"]" + key + "['\\\"]|\\." + key + "\\b|\\b" + key + "\\b)");
  for (const [f, t] of texts) {
    if (!re.test(t)) continue;
    if (DEF_FILES.has(f)) hits.def.push(f);
    else if (DISPLAY_FILES.has(f)) hits.display.push(f);
    else if (f.startsWith(CORE + '/')) hits.core.push(f);
    else if (f.startsWith('src/data/')) hits.data.push(f);
    else hits.other.push(f);
  }
  const consumers = hits.core.length + hits.data.length + hits.other.length;
  const verdict = consumers === 0 ? (hits.display.length ? 'DISPLAY-ONLY' : 'DEAD') : 'OK';
  rows.push({ key, verdict, core: hits.core, data: hits.data, other: hits.other, display: hits.display });
}

// 3) 「真读」证据：只看**会改变游戏行为**的消费者，排除两类「假消费」
//    - `src/core/inventory.ts` 的 `itemPower` 权重表：它给每件装备的每条属性一个权重，
//      但属性本身没被战斗读时，这个权重只是「战力数字变大」—— 这正是 `xpGain` 的历史陷阱。
//    - `src/data/*` 的定义/展示。
const FAKE_CONSUMERS = new Set(['src/core/inventory.ts', 'src/core/item.ts', 'src/core/save.ts', 'src/core/save-bridge.ts']);
const CONSUMERS = new Set([
  'src/core/battle.ts',
  'src/core/damage.ts',
  'src/core/character.ts',
  'src/core/session.ts',
  'src/core/drop.ts',
  'src/core/offline.ts',
  'src/core/crafting.ts',
  'src/core/talents-runtime.ts',
  'src/core/marks-runtime.ts',
  'src/core/gem-power.ts',
  'src/core/skills-runtime.ts',
  'src/core/gem-edit.ts',
  'src/core/loot.ts',
  'src/core/onboarding.ts',
]);

const evidence = [];
for (const key of keys) {
  const re = new RegExp("(['\\\"]" + key + "['\\\"]|\\b" + key + "\\b)");
  const lines = [];
  for (const [f, t] of texts) {
    if (!CONSUMERS.has(f)) continue;
    for (const ln of t.split(/\r?\n/)) {
      if (re.test(ln)) lines.push(f.split('/').pop() + ': ' + ln.trim().slice(0, 110));
    }
  }
  evidence.push({ key, lines });
}

// 4) 额外：直接把 `characterStats` 产出的每个 stat 搜一遍「谁在用」
const statFn = texts.get('src/core/character.ts') ?? '';
if (!/export function characterStats/.test(statFn)) {
  console.log('! 警告：没找到 characterStats，统计口径可能过时');
}

const byVerdict = { DEAD: [], 'DISPLAY-ONLY': [], OK: [] };
for (const r of rows) byVerdict[r.verdict].push(r);

console.log('# 死属性审计 · ' + rows.length + ' 个 StatKey · ' + files.length + ' 个 src 文件');
console.log('');
for (const v of ['DEAD', 'DISPLAY-ONLY', 'OK']) {
  const list = byVerdict[v];
  console.log('## ' + v + '（' + list.length + '）');
  for (const r of list) {
    const where = [r.core.length ? 'core:' + r.core.map((x) => x.split('/').pop()).join(',') : '', r.data.length ? 'data:' + r.data.map((x) => x.split('/').pop()).join(',') : '', r.other.length ? 'other:' + r.other.map((x) => x.split('/').pop()).join(',') : '']
      .filter(Boolean)
      .join(' | ');
    console.log('  - ' + r.key + (where ? '  ← ' + where : r.display.length ? '  ← 只被面板读：' + r.display.map((x) => x.split('/').pop()).join(',') : ''));
  }
  console.log('');
}

// 5) 证据区：每个 stat 在「真消费者」里的实际行（人眼判读用）
const sus = evidence.filter((e) => e.lines.length === 0);
const weak = evidence.filter((e) => e.lines.length > 0 && e.lines.length <= 2);
console.log('## 证据不足（真消费者里 0 行命中，只有 itemPower/面板在用）→ ' + sus.length + ' 个');
for (const e of sus) console.log('  - ' + e.key);
console.log('');
console.log('## 证据很弱（真消费者里 1~2 行）→ ' + weak.length + ' 个');
for (const e of weak) {
  console.log('  - ' + e.key);
  for (const ln of e.lines) console.log('      ' + ln);
}
console.log('');
console.log('## 全量证据（--lines 时打印）');
if (process.argv.includes('--lines')) {
  for (const e of evidence) {
    console.log('### ' + e.key + '（' + e.lines.length + ' 行）');
    for (const ln of e.lines.slice(0, 8)) console.log('  ' + ln);
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ total: rows.length, rows, evidence }, null, 2));
}
process.exitCode = byVerdict.DEAD.length + sus.length > 0 ? 1 : 0;
