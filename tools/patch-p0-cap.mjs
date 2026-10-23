// 一次性补丁（P0）：improveAffixes 的 cap 被 `void cap;` 吞掉 → 每次夺造化 ×1.3 永久叠加 = 无限战力口子
//
// 修法：给 AffixInstance 加可选 `baseValue`（生成时 = 该灵蕴下掷出的原值），
// 淬炼上限 = baseValue × cap。这样：
//   - 淬灵石（1.1, cap 1.3）最多把一条灵纹抬到原值的 1.3 倍
//   - 夺造化（1.3, cap 1.3）先重掷（baseValue 重置）再淬 → 永远停在 1.3×base，**不会复利**
//   - 老存档没有 baseValue → 按当前值当基准（第一次淬照常生效，之后封顶）
import fs from 'node:fs';

function edit(P, pairs) {
  let c = fs.readFileSync(P, 'utf8');
  const before = c.length;
  fs.writeFileSync(P + '.' + Date.now() + '.bak', c, 'utf8');
  for (const [oldText, newText, tag] of pairs) {
    if (!c.includes(oldText)) throw new Error('MISS(' + tag + '): ' + oldText);
    const n = c.split(oldText).length - 1;
    if (n !== 1) throw new Error(`AMBIGUOUS(${n}): ${tag}`);
    c = c.replace(oldText, newText);
    console.log('OK:', tag);
  }
  if (c.length < before * 0.9) throw new Error('结果比原文短 10% 以上，拒绝写盘: ' + P);
  fs.writeFileSync(P, c, 'utf8');
  console.log('written', P, before, '->', c.length);
}

edit('F:/dsh-work/zhuoxian/src/core/item.ts', [
  [
    `  readonly value: number;
  readonly tags?: readonly Tag[];
}`,
    `  readonly value: number;
  readonly tags?: readonly Tag[];
  /**
   * 这条灵纹在**刚掷出来时**的数值（淬炼上限的基准）。
   * 存在理由：\`improveAffixes\` 的上限必须是「原值 × cap」，不能是「每次 ×mul」——
   * 后者会让每次淬炼都乘一遍，几十次之后就是无限战力（这个 bug 真发生过：
   * \`void cap;\` 把 cap 吞了，夺造化 6 次把灵纹抬到原值 4.8~14 倍）。
   * 老存档没有这个字段 = 按当前值当基准（第一次淬炼照常生效，之后封顶）。
   */
  readonly baseValue?: number;
}`,
    'affix-baseValue-field',
  ],
  [
    `    value: affixValueAt(def, ilvl),
    tags: def.tags,
  };
}`,
    `    value: affixValueAt(def, ilvl),
    baseValue: affixValueAt(def, ilvl),
    tags: def.tags,
  };
}`,
    'make-affix-instance-baseValue',
  ],
  [
    `  const next = item.affixes.map((a) => ({ ...a, value: a.value * mul }));
  // 简单保护：不允许同一条被无限淬（用条数×cap 当总增幅上限的近似）
  void cap;`,
    `  const ceiling = Number.isFinite(cap) && cap > 1 ? cap : 1.3;
  const step = Number.isFinite(mul) && mul > 1 ? mul : 1.1;
  const next = item.affixes.map((a) => {
    // 上限基准 = 刚掷出来的原值；没有 baseValue 的老存档按当前值兜底
    const base = a.baseValue ?? a.value;
    const target = Math.min(a.value * step, base * ceiling);
    return { ...a, value: target, baseValue: base };
  });`,
    'improve-affixes-cap',
  ],
]);

// 渊痕定价锚（MARKS_PER_MINUTE 4400 → 8900，ceshi 实测 8483~9266）
edit('F:/dsh-work/zhuoxian/src/data/marks.ts', [
  [
    `export const MARKS_PER_MINUTE = 4_400;`,
    `export const MARKS_PER_MINUTE = 8_900;`,
    'marks-per-minute',
  ],
  [
    `  setStartFloor: 200_000,
  rerollCurrency: 100_000,
  divineReforge: 1_000_000,`,
    `  setStartFloor: 400_000,
  rerollCurrency: 200_000,
  divineReforge: 1_500_000,`,
    'marks-cost',
  ],
]);
