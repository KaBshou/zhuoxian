// 一次性补丁：修 patch-p0-fixes 引出的类型错。跑完即弃。
// 1) drop.ts rollMonsterDrop 改收 floor（number），词缀灵蕴按层、基底查表按阶
// 2) battle.ts bossRegenTimer 改可选（测试手搓怪不需要知道它）
import fs from 'node:fs';

function edit(p, old, neu, tag) {
  let c = fs.readFileSync(p, 'utf8');
  if (!c.includes(old)) { console.error('MISS ' + tag); process.exit(1); }
  c = c.split(old).join(neu);
  fs.writeFileSync(p, c, 'utf8');
  console.log('OK ' + tag);
}

const D = 'F:/dsh-work/zhuoxian/src/core/drop.ts';
const B = 'F:/dsh-work/zhuoxian/src/core/battle.ts';

edit(D,
  `export function rollMonsterDrop(
  defId: string,
  tier: 1 | 2 | 3,
  rarity: MonsterRarity,
  rng: Rng,
  tables: DropTables,
): Item | null {`,
  `/** floor 是层数：词缀灵蕴按层算（ilvlForFloor），基底/怪表按阶查（tierOfFloor）。
 *  之前参数收 tier，调用方传的却是层，层 1~9 全掉 ilvl 4，玄/地/天词缀永远洗不出。 */
export function rollMonsterDrop(
  defId: string,
  floor: number,
  rarity: MonsterRarity,
  rng: Rng,
  tables: DropTables,
): Item | null {`,
  'drop-sig');
edit(D,
  `  const params: LootParams = {
    ilvl: ilvlForTier(tier),
    rarityBonus: DROP_RARITY_BONUS[rarity],
  };`,
  `  const params: LootParams = {
    ilvl: ilvlForFloor(floor),
    rarityBonus: DROP_RARITY_BONUS[rarity],
  };`,
  'drop-ilvl');
// 检查 rollBase 是否用了 tier
{
  const c = fs.readFileSync(D, 'utf8');
  const i = c.indexOf('export function rollLoot');
  console.log('---- rollLoot body ----');
  console.log(c.slice(i, i + 900));
}
edit(B,
  '  /** 镇守战内自回计时器（非镇守恒 0） */\n  bossRegenTimer: number;',
  '  /** 镇守战内自回计时器（非镇守恒 0；可选 = 测试手搓怪不用关心它） */\n  bossRegenTimer?: number;',
  'regen-opt');
edit(B,
  '          m.bossRegenTimer += d;',
  '          m.bossRegenTimer = (m.bossRegenTimer ?? 0) + d;',
  'regen-nullsafe');
console.log('DONE');
