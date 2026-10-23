// v4.1 测试迁移：BOSS_DMG_MUL/BOSS_REGEN_RATIO 引常量（shuzhi 预告的顶红点）
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/tests/battle.test.ts';
let c = fs.readFileSync(p, 'utf8');
let miss = 0;
function repl(oldS, neu, tag) {
  if (!c.includes(oldS)) { console.error('MISS: ' + tag); miss++; return; }
  c = c.replace(oldS, neu);
  console.log('OK: ' + tag);
}

// 标题与断言里的硬编码 1.5 / 0.03
repl("镇守 = 同层普通浊物 ×25 血 ×1.5 攻（BALANCE v2 §11.2）", "镇守 = 同层普通浊物 ×25 血 ×1.2 攻（BALANCE v4.1 §17.5）", 'title');
repl("expect(boss.dmgMul).toBe(1.5);", "expect(boss.dmgMul).toBe(BOSS_DMG_MUL);", 'dmg assert');
repl("expect(boss.regenRatio).toBe(0.03);", "expect(boss.regenRatio).toBe(BOSS_REGEN_RATIO);", 'regen assert');

// import 块加 BOSS_DMG_MUL / BOSS_REGEN_RATIO（挂在 monsters import 里）
if (!c.includes('BOSS_DMG_MUL,')) {
  const anchor = "import {\n  ALL_MONSTERS,";
  if (!c.includes(anchor)) { console.error('MISS: import anchor'); miss++; }
  else { c = c.replace(anchor, "import {\n  ALL_MONSTERS,\n  BOSS_DMG_MUL,\n  BOSS_REGEN_RATIO,"); console.log('OK: imports'); }
}

if (miss > 0) process.exit(1);
fs.writeFileSync(p, c, 'utf8');
console.log('written');
