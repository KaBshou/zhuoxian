// 一次性补丁：EHP 修复 + 默认装配价值序修正（shuzhi m05012 / ceshi m05011 两条数据钉死）。
//
// 改动 1（EHP，ceshi 实测）：WAVE_SIZE 18 → 10。
//   ceshi diag-floor：18 只同屏入伤 195.6~654.4/波 vs 气血 142~358 → 2~4 秒团灭，
//   层 1/13/18/27 十分钟清波 0 次 → 波末回气永远触发不了（死循环）。
//   击杀率不受波容量影响（玩家逐只杀），入伤立刻 −44%。
//   BALANCE §8 表 G 的「10 只/入伤 24」本来就是原始口径，§3 的 18 只是击杀速度补偿手段。
// 改动 2（波末回气，ceshi 实测）：清波回气保留，死亡重开也回 25%。
//   复活本来就满血，这条补的是「清不了波的层」死循环里玩家重新爬波的时间。
//   —— 实际复活满血已覆盖，故不另改，只在注释说明。
// 改动 3（默认装配价值序，shuzhi 实测）：priority 数组换成她验证过的行。
//   旧序在 step9 让默认装配 DPS 从 1.921 掉到 1.599（解锁新玉简反而变弱 17%），
//   step18 只有最优的 67%。新序：拷皮(more 0.15) → 猛攻/急切(速度) → 万汇(more 0.30,
//   带 costMul 1.5 故排第 4) → 三元素 → 扩散 → 破绽两条 → 回气/驭魔。
//   shuzhi 实测新序：step18/27 六条神通全 2.484×（100% 最优），step9 1.92~1.98× 不再倒退。
import fs from 'node:fs';

function edit(p, old, neu, tag) {
  let c = fs.readFileSync(p, 'utf8');
  if (!c.includes(old)) { console.error('MISS ' + tag); process.exit(1); }
  c = c.split(old).join(neu);
  fs.writeFileSync(p, c, 'utf8');
  console.log('OK ' + tag);
}

const S = 'F:/dsh-work/zhuoxian/src/core/session.ts';
const C = 'F:/dsh-work/zhuoxian/src/core/character.ts';

edit(S,
  `/** 一波几只普通怪（BALANCE §3：一波 8 只，目标 75 秒） */
export const WAVE_SIZE = 18;`,
  `/** 一波几只普通怪。
 *  ceshi diag-floor 实测（2026-10-22）：18 只同屏入伤 195.6~654.4/波 vs 气血 142~358，
 *  2~4 秒团灭；层 1/13/18/27 十分钟清波 0 次 → 波末回气永远触发不了（死循环，
 *  层 27 十分钟 75 死、击杀 0）。压到 10（= BALANCE §8 表 G 原始口径）：入伤 −44%，
 *  击杀率基本不变（玩家逐只杀，波容量不限制杀怪速度）。 */
export const WAVE_SIZE = 10;`,
  'wave-size');

edit(C,
  `  const priority = ['wanhui', 'kaopi', 'guantou', 'duanjin', 'mengong', 'jixie', 'cuijin', 'zhuo-huo', 'hanbing', 'kuosan', 'huitou', 'yuanmo'];`,
  `  // 价值序（shuzhi m05012 实测定稿）：拷皮(more 0.15)第一 → 猛攻/急切(速度，每条神通
  //  只命中 attack/spell 其一，两条连排 = 速度优先) → 万汇(more 0.30 排第 4——它带
  //  costMul 1.5，顶最前会让"真元不够"成为开局第一印象；排在元素前保证 AoE 法系
  //  不把元素挤掉) → 三元素 → 扩散 → 破绽两条(导数仅 +2.8%/+3.8%，垫底) → 回气/驭魔。
  //  旧序的体验 bug：step9 解锁贯头/断筋后默认装配 DPS 从 1.921 掉到 1.599（-17%），
  //  step18 只有最优的 67%。新序 step18/27 六条神通全 2.484×（100% 最优）。
  const priority = ['kaopi', 'mengong', 'jixie', 'wanhui', 'cuijin', 'zhuo-huo', 'hanbing', 'kuosan', 'guantou', 'duanjin', 'huitou', 'yuanmo'];`,
  'priority');

console.log('DONE');
