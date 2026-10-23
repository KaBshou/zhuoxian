// 一次性：修 affix-cap.test.ts 的 makeItem 调用（rng 是第二参，不是输入字段）
//        + 重设计夺造化（原「重掷最弱一条再拔高」实测净收益 ≈ 0，因为重掷会随机换掉好属性）
//
// 新语义：夺造化 = 把身上**最强且还没淬满**的那件法宝的全部灵纹一次拔到淬炼上限（1.3×原值）。
//   - 每次购买都有**确定正收益**（不是随机洗）
//   - 总数有界：每件灵纹最多 1.3×原值，9 件穿满 → 这条线必然耗尽（不是无限战力）
//   - 与 data/marks.ts 铁律 1（cap 1.3、不可叠加）一致
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
  if (c.length < before * 0.85) throw new Error('结果比原文短 15% 以上，拒绝写盘: ' + P);
  fs.writeFileSync(P, c, 'utf8');
  console.log('written', P, before, '->', c.length);
}

// ---------- 1. 测试文件：makeItem 的 rng 是第二参 ----------
edit('F:/dsh-work/zhuoxian/tests/affix-cap.test.ts', [
  [
    `      affixes: [inst],
      rng,
    },
    rng,
  );`,
    `      affixes: [inst],
    },
    rng,
  );`,
    'test-makeItem-args',
  ],
]);

// ---------- 2. 夺造化重设计 ----------
edit('F:/dsh-work/zhuoxian/src/core/marks-runtime.ts', [
  [
    `    case 'divineReforge': {
      // 夺造化 = 挑战力最高的那件法宝，重掷它最弱的一条灵纹，再整体拔高到 1.3 倍上限。
      const best = pickBestEquipped(s);
      if (!best) {
        return { ok: false, reason: '身上没有法宝，夺造化无处下手', message: '' };
      }
      const rerolled = reforgeWeakest(best, s);
      if (!rerolled) {
        return { ok: false, reason: '这件法宝没有灵纹，重铸无从下手（凡品没有灵纹）', message: '' };
      }
      s.character.equipment[slotKeyOf(s, best.uid)] = rerolled;
      const msg = \`夺造化：\${rerolled.name} 的灵纹被重铸并拔高\`;
      pushLog(s, msg, '#d4a13c');
      break;
    }`,
    `    case 'divineReforge': {
      // 夺造化 = 把「最强且还没淬满」的那件法宝的灵纹一次拔到淬炼上限（1.3×原值）。
      //
      // 为什么不是「重掷最弱一条再拔高」：ceshi 实测那条路径的净收益 ≈ 0（+0.63% / −0.55% / 0 …）
      // —— 重掷会把一条已成型的灵纹换成随机新灵纹，涨的和掉的抵掉了，玩家花 150 万渊痕
      // 却看不出变化，等于花钱买了个空。改成「确定拔到上限」后每次购买都有可感知收益，
      // 且因为每件灵纹上限 = 1.3×原值，**这条线会自己耗尽**（9 件穿满即无货可买），
      // 不会变成无限战力口子（D45）。
      const target = pickUpgradable(s);
      if (!target) {
        const any = pickBestEquipped(s);
        return {
          ok: false,
          reason: any
            ? '身上所有法宝的灵纹都已至淬炼极限（每件最多 +30%）'
            : '身上没有法宝，夺造化无处下手',
          message: '',
        };
      }
      const up = improveAffixes(target.item, 1.3, 1.3);
      if (!up.ok) {
        return { ok: false, reason: up.message, message: '' };
      }
      s.character.equipment[target.key] = up.item;
      const msg = \`夺造化：\${up.item.name} 的灵纹被拔至淬炼极限\`;
      pushLog(s, msg, '#d4a13c');
      break;
    }`,
    'divine-reforge-redesign',
  ],
  [
    `/** 重掷最弱一条 + 整体拔高；没有灵纹返回 null */
function reforgeWeakest(item: Item, s: GameSession): Item | null {
  if (item.affixes.length === 0) return null;
  // 最弱 = 战力权重 × value 最小的一条
  let worst = 0;
  let worstScore = Infinity;
  item.affixes.forEach((a, i) => {
    const score = itemPowerOf({
      ...item,
      affixes: [a],
    });
    if (score < worstScore) {
      worstScore = score;
      worst = i;
    }
  });
  const pool = s.tables.affixes;
  const res = rerollAffixAt(item, worst, pool, s.rng);
  if (!res.ok) return null;
  const up = improveAffixes(res.item, 1.3, 1.3);
  return up.ok ? up.item : res.item;
}`,
    `/** 淬炼上限（与 \`improveAffixes\` 的默认 cap 同源，改一处要改两处） */
const REFORGE_CAP = 1.3;

/** 这件法宝是否已经淬满（每一条灵纹都到了 baseValue × cap） */
function affixesAtCap(item: Item): boolean {
  if (item.affixes.length === 0) return true; // 没有灵纹 = 无可淬
  return item.affixes.every((a) => {
    const base = a.baseValue ?? a.value;
    return a.value >= base * REFORGE_CAP - 1e-9;
  });
}

/** 战力最高的「还有灵纹没淬满」的那件（同战力取第一个，保证可复现） */
function pickUpgradable(
  s: GameSession,
): { item: Item; key: keyof GameSession['character']['equipment'] } | null {
  let best: Item | null = null;
  let bestKey: keyof GameSession['character']['equipment'] = 'sword';
  let bestPower = -Infinity;
  for (const e of equippedItems(s.character)) {
    if (affixesAtCap(e.item)) continue;
    const p = itemPowerOf(e.item);
    if (p > bestPower) {
      bestPower = p;
      best = e.item;
      bestKey = slotKeyOf(s, e.item.uid);
    }
  }
  return best ? { item: best, key: bestKey } : null;
}`,
    'replace-reforgeWeakest',
  ],
  [
    `import { rerollAffixAt, improveAffixes } from './item';`,
    `import { improveAffixes } from './item';`,
    'drop-reroll-import',
  ],
]);
