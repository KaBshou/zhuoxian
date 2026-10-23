// 一次性补丁（第二轮）：inventory.ts 与 character.test.ts 清掉 weaponDamage 残留。跑完即弃。
import fs from 'node:fs';

function patch(p, pairs) {
  let c = fs.readFileSync(p, 'utf8');
  for (const [old, neu, tag] of pairs) {
    if (!c.includes(old)) {
      console.error(`MISS [${p}] ${tag}`);
      process.exit(1);
    }
    c = c.split(old).join(neu);
  }
  fs.writeFileSync(p, c, 'utf8');
  console.log('OK ' + p);
}

patch('src/core/inventory.ts', [
  [
    `import {
  characterModifiers,
  equippedItems,
  equip,
  weaponDamage,
  type CharacterState,
} from './character';`,
    `import {
  UNARMED_DAMAGE,
  characterModifiers,
  equippedItems,
  equip,
  type CharacterState,
} from './character';`,
    'inv-imp',
  ],
]);

patch('tests/character.test.ts', [
  ['  weaponDamage,\n', '', 'test-imp'],
]);

console.log('done');
