// 一次性补丁 B3：把 rollMonsterDrop 的掉落加成参数收敛成一个 number（避免 LootParams 必填字段冲突）
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/src/core/drop.ts';
const orig = fs.readFileSync(p, 'utf8');
let c = orig;
function repl(old, neu, tag) {
  const n = c.split(old).length - 1;
  if (n !== 1) throw new Error('MISS(' + n + '): ' + tag);
  c = c.replace(old, neu);
  console.log('ok:', tag);
}

// 1) 签名：第 6 参改成 lootRarity 数字
repl(
  `  tables: DropTables,
  params: LootParams = {},
): Item | null {`,
  `  tables: DropTables,
  /** 玩家仙缘（lootRarity），D39：以 0.5 倍折进 rarityBonus */
  lootRarity = 0,
): Item | null {`,
  'signature',
);

// 2) 函数体：用参数而不是 params
repl(
  `  const lootRarity = Number.isFinite(params.lootRarity) ? Math.max(0, params.lootRarity ?? 0) : 0;
  const paramsOut: LootParams = {
    ilvl: ilvlForFloor(floor),
    rarityBonus:
      DROP_RARITY_BONUS[rarity] * (1 + 0.5 * lootRarity) * (1 + depthRarityBonus(floor)),
  };`,
  `  const luck = Number.isFinite(lootRarity) ? Math.max(0, lootRarity) : 0;
  const paramsOut: LootParams = {
    ilvl: ilvlForFloor(floor),
    rarityBonus:
      DROP_RARITY_BONUS[rarity] * (1 + 0.5 * luck) * (1 + depthRarityBonus(floor)),
  };`,
  'body',
);

// 3) import depthRarityBonus
const monsterImport = c.match(/import \{[^}]*\} from '\.\.\/data\/monsters';/);
if (!monsterImport) throw new Error('找不到 monsters import');
console.log('monsters import:', monsterImport[0].replace(/\s+/g, ' '));
if (!monsterImport[0].includes('depthRarityBonus')) {
  c = c.replace(monsterImport[0], monsterImport[0].replace('{', '{\n  depthRarityBonus,'));
}

if (c.length < orig.length * 0.95) throw new Error('拒绝写盘');
fs.writeFileSync(p, c, 'utf8');
console.log('done', c.length, 'B');
