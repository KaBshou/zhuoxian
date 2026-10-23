// D123：按 skill.damageType 再拆神通段（weapon 型神通 vs fixed 型神通）
//       目的：判断 damage / attackSpeed 这两个属性是不是又一批「有定义没效果」的死属性。
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = 'F:\\dsh-work\\zhuoxian\\';
function patch(rel, edits) {
  const P = ROOT + rel;
  const raw = readFileSync(P, 'utf8');
  const crlf = raw.includes('\r\n');
  let t = raw.replace(/\r\n/g, '\n');
  const before = t.length;
  for (const [tag, oldT, newT] of edits) {
    if (t.includes(newT)) continue;
    const hits = t.split(oldT).length - 1;
    if (hits !== 1) throw new Error(`[${rel} · ${tag}] 命中 ${hits} 次`);
    t = t.replace(oldT, newT);
  }
  writeFileSync(P, crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
  console.log(`OK ${rel} ${before} → ${t.length}（${t.length - before >= 0 ? '+' : ''}${t.length - before}）`);
}

patch('src/core/battle.ts', [
  [
    'fields',
    '  /** D122：神通（技能段）累计伤害；含 weapon 类神通（它吃 p.damage，不吃 skillFloorScale） */\n  skillDamage: number;',
    '  /** D122：神通（技能段）累计伤害；含 weapon 类神通（它吃 p.damage，不吃 skillFloorScale） */\n  skillDamage: number;\n' +
      '  /** D123：`damageType === \'weapon\'` 的神通伤害（吃 p.damage → 武器属性还在这里起作用） */\n  skillWeaponDamage: number;\n' +
      '  /** D123：`damageType === \'fixed\'` 的神通伤害（吃 skillFloorScale → 与武器属性无关） */\n  skillFixedDamage: number;',
  ],
  [
    'init',
    '  weaponDamage: 0,\n  skillDamage: 0,',
    '  weaponDamage: 0,\n  skillDamage: 0,\n  skillWeaponDamage: 0,\n  skillFixedDamage: 0,',
  ],
  [
    'count',
    '  target.hp -= res.amount;\n  state.skillDamage += res.amount;',
    '  target.hp -= res.amount;\n  state.skillDamage += res.amount;\n' +
      '  // D123：按伤害类型再分 —— weapon 型吃 p.damage（武器属性有效），fixed 型吃 skillFloorScale（与武器无关）\n' +
      "  if (skill.damageType === 'weapon') state.skillWeaponDamage += res.amount;\n  else state.skillFixedDamage += res.amount;",
  ],
]);

patch('tools/session-runner.mjs', [
  [
    'report',
    '    damageSplit: { weapon: s.battle.weaponDamage, skill: s.battle.skillDamage },',
    '    damageSplit: {\n' +
      '      weapon: s.battle.weaponDamage,\n' +
      '      skill: s.battle.skillDamage,\n' +
      '      skillWeapon: s.battle.skillWeaponDamage,\n' +
      '      skillFixed: s.battle.skillFixedDamage,\n' +
      '    },',
  ],
]);
