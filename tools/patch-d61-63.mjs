// 一次性：shuzhi v4.31 报的三处（D61/D62/D63）
//   D61 itemPower 盲区：仙品 90~95% 换不上去 → decideEquip 加「带传奇且当前无传奇 → 直接换」
//   D62 同 id 传奇不许叠加：legendaryFlags 从「求和」改成「同旗子取最大」
//   D63 玄冥护体 armor increased +140% 只值 EHP +6%（D19 后护甲只占 30% 权重）→ 提到 +300%
import fs from 'node:fs';

const repl = (p, oldText, newText, tag) => {
  const raw = fs.readFileSync(p, 'utf8');
  const crlf = raw.includes('\r\n');
  let c = raw.replace(/\r\n/g, '\n');
  if (!c.includes(oldText)) throw new Error(`MISS ${tag}`);
  c = c.replace(oldText, newText);
  fs.writeFileSync(p, crlf ? c.replace(/\n/g, '\r\n') : c, 'utf8');
  console.log(`ok ${tag} (${raw.length} -> ${c.length})`);
};

// ── D61 ─────────────────────────────────────────────────────
repl(
  'F:/dsh-work/zhuoxian/src/core/inventory.ts',
  [
    "  const before = itemPower(current);",
    "  const after = itemPower(item);",
    '  const gain = before <= 0 ? Number.POSITIVE_INFINITY : after / before;',
    '  return { shouldEquip: gain >= AUTO_EQUIP_MARGIN, gain, targetSlot };',
  ].join('\n'),
  [
    '  // 传奇优先（D61）：`itemPower` 只累加 base + affixes，**根本不读 legendary**，',
    '  // 于是「带传奇的仙品」和「同灵蕴宝品」在战力上几乎一样 —— 实测 90.3~95.2% 的仙品',
    '  // 永远换不上去，玩家刷到的传奇效果一次都不会生效。',
    '  // 修法不动 itemPower（不引魔数、不污染战力口径），只加一条前置规则：',
    '  // 「新件有传奇、身上没有 → 直接换」。两件都有传奇时仍按战力比（不能无限换装）。',
    '  if (item.legendary && !current.legendary) {',
    '    return { shouldEquip: true, gain: Number.POSITIVE_INFINITY, targetSlot };',
    '  }',
    '  const before = itemPower(current);',
    '  const after = itemPower(item);',
    '  const gain = before <= 0 ? Number.POSITIVE_INFINITY : after / before;',
    '  return { shouldEquip: gain >= AUTO_EQUIP_MARGIN, gain, targetSlot };',
  ].join('\n'),
  'D61-decideEquip',
);

// ── D62 ─────────────────────────────────────────────────────
repl(
  'F:/dsh-work/zhuoxian/src/core/item.ts',
  [
    '  let killHeal = 0;',
    '  let doubleStrike = 0;',
    '  let boomMore = 0;',
    '  for (const item of Object.values(equipment)) {',
    '    if (!item) continue;',
    '    const def = legendaryOf(item);',
    '    if (!def?.flag) continue;',
    '    const param = def.param ?? 0;',
    '    if (!Number.isFinite(param) || param <= 0) continue;',
    "    if (def.flag === 'kill-heal') killHeal += param;",
    "    else if (def.flag === 'double-strike') doubleStrike += param;",
    "    else if (def.flag === 'boom-more') boomMore += param;",
    '  }',
  ].join('\n'),
  [
    '  // **同一条旗子取最大值，不求和**（D62）。',
    '  // 求和的话「10 部位都刷到双影」= 1.8 次追击 = DPS 翻倍，而且这是**可刷的** ——',
    '  // 那就是 D45 明令禁止的「无限战力」种子。取最大值后，堆同一条传奇毫无收益，',
    '  // 玩家应该去凑**不同**的传奇（这才是收集向装备该有的激励）。',
    '  let killHeal = 0;',
    '  let doubleStrike = 0;',
    '  let boomMore = 0;',
    '  for (const item of Object.values(equipment)) {',
    '    if (!item) continue;',
    '    const def = legendaryOf(item);',
    '    if (!def?.flag) continue;',
    '    const param = def.param ?? 0;',
    '    if (!Number.isFinite(param) || param <= 0) continue;',
    "    if (def.flag === 'kill-heal') killHeal = Math.max(killHeal, param);",
    "    else if (def.flag === 'double-strike') doubleStrike = Math.max(doubleStrike, param);",
    "    else if (def.flag === 'boom-more') boomMore = Math.max(boomMore, param);",
    '  }',
  ].join('\n'),
  'D62-flags-max',
);

// ── D63 ─────────────────────────────────────────────────────
repl(
  'F:/dsh-work/zhuoxian/src/data/legendary.ts',
  "  { id: 'xuanming', name: '玄冥护体', desc: '护体提高 140%（D19 之后护甲只占减伤 30% 权重，所以数值要给得大）', mods: [{ stat: 'armor', op: 'increased', value: 1.4 }] },",
  "  { id: 'xuanming', name: '玄冥护体', desc: '护体提高 300%（D19 之后护甲只占减伤 30% 权重；+140% 只值 EHP +6%，+300% 才值 +16%）', mods: [{ stat: 'armor', op: 'increased', value: 3.0 }] },",
  'D63-xuanming',
);
