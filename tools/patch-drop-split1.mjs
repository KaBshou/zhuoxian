// 掉落三分类：法宝 40% / 通货 47.5% / 玉简 12.5%（BALANCE §5/§11.3）。
// 之前只有法宝份额，1.9/分钟的通货和 0.5/分钟的玉简是空的。
// 通货/玉简不是 Item，进 bag 需要新容器 —— 第一版先做「货币袋」pocket（记账式，不占 40 格背包）。
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/src/core/session.ts';
let c = fs.readFileSync(p, 'utf8');
let miss = 0;
function repl(oldS, neu, tag) {
  if (!c.includes(oldS)) { console.error('MISS: ' + tag); miss++; return; }
  c = c.replace(oldS, neu);
  console.log('OK: ' + tag);
}

// 1) imports
repl(
  "import { createCharacter, gainXp, type CharacterState } from './character';",
  "import { createCharacter, gainXp, type CharacterState } from './character';\nimport { CURRENCY_SHARE, rollCurrency, type CurrencyId } from '../data/currency';\nimport { GEM_SHARE, rollGemDrop } from '../data/gem-drops';",
  'imports',
);

// 2) GameSession 加货币袋字段
repl(
  '  /** 累计突破次数 */\n  breakthroughs: number;\n}',
  '  /** 累计突破次数 */\n  breakthroughs: number;\n  /** 货币袋：通货计数（不占 40 格背包，记账式） */\n  pocket: Record<CurrencyId, number>;\n  /** 掉落的玉简（id 计数，拾取即收入） */\n  gemPouch: Record<string, number>;\n}',
  'GameSession fields',
);

// 3) createSession 初始化
repl(
  '    dropsFound: 0,\n    breakthroughs: 0,\n  };',
  '    dropsFound: 0,\n    breakthroughs: 0,\n    pocket: { huang: 0, mie: 0, xi: 0 },\n    gemPouch: {},\n  };',
  'createSession init',
);

if (miss > 0) process.exit(1);
fs.writeFileSync(p, c, 'utf8');
console.log('written');
