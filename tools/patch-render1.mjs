// 一次性补丁：battle-renderer.ts 和 session.test.ts 适配 floor 模型。跑完即弃。
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

patch('src/render/battle-renderer.ts', [
  ['this.ensureFloor(s.tier);', 'this.ensureFloor(s.floor);', 'floor1'],
  [
    '`第 ${s.wave} 波　${s.tier} 阶　击杀 ${s.battle.kills}　掉落 ${s.dropsFound}`',
    '`第 ${s.wave} 波　${s.floor} 层　击杀 ${s.battle.kills}　掉落 ${s.dropsFound}`',
    'stat-line',
  ],
]);

patch('tests/session.test.ts', [
  // 创建/读档处的 tier: 1 或 .tier
  ['s.tier', 's.floor', 'all-tier'],
]);

console.log('done');
