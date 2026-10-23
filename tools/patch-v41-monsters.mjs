// v4.1 落地：shuzhi 定稿（BALANCE §17 附录 C）
// 改动 1：scaleOfFloor 加攻伐软上限（层 ≤20 一位不变，层 20 之后斜率 1.03）
// 改动 2：BOSS_REGEN_RATIO 0.03 → 0.015
// 改动 3：BOSS_DMG_MUL 1.5 → 1.2
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/src/data/monsters.ts';
let c = fs.readFileSync(p, 'utf8');
let miss = 0;
function repl(oldS, neu, tag) {
  if (!c.includes(oldS)) { console.error('MISS: ' + tag); miss++; return; }
  c = c.replace(oldS, neu);
  console.log('OK: ' + tag);
}

// 改动 1：scaleOfFloor 软上限
repl(
  `export function scaleOfFloor(floor: number): { hp: number; damage: number } {
  const f = Number.isFinite(floor) && floor >= 1 ? Math.floor(floor) : 1;
  return {
    hp: Math.pow(FLOOR_HP_MUL, f - 1),
    damage: Math.pow(FLOOR_DAMAGE_MUL, f - 1),
  };
}`,
  `/** 攻伐软上限（BALANCE v4.1 §17.5，D22）：层 20 之前按 1.09 全速涨，
 *  之后斜率降到 1.03。理由：玩家 EHP 在台阶 80 封顶（裸装 370），怪攻若按
 *  1.09^26 一路涨，层 27 镇守战内总入伤 = 26 发 × 3.81% = 99.1% 必死；
 *  软上限后层 27 攻伐 6.3236（−32.7%），镇守战 45%（余量 55%）。
 *  层 1~20 完全不变（分支不执行），深层表 C 的普通波判定也不受影响。 */
export const FLOOR_DAMAGE_SOFT_FLOOR = 20;
export const FLOOR_DAMAGE_SOFT_MUL = 1.03;

export function scaleOfFloor(floor: number): { hp: number; damage: number } {
  const f = Number.isFinite(floor) && floor >= 1 ? Math.floor(floor) : 1;
  const damage =
    f <= FLOOR_DAMAGE_SOFT_FLOOR
      ? Math.pow(FLOOR_DAMAGE_MUL, f - 1)
      : Math.pow(FLOOR_DAMAGE_MUL, FLOOR_DAMAGE_SOFT_FLOOR - 1) *
        Math.pow(FLOOR_DAMAGE_SOFT_MUL, f - FLOOR_DAMAGE_SOFT_FLOOR);
  return {
    hp: Math.pow(FLOOR_HP_MUL, f - 1),
    damage,
  };
}`,
  'scaleOfFloor softcap',
);

// 改动 2：自回 3% → 1.5%
repl(
  `/** 战内自回比例。3% 是 ceshi diag-boss 实测标定（层 1/9/18 TTK 105/133/119s 全落 60~180s）；
 *  原定 10% 生效后 TTK 395~1904s，三层全卡关。 */
export const BOSS_REGEN_RATIO = 0.03;`,
  `/** 战内自回比例。v2 定 3%（diag-boss 实测标定，TTK 105/133/119s）；
 *  v4.1 降到 1.5%（BALANCE §17.5，D20）：自回 208→104/s，TTK 130→109s，
 *  少 4 次出手。3% 在层 27 抽走 1/3 玩家 DPS，是镇守战必死的推手之一。 */
export const BOSS_REGEN_RATIO = 0.015;`,
  'boss regen',
);

// 改动 3：镇守攻 1.5 → 1.2
repl(
  `/** 镇守攻伐 = 同层普通 ×1.5（BALANCE v2 §11.2：×4 会在 15 层一击打掉 60%+ 气血） */
export const BOSS_DMG_MUL = 1.5;`,
  `/** 镇守攻伐 = 同层普通 ×1.2（BALANCE v4.1 §17.5：v2 的 ×1.5 在层 27 每发 3.81%，
 *  叠加软上限后 2.05%/发；×4 会在 15 层一击打掉 60%+ 气血的结论仍然成立） */
export const BOSS_DMG_MUL = 1.2;`,
  'boss dmg',
);

if (miss > 0) process.exit(1);
fs.writeFileSync(p, c, 'utf8');
console.log('written');
