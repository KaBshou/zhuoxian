// 修 diag-dropsplit 的计数 bug：dropsFound 现在在分流前 +1（每次击杀都记），
// 但通货/玉简不落地，gear 计数（ground+bag）也对不上——不如直接按 pocket/gemPouch/ground+bag 三个容器统计。
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/tools/diag-dropsplit.mjs';
let c = fs.readFileSync(p, 'utf8');
let miss = 0;
function repl(oldS, neu, tag) {
  if (!c.includes(oldS)) { console.error('MISS: ' + tag); miss++; return; }
  c = c.replace(oldS, neu);
  console.log('OK: ' + tag);
}

repl(
  `let gear = 0, cur = 0, gem = 0, totalDrops = 0, kills = 0;`,
  `let gear = 0, cur = 0, gem = 0, kills = 0;`,
  'decl',
);
repl(
  `    const before = s.dropsFound;
    const beforeKills = s.battle.kills;
    tickSession(s, DT);
    totalDrops += s.dropsFound - before;
    kills += s.battle.kills - beforeKills;`,
  `    const beforeKills = s.battle.kills;
    tickSession(s, DT);
    kills += s.battle.kills - beforeKills;`,
  'tick loop',
);
repl(
  `const sum = gear + cur + gem;
console.log(\`总掉落记录=\${totalDrops} 击杀=\${kills} (\${(kills/10).toFixed(1)}/min)\`);
console.log(\`法宝=\${gear} (\${(100*gear/sum).toFixed(1)}%) 通货=\${cur} (\${(100*cur/sum).toFixed(1)}%) 玉简=\${gem} (\${(100*gem/sum).toFixed(1)}%)\`);
console.log(\`掉落率=\${(totalDrops/10).toFixed(2)}/min（目标 4）\`);`,
  `const sum = gear + cur + gem;
console.log(\`击杀=\${kills} (\${(kills/10).toFixed(1)}/min)\`);
console.log(\`法宝=\${gear} (\${(100*gear/sum).toFixed(1)}%) 通货=\${cur} (\${(100*cur/sum).toFixed(1)}%) 玉简=\${gem} (\${(100*gem/sum).toFixed(1)}%)\`);
console.log(\`掉落率=\${(sum/10).toFixed(2)}/min（目标 4）\`);`,
  'output',
);

if (miss > 0) process.exit(1);
fs.writeFileSync(p, c, 'utf8');
console.log('written');
