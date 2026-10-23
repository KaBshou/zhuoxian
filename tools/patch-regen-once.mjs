// P0 修复：波末回气在 gap 内每帧执行 ⇒ 实际每波满血（ceshi validate-balance 发现）。
// BALANCE v2 表 G 的字面意图是「每波只回一次 25%」。
// 修法：回气移到 startWave 之前一次性结算 —— 也就是 waveTimer>=WAVE_GAP 开新波的那一帧才回。
// 这样 gap 的 54 帧里不会重复扣。deathCleanup（死亡重开）仍不给。
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/src/core/session.ts';
let c = fs.readFileSync(p, 'utf8');
let miss = 0;
function repl(oldS, neu, tag) {
  if (!c.includes(oldS)) { console.error('MISS: ' + tag); miss++; return; }
  c = c.replace(oldS, neu);
  console.log('OK: ' + tag);
}

repl(
  `  if (isCleared(s.battle)) {
    // 波末脱战回气 25%（BALANCE v2 表 G）：恒定入伤比 + 波末回血 ⇒ 每波净盈余，
    // 层 1~27 全程可挂机。只在真打完时给（deathCleanup 是死亡标记，死亡重开不给）。
    if (!s.battle.deathCleanup) {
      const p = s.battle.player;
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * WAVE_END_REGEN);
    }
    s.waveTimer += d;
    if (s.waveTimer >= WAVE_GAP) {
      s.waveTimer = 0;`,
  `  if (isCleared(s.battle)) {
    s.waveTimer += d;
    if (s.waveTimer >= WAVE_GAP) {
      s.waveTimer = 0;
      // 波末脱战回气 25%（BALANCE v2 表 G）：恒定入伤比 + 波末回血 ⇒ 每波净盈余，
      // 层 1~27 全程可挂机。只在真打完、开新波前给**一次**（deathCleanup 是死亡标记，
      // 死亡重开不给）。之前写在 isCleared 分支里，gap 的 0.9s 内每帧都执行
      // （54 帧 × 25%），实际等价「每波满血」，入伤预算被悄悄放大了一倍 —— ceshi
      // validate-balance.mjs 抓的 P0。修复后回气总量回到字面口径。`,
  'move regen into new-wave frame',
);

if (miss > 0) process.exit(1);
fs.writeFileSync(p, c, 'utf8');
console.log('written');
