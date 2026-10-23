// offline.ts 离线掉落吃 lootRarity（第 6 参）
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/src/core/offline.ts';
const orig = fs.readFileSync(p, 'utf8');
let c = orig;
fs.writeFileSync('F:/dsh-work/zhuoxian/tools/_bak/offline.ts.' + Date.now() + '.bak', orig, 'utf8');

function repl(oldText, newText, tag) {
  const n = c.split(oldText).length - 1;
  if (n !== 1) throw new Error('MISS(' + n + '): ' + tag);
  c = c.replace(oldText, newText);
  console.log('ok:', tag);
}

repl(
  "      const item = rollMonsterDrop('normal', floor, 'normal', rng, s.tables);",
  [
    '      // D39：离线产出也要吃「仙缘」（lootRarity），否则闭关出货质量会低于在线',
    "      const item = rollMonsterDrop('normal', floor, 'normal', rng, s.tables, characterStats(s.character).lootRarity);",
  ].join('\n'),
  'offline-loot-rarity',
);

repl(
  "import { liveMonsters } from './session';",
  "import { liveMonsters } from './session';\nimport { characterStats } from './character';",
  'import-character-stats',
);

if (c.length < orig.length * 0.98) throw new Error('拒绝写盘');
fs.writeFileSync(p, c, 'utf8');
console.log('flush', c.length, 'B');
