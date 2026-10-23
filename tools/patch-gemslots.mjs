/**
 * 玉简槽位 4 —— 用「装配制」替换「解锁即全开」。
 *
 * shuzhi 实测依据（2026-10-22）：12 条玉简全开给神通 2.50×，最优 4 条 = 2.43×
 * （保住 97.2% 战力）。12 选 4 = 495 种组合，这是第一版最有味道的 build 决策。
 *
 * 改动：
 *   support-gems.ts  + GEM_SLOTS = 4
 *   character.ts     + CharacterState.gemLoadout?: string[]（装配的玉简 id，≤4）
 *                    + characterGemLoadout(ch)：合法装配表（解锁过滤 + 截断 + 去重）
 *   skills-runtime.ts skillModifiers 改吃装配表
 *
 * 一次性补丁脚本，跑完即弃。
 */
import fs from 'node:fs';

function edit(p, old, neu, tag) {
  let c = fs.readFileSync(p, 'utf8');
  if (!c.includes(old)) { console.error('MISS ' + tag); process.exit(1); }
  c = c.split(old).join(neu);
  fs.writeFileSync(p, c, 'utf8');
  console.log('OK ' + tag);
}

// 1) support-gems.ts：槽位常量
edit('F:/dsh-work/zhuoxian/src/data/support-gems.ts',
  "import type { Tag } from './tags';",
  "/** 装配槽位上限（12 选 4 = 495 种组合；全开是零决策，4 槽保住 97.2% 战力） */\nexport const GEM_SLOTS = 4;\n\nimport type { Tag } from './tags';",
  'gems-const');

// 2) character.ts：imports + CharacterState 字段 + 装配归一函数
edit('F:/dsh-work/zhuoxian/src/core/character.ts',
  "import type { Rng } from './rng';",
  "import type { Rng } from './rng';\nimport { GEM_SLOTS, SUPPORT_GEMS } from '../data/support-gems';",
  'ch-import');

edit('F:/dsh-work/zhuoxian/src/core/character.ts',
  'export interface CharacterState {',
  'export interface CharacterState {\n  /** 装配的辅助玉简 id（最多 GEM_SLOTS=4 条；不填 = 没装配，战斗层零玉简加成）。\n   *  可选字段：老存档没有它也能读，读回来按 characterGemLoadout 归一。 */\n  gemLoadout?: string[];',
  'ch-interface');

const CH_FN = `

/** 装配表归一：只留已解锁 + 去重 + 截到 GEM_SLOTS 条。
 *  老存档带未知 id 直接丢弃，不让脏数据进战斗。 */
export function characterGemLoadout(ch: CharacterState): string[] {
  const out: string[] = [];
  for (const id of ch.gemLoadout ?? []) {
    const def = SUPPORT_GEMS.find((g) => g.id === id);
    if (!def || ch.step < def.unlockStep) continue;
    if (!out.includes(id)) out.push(id);
    if (out.length >= GEM_SLOTS) break;
  }
  return out;
}
`;
const pCh = 'F:/dsh-work/zhuoxian/src/core/character.ts';
let cCh = fs.readFileSync(pCh, 'utf8');
if (cCh.includes('characterGemLoadout')) { console.error('SKIP ch-fn (already)'); }
else { fs.writeFileSync(pCh, cCh + CH_FN, 'utf8'); console.log('OK ch-fn'); }

// 3) skills-runtime.ts：skillModifiers 吃装配表
edit('F:/dsh-work/zhuoxian/src/core/skills-runtime.ts',
  `/** 某神通装上所有已解锁玉简后的修正器 */
export function skillModifiers(ch: CharacterState, skill: ActiveSkillDef): Modifier[] {
  return gemModifiersFor(unlockedGems(ch), skill.tags);
}`,
  `/** 某神通按**装配表**装上的玉简产出的修正器（槽位上限 GEM_SLOTS=4）。
 *  装配表由 characterGemLoadout 归一（解锁过滤/去重/截断）。
 *  旧版「解锁即全开」是零决策 —— 12 选 4 才是第一版的 build 核心。 */
export function skillModifiers(ch: CharacterState, skill: ActiveSkillDef): Modifier[] {
  return gemModifiersFor(characterGemLoadout(ch), skill.tags);
}`,
  'rt-modifiers');

edit('F:/dsh-work/zhuoxian/src/core/skills-runtime.ts',
  "import { characterStats } from './character';",
  "import { characterStats, characterGemLoadout } from './character';",
  'rt-import');

console.log('DONE');
