// D162：40/60 分池（稀释）改成追加槽 30%（不动原池）；删掉 DEEP_RARITY_MUL
import fs from 'node:fs';

function load(file) {
  const raw = fs.readFileSync(file, 'utf8');
  return { crlf: raw.includes('\r\n'), text: raw.replace(/\r\n/g, '\n') };
}
function save(file, crlf, text) {
  fs.writeFileSync(file, crlf ? text.replace(/\n/g, '\r\n') : text, 'utf8');
  console.log('patched', file);
}

// ── legendary.ts：删 DEEP_RARITY_MUL、DEEP_LEGENDARY_SHARE → DEEP_EXTRA_CHANCE ──
{
  const { crlf, text } = load('src/data/legendary.ts');
  let t = text;
  const a = '/** 层 ≥40 时抽深层池的概率（其余抽基础池；两池都可得） */\nexport const DEEP_LEGENDARY_SHARE = 0.4;\n/** 层 ≥40 时品阶加成再翻倍（把 12 条收集压回 6h 量级，D161 的 (a) 分量） */\nexport const DEEP_RARITY_MUL = 1; // D161 回滚：×2 让 c0 满级 273.0→244.8（−5.8%，超 ±2%）⇒ 按 shuzhi 的回滚顺序先撤 (a)，(b) 留着';
  const b = [
    '/**',
    ' * 层 ≥40 时**额外追加**一次传奇抽取的概率（D162）。',
    ' *',
    ' * ⚠️ 这是「追加槽」不是「分池」：原有传奇抽取**完全不动**（基础 9 条仍 3.0 件/h），',
    ' * 另掷一次 30% 从深层池抽 1 条。',
    ' * 为什么不能分池（shuzhi 自己在 D158 里踩的坑）：层 ≥40 传奇率 3.0/h 若 40% 给深层池，',
    ' * 基础 9 条只剩 1.8/h ⇒ 基础收集 5.3h → 8.8h（+66%）。**共用一份掉率预算，加新货必然稀释老货。**',
    ' */',
    'export const DEEP_EXTRA_CHANCE = 0.3;',
  ].join('\n');
  if (!t.includes(a)) throw new Error('MISS legendary consts');
  t = t.replace(a, b);
  save('src/data/legendary.ts', crlf, t);
}

// ── loot.ts：深处追加槽（一个额外的仙品，独立抽取，不动主流程抽序） ─────
{
  const { crlf, text } = load('src/core/loot.ts');
  let t = text;

  t = t.replace(
    'import {\n  DEEP_LEGENDARY_DEFS,\n  DEEP_LEGENDARY_MIN_FLOOR,\n  DEEP_LEGENDARY_SHARE,\n  DEEP_RARITY_MUL,\n  LEGENDARY_DEFS,\n} from \'../data/legendary\';',
    'import {\n  DEEP_EXTRA_CHANCE,\n  DEEP_LEGENDARY_DEFS,\n  DEEP_LEGENDARY_MIN_FLOOR,\n  LEGENDARY_DEFS,\n} from \'../data/legendary\';',
  );

  // 品阶不再 ×2
  t = t.replace(
    '  // D161 (a)：层 ≥40 品阶加成 ×2 —— 这是把「12 条传奇收集」压回 6h 量级的唯一算术手段\n  // （传奇必须长在仙品上，不动仙品率就没法让传奇变多；shuzhi 的表格按 6.0 件/h 算的）。\n  const deep = floor >= DEEP_LEGENDARY_MIN_FLOOR;\n  const rarityBonus0 = (params.rarityBonus ?? 1) * (deep ? DEEP_RARITY_MUL : 1);\n  const rarity = rollRarity(rng, rarityBonus0);',
    '  const deep = floor >= DEEP_LEGENDARY_MIN_FLOOR;\n  const rarity = rollRarity(rng, params.rarityBonus ?? 1);',
  );

  // 传奇：主抽取恢复原样（只从基础池），追加槽另算
  t = t.replace(
    [
      '  // D161 (b)：层 ≥40 时 40% 抽深层池、60% 抽基础池 —— **加法共存，不是替换**。',
      '  // 替换会让「停层 46 刷装备」这个最优刷法永远刷不到基础 9 条（收集变成不可能）。',
      '  const legendary =',
      "    rarity === 'xian'",
      '      ? (deep && rng.chance(DEEP_LEGENDARY_SHARE)',
      '          ? rng.pick(DEEP_LEGENDARY_DEFS)',
      '          : rng.pick(LEGENDARY_DEFS)',
      '        ).id',
      '      : undefined;',
    ].join('\n'),
    [
      '  // D162：主传奇抽取**与改动前逐位相同**（只从基础 9 条池、只给仙品）——',
      '  // 位置也必须在灵纹之后，保持既有 rng 抽序不变。',
      "  const legendary = rarity === 'xian' ? rng.pick(LEGENDARY_DEFS).id : undefined;",
      '',
      '  // D162 追加槽：层 ≥40 时**另掷一次** 30%，命中就给一件额外的仙品（带深层专属传奇）。',
      '  // 为什么是「额外一件」而不是「同一件挂两条传奇」：`Item.legendary` 只有一个字段，',
      '  // 塞两条就得改字段语义 + 所有消费方；而追加一件装备天然是加法（不动原池、不动仙品率）。',
      '  // rng 顺序固定在这里：先决定主掉落，再掷追加槽 —— 位置一变整条抽序移位，历史基线全废。',
      '  let extraItem: Item | undefined;',
      '  if (deep && rng.chance(DEEP_EXTRA_CHANCE)) {',
      '    const deepDef = rng.pick(DEEP_LEGENDARY_DEFS);',
      '    const extraSlot = params.slot ?? rng.pick(SLOT_KINDS);',
      '    const extraBase = rollBase(bases, extraSlot, ilvl, rng);',
      '    if (extraBase) {',
      '      const extraAffixCount = pickAffixCount(\'xian\', rng);',
      '      extraItem = {',
      "        uid: `deep-${extraSlot}-${ilvl}-${rng.int(0x100000, 0x7ffffff).toString(16)}`,",
      '        slot: extraSlot,',
      "        rarity: 'xian',",
      '        ilvl,',
      '        name: `${RARITY_NAME.xian}·${extraBase.name}`,',
      '        base: [{ stat: extraBase.main, op: extraBase.mainOp ?? \'flat\', value: baseMainValue(extraBase, ilvl) }],',
      '        affixes: rollAffixInstances(pool, extraSlot, ilvl, extraAffixCount, rng),',
      '        legendary: deepDef.id,',
      '      };',
      '    }',
      '  }',
    ].join('\n'),
  );

  // 返回值带 extraItem
  t = t.replace(
    '    rarity,\n    slot,\n  };\n}',
    '    rarity,\n    slot,\n    extraItem,\n  };\n}',
  );

  // 接口加字段
  t = t.replace(
    '  readonly slot: SlotKind;\n}',
    '  readonly slot: SlotKind;\n  /**\n   * D162 追加槽：层 ≥40 追击 30% 命中时多出的一件仙品（带深层专属传奇）。\n   * 调用方要把它当成第二件掉落处理（否则字段存在但没人读 = 第八个死通道）。\n   */\n  readonly extraItem?: Item;\n}',
  );

  save('src/core/loot.ts', crlf, t);
}
