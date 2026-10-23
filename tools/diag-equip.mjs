// 一次性诊断 2：只看「换装判定」本身 —— 在层 46 / 灵蕴 99 的条件下，
// 同一个部位从「灵品 2 条」换到「宝品 4 条」到底能不能过 1.02 的门槛。
// 起因：修了「全角色战力比」之后身上仍有 sword:ling/2（同部位同灵蕴），
// 要确认是掉落里没有更好的，还是判定仍然不换。
import { openSrc } from './vite-loader.mjs';

const { load, close } = await openSrc();
try {
  const { ITEM_BASES } = await load('src/data/bases.ts');
  const { AFFIXES } = await load('src/data/affixes.ts');
  const { rollLoot } = await load('src/core/loot.ts');
  const { createCharacter } = await load('src/core/character.ts');
  const { decideEquip, itemPower } = await load('src/core/inventory.ts');
  const { Rng } = await load('src/core/rng.ts');

  const rng = new Rng(777001);
  const bases = ITEM_BASES;
  const affixes = AFFIXES;

  // 先给每个部位塞一件「灵品 ilvl 99」做基准
  let ch = createCharacter('yujian');
  const SLOTS = ['sword', 'relic', 'crown', 'robe', 'bracer', 'boots', 'belt', 'ring1', 'ring2', 'pendant'];
  const KIND_OF = {
    sword: 'sword', relic: 'relic', crown: 'crown', robe: 'robe', bracer: 'bracer',
    boots: 'boots', belt: 'belt', ring1: 'ring', ring2: 'ring', pendant: 'pendant',
  };
  const r2 = new Rng(777002);
  for (const slot of SLOTS) {
    const kind = KIND_OF[slot];
    // 直接抽一件灵品，放在基准位
    for (let guard = 0; guard < 500; guard++) {
      const res = rollLoot(r2, bases, affixes, { ilvl: 99, rarityBonus: 1.0, slot: kind });
      if (res.rarity === 'ling') {
        const cur = { ...ch, equipment: { ...ch.equipment, [slot]: res.item } };
        ch = cur;
        break;
      }
    }
  }

  const counts = new Map();
  for (const slot of SLOTS) {
    const cur = ch.equipment[slot];
    counts.set(slot, { base: cur ? itemPower(cur) : 0, upgrades: 0, better: 0, best: null });
  }

  // 再掷 4000 件层 46 掉落，看每个部位能换几次
  for (let i = 0; i < 4000; i++) {
    const res = rollLoot(rng, bases, affixes, { ilvl: 99, rarityBonus: 1.45 });
    const d = decideEquip(ch, res.item);
    if (!d.shouldEquip) {
      // 记录「其实更强但没换」的次数，这是真 bug 的指纹
      const cur = ch.equipment[d.targetSlot];
      if (cur && itemPower(res.item) > itemPower(cur)) {
        const c = counts.get(d.targetSlot);
        if (c) c.better += 1;
      }
      continue;
    }
    const c = counts.get(d.targetSlot);
    if (c) c.upgrades += 1;
    ch = { ...ch, equipment: { ...ch.equipment, [d.targetSlot]: res.item } };
  }

  for (const slot of SLOTS) {
    const c = counts.get(slot);
    const cur = ch.equipment[slot];
    console.log(
      `${slot.padEnd(8)} 基准=${c.base.toFixed(0).padStart(6)} 换装=${String(c.upgrades).padStart(4)} 次 ` +
        `「更强却没换」=${String(c.better).padStart(4)} 最终=${String(cur?.rarity).padEnd(6)}/${cur?.affixes.length}`,
    );
  }
} finally {
  await close();
}
