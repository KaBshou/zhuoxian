// D160（② 异变体）第 4 段：图鉴第 31 行（独立 kind 'variant'）+ 存档 + 会话收录
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

edit('src/core/codex.ts', [
  ["export type CodexKind = 'monster' | 'legendary';", "export type CodexKind = 'monster' | 'legendary' | 'variant';", 'kind'],
  [
    '  readonly legendaries: readonly string[];',
    [
      '  readonly legendaries: readonly string[];',
      '  /** 已见过的特殊形态（D160：目前只有 variant = 异变体；独立一行，因为「见过异变体」本身是刻度） */',
      '  readonly variants: readonly string[];',
    ].join('\n'),
    'state',
  ],
  [
    'const LEGENDARY_SET: ReadonlySet<string> = new Set(LEGENDARY_IDS);',
    [
      'const LEGENDARY_SET: ReadonlySet<string> = new Set(LEGENDARY_IDS);',
      'const VARIANT_IDS: readonly string[] = [\'variant\'];',
      'const VARIANT_SET: ReadonlySet<string> = new Set(VARIANT_IDS);',
    ].join('\n'),
    'sets',
  ],
  [
    'export const CODEX_TOTAL = CODEX_MONSTER_TOTAL + CODEX_LEGENDARY_TOTAL;',
    [
      'export const CODEX_VARIANT_TOTAL = VARIANT_IDS.length;',
      'export const CODEX_TOTAL = CODEX_MONSTER_TOTAL + CODEX_LEGENDARY_TOTAL + CODEX_VARIANT_TOTAL;',
    ].join('\n'),
    'total',
  ],
  ['  return { monsters: [], legendaries: [] };', '  return { monsters: [], legendaries: [], variants: [] };', 'create'],
  [
    "  const src = (raw ?? {}) as { monsters?: unknown; legendaries?: unknown };\n  return { monsters: pick(src.monsters, MONSTER_IDS, MONSTER_SET), legendaries: pick(src.legendaries, LEGENDARY_IDS, LEGENDARY_SET) };",
    [
      "  const src = (raw ?? {}) as { monsters?: unknown; legendaries?: unknown; variants?: unknown };",
      '  return {',
      '    monsters: pick(src.monsters, MONSTER_IDS, MONSTER_SET),',
      '    legendaries: pick(src.legendaries, LEGENDARY_IDS, LEGENDARY_SET),',
      '    variants: pick(src.variants, VARIANT_IDS, VARIANT_SET),',
      '  };',
    ].join('\n'),
    'sanitize',
  ],
  [
    '  return { monsters: MONSTER_IDS.filter((id) => id === monsterId || codex.monsters.includes(id)), legendaries: codex.legendaries };',
    '  return {\n    monsters: MONSTER_IDS.filter((id) => id === monsterId || codex.monsters.includes(id)),\n    legendaries: codex.legendaries,\n    variants: codex.variants,\n  };',
    'rec-monster',
  ],
  [
    '  return { monsters: codex.monsters, legendaries: LEGENDARY_IDS.filter((id) => id === legendaryId || codex.legendaries.includes(id)) };',
    '  return {\n    monsters: codex.monsters,\n    legendaries: LEGENDARY_IDS.filter((id) => id === legendaryId || codex.legendaries.includes(id)),\n    variants: codex.variants,\n  };',
    'rec-legend',
  ],
  [
    'export function hasMonster(codex: CodexState, id: string): boolean {',
    [
      '/** 收录「异变体」本身（第一次见到就记，不计数 —— 计数是成就的活） */',
      'export function recordVariant(codex: CodexState): CodexState {',
      '  if (codex.variants.length > 0) return codex;',
      '  return { monsters: codex.monsters, legendaries: codex.legendaries, variants: [\'variant\'] };',
      '}',
      '',
      'export function hasVariant(codex: CodexState): boolean {',
      '  return codex.variants.length > 0;',
      '}',
      '',
      'export function hasMonster(codex: CodexState, id: string): boolean {',
    ].join('\n'),
    'rec-variant',
  ],
  [
    '  readonly legendaries: CodexSectionProgress;',
    '  readonly legendaries: CodexSectionProgress;\n  readonly variants: CodexSectionProgress;',
    'progress-iface',
  ],
  [
    '  const got = codex.monsters.length + codex.legendaries.length;',
    '  const got = codex.monsters.length + codex.legendaries.length + codex.variants.length;',
    'progress-got',
  ],
  [
    '    legendaries: { got: codex.legendaries.length, total: CODEX_LEGENDARY_TOTAL },',
    '    legendaries: { got: codex.legendaries.length, total: CODEX_LEGENDARY_TOTAL },\n    variants: { got: codex.variants.length, total: CODEX_VARIANT_TOTAL },',
    'progress-section',
  ],
  [
    '  for (const id of LEGENDARY_IDS) {',
    [
      '  // D160：异变体独立成行（第 31 行）——玩家要知道「有这东西存在」，但不给「见过 N 次」的计数',
      '  out.push({',
      "    kind: 'variant',",
      "    id: 'variant',",
      "    name: '异变体',",
      '    detail: hasVariant(codex)',
      "      ? '深层异变 · 额外 1 条同类妖纹 · 掉落数量 +10%'",
      "      : '尚未遭遇',",
      '    unlocked: hasVariant(codex),',
      '  });',
      '  for (const id of LEGENDARY_IDS) {',
    ].join('\n'),
    'entries',
  ],
  [
    "  return kind === 'monster' ? `图鉴：遭遇 ${name}` : `图鉴：获得传奇 ${name}`;",
    "  if (kind === 'monster') return `图鉴：遭遇 ${name}`;\n  if (kind === 'variant') return '图鉴：遭遇异变体';\n  return `图鉴：获得传奇 ${name}`;",
    'unlock-text',
  ],
]);
