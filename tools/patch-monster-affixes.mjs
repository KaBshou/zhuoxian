// 妖纹接线：battle.spawnMonster 应用妖纹效果 + spawnRing 掷档 + MonsterInPlay 带 affixIds
import fs from 'node:fs';

function patch(path, pairs) {
  let raw = fs.readFileSync(path, 'utf8');
  const crlf = raw.includes('\r\n');
  const nl = crlf ? '\r\n' : '\n';
  let norm = raw.replace(/\r\n/g, '\n');
  const before = norm.length;
  for (const [oldText, newText] of pairs) {
    if (!norm.includes(oldText)) throw new Error(`MISS in ${path}: ${oldText.slice(0, 70)}`);
    norm = norm.replace(oldText, newText);
  }
  if (norm.length === before) throw new Error(`没有变化 ${path}`);
  if (crlf) norm = norm.replace(/\n/g, nl);
  fs.writeFileSync(`F:/dsh-work/zhuoxian/tools/_bak/${path.split('/').pop()}.${Date.now()}.bak`, fs.readFileSync(path));
  fs.writeFileSync(path, norm);
  console.log(`${path.split('/').pop()}: ${before} -> ${norm.length}${crlf ? ' (CRLF)' : ''}`);
}

const B = 'F:/dsh-work/zhuoxian/src/core/battle.ts';

patch(B, [
  // 1) import 妖纹合计 + 掷档
  [
    "import type { MonsterDef, MonsterRarity } from '../data/monsters';",
    [
      "import type { MonsterDef, MonsterRarity } from '../data/monsters';",
      "import { sumMonsterAffixes } from '../data/monster-affixes';",
      "import { rollMonsterIdentity } from './monster-roll';",
    ].join('\n'),
  ],
  // 2) MonsterInPlay 带妖纹 id
  [
    '  readonly rarity: MonsterRarity;\n  readonly element: ElementTag;',
    [
      '  readonly rarity: MonsterRarity;',
      '  /** 妖纹 id（空 = 普通浊物）。只存 id，效果已在生成时乘进下面几个数值 */',
      '  readonly affixIds: readonly string[];',
      '  readonly element: ElementTag;',
    ].join('\n'),
  ],
  // 3) spawnMonster 签名加 affixIds
  [
    '  rarity: MonsterRarity = def.boss ? \'boss\' : \'normal\',\n): MonsterInPlay {\n  const s = scaleOfFloor(floor);',
    [
      "  rarity: MonsterRarity = def.boss ? 'boss' : 'normal',",
      '  /** 妖纹 id 列表（默认空 = 行为与改造前逐位相同） */',
      '  affixIds: readonly string[] = [],',
      '): MonsterInPlay {',
      '  const s = scaleOfFloor(floor);',
      '  // 妖纹：伤害/气血/护体/移速都是 increased（加法汇总后乘一次），出手间隔是乘法。',
      '  // 空数组时四舍五入与乘法全部是恒等，所以「不传妖纹」= 改造前逐位相同（探针/单测的向后兼容硬断言）。',
      '  const affix = sumMonsterAffixes(affixIds);',
    ].join('\n'),
  ],
  // 4) 数值应用
  [
    '  const maxHp = Math.max(1, Math.round(BASE_MONSTER_HP * def.hpMul * s.hp * bossRel));',
    '  const maxHp = Math.max(\n    1,\n    Math.round(BASE_MONSTER_HP * def.hpMul * s.hp * bossRel * (1 + affix.lifeInc)),\n  );',
  ],
  [
    '    rarity,\n    element: def.element,',
    '    rarity,\n    affixIds,\n    element: def.element,',
  ],
  [
    '    damage: Math.max(1, BASE_MONSTER_DAMAGE * def.dmgMul * s.damage),\n    armor: def.armor,\n    resist: def.resist ?? {},\n    speed: def.speed,',
    [
      '    damage: Math.max(1, BASE_MONSTER_DAMAGE * def.dmgMul * s.damage * (1 + affix.damageInc)),',
      '    armor: Math.round(def.armor * (1 + affix.armorInc)),',
      '    resist: scaleResist(def.resist ?? {}, affix.resistInc),',
      '    speed: def.speed * (1 + affix.speedInc),',
    ].join('\n'),
  ],
  [
    "    attackInterval: def.boss ? Math.max(0.2, BOSS_ATTACK_INTERVAL) : Math.max(0.2, def.attackInterval),",
    [
      '    attackInterval: def.boss',
      '      ? Math.max(0.2, BOSS_ATTACK_INTERVAL)',
      '      : Math.max(0.2, def.attackInterval * affix.intervalMul),',
    ].join('\n'),
  ],
  // 5) spawnRing 掷档
  [
    '    const def = defs[order[i % order.length]!];\n    if (!def) continue;\n    const angle = rng.float(0, Math.PI * 2);',
    [
      '    const def = defs[order[i % order.length]!];',
      '    if (!def) continue;',
      '    // 妖纹（REQ §3 第 8 条）：稀有度与妖纹在这里一起掷，镇守由 rollMonsterIdentity 直接给 boss。',
      '    // 掷档必须放在取坐标**之前**以外的位置保持 rng 消耗稳定可复现（同种子同序列）。',
      '    const identity = rollMonsterIdentity(rng, floor, !!def.boss);',
      '    const angle = rng.float(0, Math.PI * 2);',
    ].join('\n'),
  ],
  [
    '    out.push(spawnMonster(def, floor, startUid + i, x, y));',
    '    out.push(spawnMonster(def, floor, startUid + i, x, y, identity.rarity, identity.affixIds));',
  ],
]);

// scaleResist 辅助函数：放在 spawnRing 之前
patch(B, [
  [
    '/** 在战场边缘环形撒一批怪（不在玩家脸上生成，避免开局就被贴） */',
    [
      '/**',
      ' * 妖纹的五行抗性按 `increased` 缩放：各元素 ×(1+resistInc)。',
      ' * 空表返回**原对象**（不是新空对象）—— 普通怪不该因为接妖纹而多一次分配。',
      ' */',
      'function scaleResist(',
      '  resist: Partial<Record<ElementStatKey, number>>,',
      '  resistInc: number,',
      '): Partial<Record<ElementStatKey, number>> {',
      '  if (!Number.isFinite(resistInc) || resistInc <= 0) return resist;',
      '  const out: Partial<Record<ElementStatKey, number>> = {};',
      '  for (const [k, v] of Object.entries(resist)) {',
      '    if (typeof v !== \'number\' || !Number.isFinite(v)) continue;',
      '    out[k as ElementStatKey] = v * (1 + resistInc);',
      '  }',
      '  return out;',
      '}',
      '',
      '/** 在战场边缘环形撒一批怪（不在玩家脸上生成，避免开局就被贴） */',
    ].join('\n'),
  ],
]);
