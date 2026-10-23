// 一次性补丁：BOSS_REGEN_RATIO 10% → 3%（ceshi diag-boss 实测定标）。
import fs from 'node:fs';
const p = 'F:/dsh-work/zhuoxian/src/data/monsters.ts';
let c = fs.readFileSync(p, 'utf8');
const old = 'export const BOSS_REGEN_RATIO = 0.1;';
if (!c.includes(old)) { console.error('MISS'); process.exit(1); }
c = c.replace(old, '/** 战内自回比例。3% 是 ceshi diag-boss 实测标定（层 1/9/18 TTK 105/133/119s 全落 60~180s）；\n *  原定 10% 生效后 TTK 395~1904s，三层全卡关。 */\nexport const BOSS_REGEN_RATIO = 0.03;');
fs.writeFileSync(p, c, 'utf8');
console.log('OK');
