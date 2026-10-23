// 一次性补丁 v2：自动点天赋接进 session（突破后 + 首通后）（跑完即弃）
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/src/core/session.ts';
let c = fs.readFileSync(p, 'utf8');

function repl(old, neu, tag) {
  const n = c.split(old).length - 1;
  if (n !== 1) throw new Error(`MISS(${n}): ${tag}`);
  console.log('ok:', tag);
  return c.replace(old, neu);
}

c = repl(
  c,
  `import { switchOverridesFor, type TalentSwitchOverrides } from './talents-runtime';`,
  `import { switchOverridesFor, type TalentSwitchOverrides } from './talents-runtime';
import { autoAllocateTalents } from './talents-auto';`,
  'import',
);

c = repl(
  c,
  `        // 突破会改属性，战斗态必须跟着重算 —— 否则升了境界伤害不变，玩家会以为没生效
        syncBattleFromCharacter(s);`,
  `        // 突破会改属性，战斗态必须跟着重算 —— 否则升了境界伤害不变，玩家会以为没生效
        // 顺手把新到手的天赋点花掉（放置游戏不让玩家手点 130 次，理由见 talents-auto.ts）
        s.character = autoAllocateTalents(s.character, s.firstClearedFloors.length);
        syncBattleFromCharacter(s);`,
  'auto-allocate-after-breakthrough',
);

c = repl(
  c,
  `        if (!s.firstClearedFloors.includes(s.floor)) s.firstClearedFloors.push(s.floor);`,
  `        if (!s.firstClearedFloors.includes(s.floor)) {
          s.firstClearedFloors.push(s.floor);
          // 首通给 2 点天赋，也要立刻花掉（否则点数攒着不生效）
          s.character = autoAllocateTalents(s.character, s.firstClearedFloors.length);
          syncBattleFromCharacter(s);
        }`,
  'auto-allocate-after-first-clear',
);

fs.writeFileSync(p, c, 'utf8');
console.log('done');
