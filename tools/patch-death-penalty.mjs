// 一次性补丁：实装死亡惩罚「掉 10% 当前修为」（DECISIONS 默认值）。跑完即弃。
// 死亡惩罚放在 session 层（消费 player-died 事件处），不在 battle 层 ——
// battle 不知道"修为"是什么，只知道谁死了。
import fs from 'node:fs';

const p = 'src/core/session.ts';
let c = fs.readFileSync(p, 'utf8');
let misses = [];

function repl(old, neu, tag) {
  if (!c.includes(old)) {
    misses.push(tag);
    return;
  }
  c = c.split(old).join(neu);
}

repl(
  "    } else if (e.kind === 'player-died') {\n      pushLog(s, '气血枯竭，浊脉重凝', '#e05a3a');\n      // 死亡 ≠ 清场。旧逻辑里死亡清怪 → isCleared 立即为真 → 白送一波进度，\n      // 模拟里 10 分钟死 17 次却推了 27 波。现在：重开本波，不给进度。\n      s.battle.deathCleanup = false;\n      s.floorDeaths += 1;",
  "    } else if (e.kind === 'player-died') {\n      pushLog(s, '气血枯竭，浊脉重凝', '#e05a3a');\n      // 死亡 ≠ 清场。旧逻辑里死亡清怪 → isCleared 立即为真 → 白送一波进度，\n      // 模拟里 10 分钟死 17 次却推了 27 波。现在：重开本波，不给进度。\n      s.battle.deathCleanup = false;\n      s.floorDeaths += 1;\n      // 死亡惩罚：掉当前台阶已积累修为的 10%（DECISIONS 默认值）。\n      // 不掉已突破的台阶 —— 那会把玩家往下拉一整重，挫败感远大于代价。\n      // 惩罚按当前台阶存量算而不是总收入：死得越早罚得越少，滚雪球不至于绝望。\n      const penalty = Math.floor(s.character.xp * DEATH_XP_PENALTY);\n      if (penalty > 0) {\n        s.character = { ...s.character, xp: s.character.xp - penalty };\n        pushLog(s, `修为受损 -${penalty}`, '#6d665c');\n      }",
  'penalty',
);

// 常量放在 WAVE_GAP 附近
repl(
  "export const WAVE_GAP = 0.9;",
  "export const WAVE_GAP = 0.9;\n/** 死亡惩罚：掉当前台阶已积累修为的 10%（DECISIONS 默认值，数值策划可调） */\nexport const DEATH_XP_PENALTY = 0.1;",
  'const',
);

if (misses.length > 0) {
  console.error('MISS:', misses.join(', '));
  process.exit(1);
}
fs.writeFileSync(p, c, 'utf8');
console.log('OK');
