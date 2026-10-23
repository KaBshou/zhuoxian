// 一次性补丁：session.ts 补 firstClearedFloors 初始化 + 首通记账
const fs = require('fs');
const p = 'F:/dsh-work/zhuoxian/src/core/session.ts';
let c = fs.readFileSync(p, 'utf8');

function repl(old, neu, tag) {
  if (!c.includes(old)) throw new Error('MISS: ' + tag);
  c = c.replace(old, neu);
}

repl('    character: seeded,',
     '    character: seeded,\n    firstClearedFloors: [],',
     'init');

// 首通记账：下潜成功那一刻，把刚打完的旧层记进账本（含当前层则不发首通点）
const anchor = `      if (s.wave % BOSS_EVERY === 0 && s.floor < MAX_FLOOR) {
        s.floor = Math.min(MAX_FLOOR, s.floor + 1);
        pushLog(s, \`深入魔渊第 \${s.floor} 层\`, '#6b3fa0');
      }`;
const neu = `      if (s.wave % BOSS_EVERY === 0 && s.floor < MAX_FLOOR) {
        // 首通记账：打完镇守下潜成功 = 旧层首通（天赋点「每层首通 +2」的账本）
        if (!s.firstClearedFloors.includes(s.floor)) s.firstClearedFloors.push(s.floor);
        s.floor = Math.min(MAX_FLOOR, s.floor + 1);
        pushLog(s, \`深入魔渊第 \${s.floor} 层\`, '#6b3fa0');
      }`;
repl(anchor, neu, 'first-clear');

fs.writeFileSync(p, c, 'utf8');
console.log('OK');
