import fs from 'node:fs';
const P = 'F:/dsh-work/zhuoxian/tests/audio.test.ts';
let c = fs.readFileSync(P, 'utf8');
function rep(old, neu, tag) {
  if (!c.includes(old)) throw new Error('MISS ' + tag);
  c = c.replace(old, neu);
}
// 1) ctx 可变
rep('  readonly ctx: MinimalAudioContext;', '  ctx: MinimalAudioContext;');
// 2) createGain 把值写进 rec.gains（否则那条断言永远看不见）
rep(`    createGain() {
      const gainStore: number[] = [];
      return { gain: param(gainStore), ...node() };
    },`,
`    createGain() {
      // 直接写进 rec.gains：音量断言要看的是「真正下发到 GainNode 的值」，
      // 存到局部数组里等于测了个寂寞（第一版就是这么假绿的）。
      return { gain: param(gains), ...node() };
    },`);
// 3) 怪物字段是 readonly，必须整体替换
rep(`    for (const m of s.battle.monsters) {
      m.x = s.battle.player.x;
      m.y = s.battle.player.y;
      m.damage = 999;
      m.attackInterval = 0.1;
      m.cooldown = 0;
    }`,
`    // MonsterInPlay 的 damage/attackInterval 是 readonly：整体替换而不是原地改
    s.battle.monsters = s.battle.monsters.map((m) => ({
      ...m,
      x: s.battle.player.x,
      y: s.battle.player.y,
      damage: 999,
      attackInterval: 0.1,
      cooldown: 0,
    }));`);

fs.writeFileSync(P, c, 'utf8');
console.log('OK');
