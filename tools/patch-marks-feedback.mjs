// 满级后渊痕要有反馈（浮字 + 每 10 万一条日志），否则玩家看不见自己在攒什么
import fs from 'node:fs';

const ROOT = 'F:/dsh-work/zhuoxian';
const p = ROOT + '/src/core/session.ts';
const orig = fs.readFileSync(p, 'utf8');
let c = orig;
fs.writeFileSync(ROOT + '/tools/_bak/session.ts.' + Date.now() + '.bak', orig, 'utf8');

function repl(oldText, newText, tag) {
  const n = c.split(oldText).length - 1;
  if (n !== 1) throw new Error('MISS(' + n + '): ' + tag);
  c = c.replace(oldText, newText);
  console.log('ok:', tag);
}

repl(
  [
    '      if (before >= TOTAL_STEPS - 1) {',
    '        s.character = {',
    '          ...s.character,',
    '          marks: (s.character.marks ?? 0) + Math.max(0, Math.round(killed.xp)),',
    '        };',
    '      } else {',
  ].join('\n'),
  [
    '      if (before >= TOTAL_STEPS - 1) {',
    '        const gained = Math.max(0, Math.round(killed.xp));',
    '        const marksBefore = s.character.marks ?? 0;',
    '        const marksAfter = marksBefore + gained;',
    '        s.character = { ...s.character, marks: marksAfter };',
    '        // 满级后修为的唯一去处是渊痕，玩家必须看得见它在涨：',
    '        // 只进数字不进画面的话，满级那一刻等于「游戏结束了」而不是「另一条线开始了」。',
    '        pushFloat(s, {',
    '          text: `+${gained} 渊痕`,',
    '          x: (killed.x ?? BATTLE_W / 2) + jitter(marksAfter, 8),',
    '          y: (killed.y ?? BATTLE_H / 2) - 18,',
    '          color: \'#6b3fa0\',',
    '          life: 0.8,',
    '          rise: 26,',
    '        });',
    '        // 每跨过一个 10 万门槛报一次（按 MARKS_COST 的最小档对齐），夜里挂机也不刷屏',
    '        const step = 100_000;',
    '        if (Math.floor(marksAfter / step) > Math.floor(marksBefore / step)) {',
    '          pushLog(s, `渊痕 ${Math.floor(marksAfter / step) * step}`, \'#6b3fa0\');',
    '        }',
    '      } else {',
  ].join('\n'),
  'marks-feedback',
);

if (c.length < orig.length * 0.98) throw new Error('拒绝写盘');
fs.writeFileSync(p, c, 'utf8');
console.log('flush', c.length, 'B');
