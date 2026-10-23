// 夺造化连做 N 次是否封顶（P0 回归的真 session 版）
//
// 纯单测算的是 improveAffixes；这里测的是 spendMarks('divineReforge') 走的完整路径：
//   挑战力最高的那件 → 重掷最弱一条（baseValue 重置）→ improveAffixes(1.3, 1.3)
// 预期：战力提升在 1~2 次后归零（撞 cap），而不是 1.3^n 复利。
import { createSession } from '../src/core/session';
import { characterPower } from '../src/core/inventory';
import { spendMarks } from '../src/core/marks-runtime';
import { MARKS_COST } from '../src/data/marks';
import { ITEM_BASES } from '../src/data/bases';
import { AFFIXES } from '../src/data/affixes';
import { TOTAL_STEPS } from '../src/core/progression';
import { rollLoot } from '../src/core/loot';
import { SLOT_ID_TO_KIND, SLOT_IDS } from '../src/data/slots';

const s = createSession({
  classId: 'yujian',
  seed: 20261022,
  tables: { bases: ITEM_BASES, affixes: AFFIXES },
  autoTalents: false,
});

// 摆到满级 + 给足渊痕
s.character = { ...s.character, step: TOTAL_STEPS - 1, marks: MARKS_COST.divineReforge * 10 };

// 先穿上一身 40 灵蕴的宝品（否则只有凡品起始铁剑，没有灵纹可重铸）
const equipment = { ...s.character.equipment };
for (const slotId of SLOT_IDS) {
  const res = rollLoot(s.rng, ITEM_BASES, AFFIXES, { ilvl: 40, rarity: 'bao', slot: slotId });
  if (res.item) equipment[slotId] = res.item;
  void SLOT_ID_TO_KIND;
}
s.character = { ...s.character, equipment };

const p0 = characterPower(s.character);
console.log('起点战力', p0.toFixed(0), '（已穿 40 灵蕴宝品）');

let prev = p0;
for (let i = 1; i <= 6; i++) {
  const r = spendMarks(s, 'divineReforge');
  const p = characterPower(s.character);
  console.log(
    `第 ${i} 次 ${r.ok ? 'OK' : 'FAIL(' + r.reason + ')'} 战力 ${p.toFixed(0)} (+${(((p - prev) / prev) * 100).toFixed(2)}% 环比, 累计 +${(((p - p0) / p0) * 100).toFixed(2)}%)`,
  );
  prev = p;
}

const total = ((prev - p0) / p0) * 100;
if (total > 120) {
  console.error(`\n✗ 累计 +${total.toFixed(1)}% 太高，cap 可能又没生效`);
  process.exitCode = 1;
} else {
  console.log(`\n✓ 6 次累计 +${total.toFixed(1)}%，封顶生效（复利口径会是 +383% 以上）`);
}
