// D160（② 异变体）第 2 段：接口字段 / import / KilledMonster 透传 / 图鉴 / 掉落 / 渲染
import fs from 'node:fs';

function edit(file, pairs) {
  const raw = fs.readFileSync(file, 'utf8');
  const crlf = raw.includes('\r\n');
  let t = raw.replace(/\r\n/g, '\n');
  for (const [a, b, tag] of pairs) {
    if (!t.includes(a)) throw new Error('MISS[' + tag + '] ' + file);
    t = t.replace(a, b);
  }
  fs.writeFileSync(file, crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
  console.log('patched', file);
}

// ── battle.ts：import + 接口 + 击杀事件透传 ───────────────────────────────
edit('src/core/battle.ts', [
  [
    "import { rollMonsterIdentity } from './monster-roll';",
    "import { rollMonsterIdentity, shouldSpawnVariant } from './monster-roll';",
    'import',
  ],
  [
    '  readonly affixIds?: readonly string[];\n  readonly element: ElementTag;',
    [
      '  readonly affixIds?: readonly string[];',
      '  /** 异变体（D160）：额外带 1 条同类妖纹 + 掉落数量 +10%；只给 UI/掉落用，数值已烘进上面几项 */',
      '  readonly variant?: boolean;',
      '  readonly element: ElementTag;',
    ].join('\n'),
    'mip',
  ],
  [
    '  /** 妖纹 id（空/未定义 = 普通浊物）。掉落数量加成靠它，不靠 rarity 反推 */\n  readonly affixIds?: readonly string[];',
    [
      '  /** 妖纹 id（空/未定义 = 普通浊物）。掉落数量加成靠它，不靠 rarity 反推 */',
      '  readonly affixIds?: readonly string[];',
      '  /** 异变体（D160）：掉落数量额外 +10%（独立于 MONSTER_QTY_CAP，见 session 的 q 计算） */',
      '  readonly variant?: boolean;',
    ].join('\n'),
    'km',
  ],
  ['    affixIds: target.affixIds,', '    affixIds: target.affixIds,\n    variant: target.variant === true,', 'km-pass'],
]);
