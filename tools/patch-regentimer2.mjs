// 一次性补丁：tickBattle 怪循环里对 bossRegenTimer 用 `?? 0` 兜底（保留字段可选，测试手搓怪不用关心）。
import fs from 'node:fs';
const p = 'F:/dsh-work/zhuoxian/src/core/battle.ts';
let c = fs.readFileSync(p, 'utf8');

const old1 = "      if (m.rarity === 'boss') m.bossRegenTimer = (m.bossRegenTimer ?? 0) + d;";
if (!c.includes(old1)) { console.error('MISS 1'); process.exit(1); }
c = c.replace(old1, "      if (m.rarity === 'boss') m.bossRegenTimer = (m.bossRegenTimer ?? 0) + d; // 已 ?? 0 兜底");

const old2 = "        if (m.rarity === 'boss' && m.bossRegenTimer >= BOSS_REGEN_PERIOD) {";
if (!c.includes(old2)) { console.error('MISS 2'); process.exit(1); }
c = c.replace(old2, "        if (m.rarity === 'boss' && (m.bossRegenTimer ?? 0) >= BOSS_REGEN_PERIOD) {");

const old3 = "          m.bossRegenTimer -= BOSS_REGEN_PERIOD;\n          m.hp = Math.min(m.maxHp, m.hp + m.maxHp * BOSS_REGEN_RATIO);";
if (!c.includes(old3)) { console.error('MISS 3'); process.exit(1); }
c = c.replace(old3, "          m.bossRegenTimer = (m.bossRegenTimer ?? 0) - BOSS_REGEN_PERIOD;\n          m.hp = Math.min(m.maxHp, m.hp + m.maxHp * BOSS_REGEN_RATIO);");

fs.writeFileSync(p, c, 'utf8');
console.log('OK');
