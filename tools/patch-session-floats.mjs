// 一次性补丁：session.ts 重建缺了「战斗事件 → 浮字」这一段（跑完即弃）
// 注意：repl 统一签名 (old, neu, tag)，第一参永远是「待替换的源码串」，不传整文件。
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/src/core/session.ts';
const orig = fs.readFileSync(p, 'utf8');
let c = orig;

function repl(old, neu, tag) {
  const n = c.split(old).length - 1;
  if (n !== 1) throw new Error(`MISS(${n}): ${tag}`);
  c = c.replace(old, neu);
  console.log('ok:', tag);
}

repl(
  `    } else if (e.kind === 'player-kill' && e.monster) {`,
  `    } else if (e.kind === 'player-hit' || e.kind === 'player-crit') {
      // 伤害浮字：暴击金色更大，普攻灰白 —— 玩家不看数字也能感到"这一下重"
      const crit = e.kind === 'player-crit';
      pushFloat(s, {
        text: crit ? \`\${e.amount}!\` : String(e.amount),
        x: (e.x ?? BATTLE_W / 2) + s.rng.float(-8, 8),
        y: (e.y ?? BATTLE_H / 2) - 8,
        color: crit ? '#d4a13c' : '#d8d3c4',
        life: crit ? 0.95 : 0.75,
        rise: crit ? 40 : 30,
      });
    } else if (e.kind === 'monster-hit') {
      pushFloat(s, {
        text: e.label,
        x: (e.x ?? BATTLE_W / 2) + s.rng.float(-6, 6),
        y: (e.y ?? BATTLE_H / 2) - 30,
        color: '#c25a48',
        life: 0.9,
        rise: 34,
      });
    } else if (e.kind === 'player-kill' && e.monster) {`,
  'battle-floats',
);

// 写盘前防御：新内容不能比原内容短太多（这次的教训）
if (c.length < orig.length * 0.9) {
  throw new Error(`拒绝写盘：结果 ${c.length}B 比原文 ${orig.length}B 短太多`);
}
fs.writeFileSync(p, c, 'utf8');
console.log('done', c.length, 'B');
