// 周目 v1 第二步：battle 倍率 + 存档字段（session 已在 patch-cycle-v1 落完）
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve('.');
function read(p) {
  const raw = fs.readFileSync(path.join(ROOT, p), 'utf8');
  return { raw, text: raw.replace(/\r\n/g, '\n'), crlf: raw.includes('\r\n') };
}
function write(p, text, crlf) {
  fs.writeFileSync(path.join(ROOT, p), crlf ? text.replace(/\n/g, '\r\n') : text, 'utf8');
}
function patch(p, edits) {
  const { text, crlf } = read(p);
  let t = text;
  for (const [tag, oldText, newText] of edits) {
    const at = t.indexOf(oldText);
    if (at < 0) throw new Error(`MISS ${p} :: ${tag}`);
    if (t.indexOf(oldText, at + 1) >= 0) throw new Error(`AMBIGUOUS ${p} :: ${tag}`);
    t = t.slice(0, at) + newText + t.slice(at + oldText.length);
  }
  if (t.length < text.length * 0.9) throw new Error(`SHRINK ${p}`);
  write(p, t, crlf);
  console.log(`patched ${p} (${text.length} -> ${t.length})`);
}

patch('src/core/battle.ts', [
  [
    'import cycles',
    "import { sumMonsterAffixes } from '../data/monster-affixes';",
    "import { sumMonsterAffixes } from '../data/monster-affixes';\nimport { cycleDmgMul, cycleHpMul } from '../data/cycles';",
  ],
  [
    'spawnMonster cycle param',
    '  affixIds: readonly string[] = [],\n): MonsterInPlay {',
    [
      '  affixIds: readonly string[] = [],',
      '  /** 周目数（默认 0 = 初临，全部倍率恒等 ⇒ 与改造前逐位相同） */',
      '  cycle: number = 0,',
      '): MonsterInPlay {',
    ].join('\n'),
  ],
  [
    'hp cycle mul',
    'Math.round(BASE_MONSTER_HP * def.hpMul * s.hp * bossRel * (1 + affix.lifeInc)),',
    'Math.round(BASE_MONSTER_HP * def.hpMul * s.hp * bossRel * (1 + affix.lifeInc) * cycleHpMul(cycle)),',
  ],
  [
    'dmg cycle mul',
    'BASE_MONSTER_DAMAGE * def.dmgMul * s.damage * (1 + affix.damageInc) * threatMul(floor, !!def.boss),',
    'BASE_MONSTER_DAMAGE * def.dmgMul * s.damage * (1 + affix.damageInc) * threatMul(floor, !!def.boss) * cycleDmgMul(cycle),',
  ],
  [
    'spawnRing cycle param',
    '  startUid: number,\n): MonsterInPlay[] {',
    '  startUid: number,\n  /** 周目数（透传给 spawnMonster） */\n  cycle: number = 0,\n): MonsterInPlay[] {',
  ],
  [
    'spawnRing inner call',
    'out.push(spawnMonster(def, floor, startUid + i, x, y, identity.rarity, identity.affixIds));',
    'out.push(spawnMonster(def, floor, startUid + i, x, y, identity.rarity, identity.affixIds, cycle));',
  ],
]);

patch('src/core/save.ts', [
  [
    'ProgressSave.cycle',
    '  readonly deaths?: number;',
    '  readonly deaths?: number;\n  /** 周目数（D36-A；缺省 = 初临，老档自动视为 0） */\n  readonly cycle?: number;',
  ],
  [
    'serialize input.cycle',
    '  deaths?: number;\n  pocket: Record<CurrencyId, number>;',
    '  deaths?: number;\n  cycle?: number;\n  pocket: Record<CurrencyId, number>;',
  ],
  [
    'serialize deaths',
    'deaths: Math.max(0, Math.floor(input.deaths ?? 0)),',
    'deaths: Math.max(0, Math.floor(input.deaths ?? 0)),\n      cycle: Math.max(0, Math.floor(input.cycle ?? 0)),',
  ],
  [
    'deserialize deaths',
    "    deaths:\n      typeof pr.deaths === 'number' && Number.isFinite(pr.deaths) ? Math.max(0, Math.floor(pr.deaths)) : 0,",
    [
      '    deaths:',
      "      typeof pr.deaths === 'number' && Number.isFinite(pr.deaths) ? Math.max(0, Math.floor(pr.deaths)) : 0,",
      '    cycle:',
      "      typeof pr.cycle === 'number' && Number.isFinite(pr.cycle) ? Math.max(0, Math.floor(pr.cycle)) : 0,",
    ].join('\n'),
  ],
]);

patch('src/core/save-bridge.ts', [
  ['bridge to save', '    deaths: s.deaths ?? 0,', '    deaths: s.deaths ?? 0,\n    cycle: s.cycle ?? 0,'],
  [
    'bridge from save',
    '  s.deaths = Math.max(0, Math.floor(state.progress.deaths ?? 0));',
    '  s.deaths = Math.max(0, Math.floor(state.progress.deaths ?? 0));\n  s.cycle = clampCycle(state.progress.cycle ?? 0);',
  ],
  [
    'bridge import cycle',
    "import { sanitizeAchievements } from './achievement';",
    "import { sanitizeAchievements } from './achievement';\nimport { clampCycle } from '../data/cycles';",
  ],
]);
console.log('done');
