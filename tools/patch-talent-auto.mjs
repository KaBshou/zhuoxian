// 一次性补丁：把自动点天赋接进 session（突破/首通后自动分配）（跑完即弃）
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/src/core/session.ts';
let c = fs.readFileSync(p, 'utf8');

function repl(old, neu, tag) {
  const n = c.split(old).length - 1;
  if (n !== 1) throw new Error(`MISS(${n}): ${tag}`);
  console.log('ok:', tag);
  return c.replace(old, neu);
}

// 1) import
const importAnchor = c.includes("import { switchOverridesFor } from './talents-runtime';")
  ? "import { switchOverridesFor } from './talents-runtime';"
  : null;
if (!importAnchor) throw new Error('MISS: import anchor');

c = repl(
  c,
  importAnchor,
  `${importAnchor}
import { autoAllocateTalents } from './talents-auto';`,
  'import',
);

// 2) 找突破处：gainXp 之后 push 突破日志的地方，补一次自动分配
const killBlock = c.includes('s.breakthroughs += 1;') ? 's.breakthroughs += 1;' : null;
if (!killBlock) throw new Error('MISS: breakthrough counter');

c = repl(
  c,
  killBlock,
  `s.breakthroughs += 1;
        // 突破后立刻自动点天赋（放置游戏不让玩家手点 130 次，理由见 talents-auto.ts 头注释）。
        // 放在这里而不是每帧：分配是纯函数但会重建 character 对象，每帧调会白白制造垃圾。
        s.character = autoAllocateTalents(s.character, s.firstClearedFloors.length);`,
  'auto-allocate',
);

fs.writeFileSync(p, c, 'utf8');
console.log('done');
