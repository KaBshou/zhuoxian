/**
 * 镇守自回修复（ceshi diag-boss 报的 bug）：计时器写在 `else if (m.cooldown === 0)` 分支里，
 * 每次出手只加 1/60s —— 凑满 10s 要 600 次出手 ≈ 3000s，实测 120s 内自回 0 次。
 * 修法：计时器推进提到每帧（与 cooldown/距离无关），只在 period 到点时回血。
 * 同时按 ceshi 实测把自回比例 10% → 3%（10% 生效后 TTK 395~1904s 全卡关；3% = 105/133/119s 全合格）。
 * 一次性补丁，跑完即弃。
 */
import fs from 'node:fs';

function edit(p, old, neu, tag) {
  let c = fs.readFileSync(p, 'utf8');
  if (!c.includes(old)) { console.error('MISS ' + tag); process.exit(1); }
  c = c.split(old).join(neu);
  fs.writeFileSync(p, c, 'utf8');
  console.log('OK ' + tag);
}

const B = 'F:/dsh-work/zhuoxian/src/core/battle.ts';

// 1) 每帧推进计时器（放在怪循环开头、cooldown 递减旁边）
edit(B,
  `      m.cooldown = Math.max(0, m.cooldown - d);

      if (dist > m.attackRange) {`,
  `      m.cooldown = Math.max(0, m.cooldown - d);
      // 镇守自回计时器必须**每帧**推进（diag-boss 抓到的 bug：原来写在出手分支里，
      // 每次只加 1/60s，凑满 10s 要 600 次出手 —— 实测 120 秒内自回 0 次）。
      if (m.rarity === 'boss') m.bossRegenTimer = (m.bossRegenTimer ?? 0) + d;

      if (dist > m.attackRange) {`,
  'per-frame');

// 2) 出手分支里只做「到点回血」
edit(B,
  `      } else if (m.cooldown === 0) {
        if (m.rarity === 'boss') {
          // 战内自回：每 10 秒回 10% 最大气血（BALANCE v2 §11.2）。
          // 没有它会出「玩家 DPS 恰好卡在回复量上，永远打不死但也不会死」的僵局。
          m.bossRegenTimer = (m.bossRegenTimer ?? 0) + d;
          if (m.bossRegenTimer >= BOSS_REGEN_PERIOD) {
            m.bossRegenTimer -= BOSS_REGEN_PERIOD;
            m.hp = Math.min(m.maxHp, m.hp + m.maxHp * BOSS_REGEN_RATIO);
          }
        }`,
  `      } else if (m.cooldown === 0) {
        if (m.rarity === 'boss' && m.bossRegenTimer >= BOSS_REGEN_PERIOD) {
          // 战内自回：每 10 秒回 3% 最大气血（比例由 ceshi diag-boss 实测定标：
          // 10% 生效后 TTK 395~1904s 全卡关，3% = 105/133/119s 全落 60~180s）。
          m.bossRegenTimer -= BOSS_REGEN_PERIOD;
          m.hp = Math.min(m.maxHp, m.hp + m.maxHp * BOSS_REGEN_RATIO);
        }`,
  'regen-branch');

console.log('DONE');
