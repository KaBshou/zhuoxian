// D160（② 异变体）：深层异变体 —— 每 4 波 1 只（层 ≥28），额外带 1 条同类妖纹、掉落数量 +10%。
// 设计要点（shuzhi v4.72）：
//  * **期望几乎不变、只改时间分布**（+1 条 ≈ 单体 +30~50%，摊到 4 只 × 25% 波 ⇒ 平均 +1.9~3.1%）
//  * rng 成本：每波 1 次选只 + 每只异变体 2 次（选类别 / 抽条目）⇒ 抽序整体移位，探针要重取基线
//  * 第 2 条必须走既有实例化路径（`affixesForFloor` + 同一套类别池），不许手写第二套数值计算
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

// ── 1) monster-roll.ts：常数 + 判据 + 异变体身份 ───────────────────────────
edit('src/core/monster-roll.ts', [
  [
    '/** 一只怪的稀有度 + 妖纹一起掷（生成侧的唯一入口） */',
    [
      '/** 异变体：从第几层起出现（与深层妖纹同段） */',
      'export const VARIANT_MIN_FLOOR = 28;',
      '/** 异变体：每几波出现 1 只 */',
      'export const VARIANT_WAVE_EVERY = 4;',
      '/** 异变体：掉落数量加成（**独立于 `MONSTER_QTY_CAP`**，见 session 的 q 计算） */',
      'export const VARIANT_EXTRA_DROP = 0.1;',
      '',
      '/**',
      ' * 这一波要不要出异变体（**纯函数，不耗 rng**；哪一只由 `spawnRing` 用一次 `rng.int` 决定）。',
      ' * 判据三层：层 ≥28（与深层妖纹同段，中段不加尖峰）/ 波号能被 4 整除 / 波号必须 > 0。',
      ' * 镇守波也会出异变体 —— 那正是「尖峰应对」最需要被检验的场合。',
      ' */',
      'export function shouldSpawnVariant(floor: number, wave: number): boolean {',
      '  const f = Number.isFinite(floor) ? Math.floor(floor) : 1;',
      '  const w = Number.isFinite(wave) ? Math.floor(wave) : 0;',
      '  return f >= VARIANT_MIN_FLOOR && w > 0 && w % VARIANT_WAVE_EVERY === 0;',
      '}',
      '',
      '/**',
      ' * 给异变体追加「第 2 条同类妖纹」（**突破类别互斥**，这是显式例外）。',
      ' *',
      ' * 两步都用既有池子（`affixesForFloor`）：',
      ' *   - 该怪原本 0 条（normal 异变）⇒ 先从类别池抽 1 条，再从同类抽第 2 条（0 → 2 正是尖峰来源）',
      ' *   - 原本 ≥1 条 ⇒ 从它**已有的类别**里挑一个，再抽一条同类（可能抽到同一条，效果翻倍）',
      ' * 不复制数值，只复制 id —— 数值仍是 `sumMonsterAffixes` 一个出口。',
      ' */',
      'export function addVariantAffix(',
      '  rng: Rng,',
      '  floor: number,',
      '  affixIds: readonly string[],',
      '): readonly string[] {',
      '  const pool = affixesForFloor(floor);',
      '  const pickFrom = (cat: MonsterAffixCategory): string | null => {',
      '    const list = pool.filter((d) => d.category === cat);',
      '    if (list.length === 0) return null;',
      '    return list[rng.int(0, list.length - 1)]!.id;',
      '  };',
      '  if (affixIds.length === 0) {',
      '    const cats = [...MONSTER_AFFIX_CATEGORIES];',
      '    const first = pickFrom(cats[rng.int(0, cats.length - 1)]!);',
      '    if (first === null) return [];',
      '    const catOfFirst = pool.find((d) => d.id === first)?.category;',
      '    const second = catOfFirst ? pickFrom(catOfFirst) : null;',
      '    return second === null ? [first] : [first, second];',
      '  }',
      '  const have = affixIds',
      '    .map((id) => pool.find((d) => d.id === id)?.category)',
      '    .filter((c): c is MonsterAffixCategory => c !== undefined);',
      '  if (have.length === 0) return affixIds;',
      '  const cat = have[rng.int(0, have.length - 1)]!;',
      '  const extra = pickFrom(cat);',
      '  return extra === null ? affixIds : [...affixIds, extra];',
      '}',
      '',
      '/** 一只怪的稀有度 + 妖纹一起掷（生成侧的唯一入口） */',
    ].join('\n'),
    'consts',
  ],
  [
    'export function rollMonsterIdentity(\n  rng: Rng,\n  floor: number,\n  isBoss: boolean,\n): { readonly rarity: MonsterRarity; readonly affixIds: readonly string[] } {\n  if (isBoss) return { rarity: \'boss\', affixIds: [] };\n  const rarity = rollMonsterRarity(rng, floor);\n  return { rarity, affixIds: rollMonsterAffixIds(rng, floor, rarity) };\n}',
    [
      'export function rollMonsterIdentity(',
      '  rng: Rng,',
      '  floor: number,',
      '  isBoss: boolean,',
      '  /** 是否是异变体（true 时额外带 1 条同类妖纹；镇守也可以是异变体） */',
      '  variant = false,',
      '): { readonly rarity: MonsterRarity; readonly affixIds: readonly string[] } {',
      "  if (isBoss) return { rarity: 'boss', affixIds: variant ? addVariantAffix(rng, floor, []) : [] };",
      '  const rarity = rollMonsterRarity(rng, floor);',
      '  const base = rollMonsterAffixIds(rng, floor, rarity);',
      '  return { rarity, affixIds: variant ? addVariantAffix(rng, floor, base) : base };',
      '}',
    ].join('\n'),
    'identity',
  ],
]);

// ── 2) battle.ts：spawnMonster / spawnRing / MonsterInPlay / KilledMonster ──
edit('src/core/battle.ts', [
  [
    '  /** 周目数（默认 0 = 初临，全部倍率恒等 ⇒ 与改造前逐位相同） */\n  cycle: number = 0,\n): MonsterInPlay {',
    [
      '  /** 周目数（默认 0 = 初临，全部倍率恒等 ⇒ 与改造前逐位相同） */',
      '  cycle: number = 0,',
      '  /** 异变体（D160）：只影响标签与掉落，数值已在 affixIds 里体现 ⇒ 默认 false 与改造前逐位相同 */',
      '  variant = false,',
      '): MonsterInPlay {',
    ].join('\n'),
    'spawnSig',
  ],
  [
    '    rarity,\n    affixIds,\n    element: def.element,',
    '    rarity,\n    affixIds,\n    variant,\n    element: def.element,',
    'spawnBody',
  ],
  [
    '  /** 周目数（透传给 spawnMonster） */\n  cycle: number = 0,\n): MonsterInPlay[] {',
    [
      '  /** 周目数（透传给 spawnMonster） */',
      '  cycle: number = 0,',
      '  /** 当前波号（决定这一波有没有异变体；默认 0 = 没有 ⇒ 与改造前逐位相同） */',
      '  wave: number = 0,',
      '): MonsterInPlay[] {',
    ].join('\n'),
    'ringSig',
  ],
  [
    '    const identity = rollMonsterIdentity(rng, floor, !!def.boss);',
    [
      '    // D160：异变体 —— 每 4 波 1 只（层 ≥28）。先一次性决定「哪一只」，再掷身份，',
      '    // 保证 rng 消耗顺序稳定（同种子同序列）：每波最多 +1 次（选只）+2 次（选类别/抽条目）。',
      '    const identity = rollMonsterIdentity(rng, floor, !!def.boss, i === variantIdx);',
    ].join('\n'),
    'ringIdentity',
  ],
  [
    "  const order = defs.map((_, i) => i);",
    [
      '  // D160：这一波的异变体下标（-1 = 本波没有）。必须在洗牌**之前**决定，',
      '  // 否则「哪一只是异变体」会依赖洗牌结果，玩家会觉得是随机的错觉。',
      '  const variantIdx = shouldSpawnVariant(floor, wave) ? rng.int(0, Math.max(0, n - 1)) : -1;',
      '  const order = defs.map((_, i) => i);',
    ].join('\n'),
    'ringVariant',
  ],
  [
    '    out.push(spawnMonster(def, floor, startUid + i, x, y, identity.rarity, identity.affixIds, cycle));',
    '    out.push(\n      spawnMonster(def, floor, startUid + i, x, y, identity.rarity, identity.affixIds, cycle, i === variantIdx),\n    );',
    'ringPush',
  ],
]);
