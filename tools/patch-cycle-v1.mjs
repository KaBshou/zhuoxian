// 周目 v1（D36-A / D130）接线：session 字段 + 轮回函数 + 怪倍率 + 存档
// 用法：node tools/patch-cycle-v1.mjs
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

patch('src/core/session.ts', [
  [
    'import cycles',
    "import { MONSTER_QTY_CAP, sumMonsterAffixes } from '../data/monster-affixes';",
    [
      "import { MONSTER_QTY_CAP, sumMonsterAffixes } from '../data/monster-affixes';",
      "import { clampCycle, cycleMarksMul, cycleName } from '../data/cycles';",
    ].join('\n'),
  ],
  ['import isMaxStep', "import { TOTAL_STEPS } from './progression';", "import { isMaxStep, TOTAL_STEPS } from './progression';"],
  [
    'GameSession.cycle',
    '  maxFloorReached: number;\n',
    [
      '  maxFloorReached: number;',
      '  /**',
      '   * 周目数（D36-A / D130）。0 = 初临（第一轮），每次轮回 +1。',
      '   *',
      '   * 它是「刻度的载体」而不是资源：怪物气血/攻伐按周目乘方（1.35^N / 1.25^N），',
      '   * 渊痕产出按周目线性放大（1 + N），**修为永远不加**（满级后修为只能换渊痕）。',
      '   */',
      '  cycle: number;',
      '',
    ].join('\n'),
  ],
  [
    'SessionOptions.cycle',
    '  readonly autoTalents?: boolean;\n}',
    [
      '  readonly autoTalents?: boolean;',
      '  /** 起始周目（默认 0；读档/测试用，玩家侧只由 prestige 推进） */',
      '  readonly cycle?: number;',
      '}',
    ].join('\n'),
  ],
  [
    'createSession cycle',
    '  const seeded = opts.talentIds?.length ? { ...character, talentIds: [...opts.talentIds] } : character;',
    [
      '  const seeded = opts.talentIds?.length ? { ...character, talentIds: [...opts.talentIds] } : character;',
      '  // 周目：怪物倍率在 spawnMonster 里按 cycle 应用，渊痕产出在击杀分支乘 cycleMarksMul',
      '  const cycle = clampCycle(opts.cycle);',
    ].join('\n'),
  ],
  ['return cycle', '    deaths: 0,\n    autoTalents:', '    deaths: 0,\n    cycle,\n    autoTalents:'],
  [
    'boss spawn cycle',
    "spawnMonster(boss, floor, uidCounter++, BATTLE_W / 2 + 210, BATTLE_H / 2, 'boss'),",
    "spawnMonster(boss, floor, uidCounter++, BATTLE_W / 2 + 210, BATTLE_H / 2, 'boss', [], s.cycle),",
  ],
  [
    'ring spawn cycle',
    '...spawnRing(monstersOfTier(tierOfFloor(floor)), floor, WAVE_SIZE, s.rng, uidCounter),',
    '...spawnRing(monstersOfTier(tierOfFloor(floor)), floor, WAVE_SIZE, s.rng, uidCounter, s.cycle),',
  ],
  [
    'marks cycle mul',
    'const gained = Math.max(0, Math.round(killed.xp));',
    [
      '// 周目只放大渊痕产出（线性），修为永远不加：满级后修为本来也只能换渊痕。',
      '        const gained = Math.max(0, Math.round(killed.xp * cycleMarksMul(s.cycle)));',
    ].join('\n'),
  ],
]);

const sess = read('src/core/session.ts');
if (!sess.text.includes('export function prestigeReady')) {
  const block = `
/**
 * 轮回条件：满级（第九境渡劫 = step 80）且不在死亡冷却中。
 *
 * 为什么只判满级、不要求「清完第 76 层」：满级是修为线的终点，层数是装备线；
 * 两条线不该互相阻塞（想刷装备的人可以随时轮回，反之亦然）。
 */
export function prestigeReady(s: GameSession): boolean {
  return isMaxStep(s.character.step) && s.battle.reviveCooldown <= 0;
}

/**
 * 轮回：保留「跨周目」的东西（渊痕、图鉴、成就、引导进度、死亡计数），
 * 重置「单周目」的东西（境界、属性、装备、背包、通货、波次、首通账本）。
 *
 * 三条硬纪律（见 src/data/cycles.ts 文件头）：不给修为、只给渊痕与品阶、
 * 倍率只乘怪不乘玩家。
 */
export function prestige(s: GameSession): boolean {
  if (!prestigeReady(s)) return false;
  const nextCycle = clampCycle(s.cycle + 1);
  const marks = s.character.marks ?? 0;
  const fresh = createCharacter(s.character.classId);
  s.character = { ...fresh, marks };
  s.cycle = nextCycle;
  s.bag = [];
  s.ground = [];
  s.pocket = { huang: 0, mie: 0, xi: 0 };
  s.gemPouch = {};
  s.floor = 1;
  s.wave = 0;
  s.waveTimer = 0;
  s.floorDeaths = 0;
  s.escapeValveCount = 0;
  s.floorKills = 0;
  s.floorMinutes = 0;
  s.dropsFound = 0;
  s.craftTimer = 0;
  s.fragmentAim = null;
  s.firstClearedFloors = [];
  s.maxFloorReached = 1;
  // 战斗态整体重建：player 从新角色派生，怪按新周目倍率生成
  s.battle = createBattle(playerBattleFromCharacter(s.character), s.character.turbid, s.character, s.switches);
  startWave(s);
  pushLog(s, '轮回 · ' + cycleName(nextCycle) + '：浊物更凶，渊痕更厚', '#6b3fa0');
  return true;
}
`;
  write('src/core/session.ts', sess.text + block, sess.crlf);
  console.log('appended prestige()/prestigeReady()');
} else {
  console.log('prestige already present, skip');
}

patch('src/core/battle.ts', [
  [
    'import cycles',
    "} from '../data/monsters';",
    "} from '../data/monsters';\nimport { cycleDmgMul, cycleHpMul } from '../data/cycles';",
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
