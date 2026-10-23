#!/usr/bin/env node
/**
 * v4.39（shuzhi D82）：把「死属性部位」靴子换成护甲身份
 *
 * 死属性审计（tools/audit-stats.mjs）结论：`moveSpeed` / `projectileSpeed` 在真消费者里 0 行命中，
 * 而 boots 的三个基底主属性 + 6 条词缀里的 5 条 + 3 个天赋节点都在发它们 ⇒ 整个靴子部位是空的。
 * 更糟：`itemPower` 里 `moveSpeed: 60` 是全表最高权重 ⇒ 自动换装与判据 C 都被「看起来很值钱的废件」带偏。
 *
 * 方案（shuzhi 拍 (1) 换身份）：boots 主属性 → armor（道袍的 48%），5 条死词缀改抗性/护甲，
 * 天赋身法支线改护甲，占位开关 speed-demon → resist-cap-plus（抗性上限 0.75→0.80），
 * 三个死键权重清零 + 注释「v1 未接线、禁止任何来源引用」。
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

function patch(file, edits) {
  const raw = readFileSync(file, 'utf8');
  const crlf = raw.includes('\r\n');
  let c = raw.replace(/\r\n/g, '\n');
  const before = c.length;
  for (const [oldText, newText, tag] of edits) {
    if (!c.includes(oldText)) throw new Error('MISS ' + file + ' :: ' + tag);
    if (c.split(oldText).length - 1 > 1) throw new Error('AMBIGUOUS ' + file + ' :: ' + tag);
    c = c.replace(oldText, newText);
  }
  if (c.length < before * 0.9) throw new Error('长度断言失败：' + file);
  mkdirSync('tools/_bak', { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  copyFileSync(file, join('tools/_bak', file.replaceAll('/', '_') + '.' + stamp + '.bak'));
  writeFileSync(file, crlf ? c.replace(/\n/g, '\r\n') : c, 'utf8');
  console.log('patched ' + file + '：' + before + ' → ' + c.length + ' chars');
}

// ── 1) bases.ts：靴子主属性 → armor（12/20/34，mainPerIlvl = mainFlat×3%）──
patch('src/data/bases.ts', [
  [
    "  { id: 'boots-t1', slot: 'boots', name: '麻鞋', main: 'moveSpeed', mainOp: 'flat', mainFlat: 0.02, mainPerIlvl: 0.0006, tier: 1 },",
    "  { id: 'boots-t1', slot: 'boots', name: '麻鞋', main: 'armor', mainOp: 'flat', mainFlat: 12, mainPerIlvl: 0.36, tier: 1 },",
    'boots-t1',
  ],
  [
    "  { id: 'boots-t2', slot: 'boots', name: '疾风履', main: 'moveSpeed', mainOp: 'flat', mainFlat: 0.04, mainPerIlvl: 0.0012, tier: 2 },",
    "  { id: 'boots-t2', slot: 'boots', name: '疾风履', main: 'armor', mainOp: 'flat', mainFlat: 20, mainPerIlvl: 0.60, tier: 2 },",
    'boots-t2',
  ],
  [
    "  { id: 'boots-t3', slot: 'boots', name: '踏云靴', main: 'moveSpeed', mainOp: 'flat', mainFlat: 0.06, mainPerIlvl: 0.0018, tier: 3 },",
    "  { id: 'boots-t3', slot: 'boots', name: '踏云靴', main: 'armor', mainOp: 'flat', mainFlat: 34, mainPerIlvl: 1.02, tier: 3 },",
    'boots-t3',
  ],
]);

// ── 2) affixes.ts：5 条死词缀改抗性/护甲（id 与名字保留，阶位与权重不变）──
patch('src/data/affixes.ts', [
  [
    "  { id: 'affix-move-01', name: '踏云', stat: 'moveSpeed', op: 'increased', value: 0.05, perIlvl: 0.0015, tier: 'huang', ilvl: 1, weight: 80, slots: ['boots'] },",
    "  { id: 'affix-move-01', name: '踏云', stat: 'resMetal', op: 'increased', value: 0.08, perIlvl: 0.0024, tier: 'huang', ilvl: 1, weight: 80, slots: ['boots'] },",
    'affix-move-01',
  ],
  [
    "  { id: 'affix-proj-01', name: '遁影', stat: 'projectileSpeed', op: 'increased', value: 0.08, perIlvl: 0.0024, tier: 'huang', ilvl: 1, weight: 60, slots: ['boots'] },",
    "  { id: 'affix-proj-01', name: '遁影', stat: 'resWater', op: 'increased', value: 0.08, perIlvl: 0.0024, tier: 'huang', ilvl: 1, weight: 60, slots: ['boots'] },",
    'affix-proj-01',
  ],
  [
    "  { id: 'affix-move-02', name: '惊鸿', stat: 'moveSpeed', op: 'increased', value: 0.085, perIlvl: 0.00255, tier: 'xuan', ilvl: 16, weight: 60, slots: ['boots'] },",
    "  { id: 'affix-move-02', name: '惊鸿', stat: 'resFire', op: 'increased', value: 0.14, perIlvl: 0.0042, tier: 'xuan', ilvl: 16, weight: 60, slots: ['boots'] },",
    'affix-move-02',
  ],
  [
    "  { id: 'affix-move-03', name: '缩地', stat: 'moveSpeed', op: 'increased', value: 0.145, perIlvl: 0.00435, tier: 'di', ilvl: 31, weight: 40, slots: ['boots'] },",
    "  { id: 'affix-move-03', name: '缩地', stat: 'armor', op: 'increased', value: 0.24, perIlvl: 0.0072, tier: 'di', ilvl: 31, weight: 40, slots: ['boots'] },",
    'affix-move-03',
  ],
  [
    "  { id: 'affix-proj-02', name: '御风', stat: 'projectileSpeed', op: 'more', value: 0.12, perIlvl: 0.0036, tier: 'tian', ilvl: 46, weight: 20, slots: ['boots'] },",
    "  { id: 'affix-proj-02', name: '御风', stat: 'armor', op: 'more', value: 0.15, perIlvl: 0.0045, tier: 'tian', ilvl: 46, weight: 20, slots: ['boots'] },",
    'affix-proj-02',
  ],
]);

// ── 3) stats.ts：死键注释 + 抗性上限加成（resist-cap-plus 用）──
patch('src/data/stats.ts', [
  [
    "  | 'moveSpeed' // 身法（移速）",
    "  | 'moveSpeed' // 身法（移速）—— ⚠️ v1 未接线，禁止任何词缀/天赋/玉简再引用（D82）",
    'moveSpeed-key',
  ],
  [
    "  | 'projectileSpeed' // 遁速（投射物速度）",
    "  | 'projectileSpeed' // 遁速（投射物速度）—— ⚠️ v1 未接线（本作神通即时结算，无投射物飞行），禁止引用（D82）",
    'proj-key',
  ],
  [
    'export const RESIST_CAP = 0.75;',
    [
      'export const RESIST_CAP = 0.75;',
      '/** 抗性上限可被「抗性上限提升」放开的最大值（周天图 resist-cap-plus 节点用） */',
      'export const RESIST_CAP_BONUS_MAX = 0.05;',
    ].join('\n'),
    'resist-cap-bonus',
  ],
  [
    [
      '/** 按元数据把值夹到合法范围 */',
      'export function clampStat(key: StatKey, value: number): number {',
      '  const m = STAT_META[key];',
      '  if (!Number.isFinite(value)) return m.base;',
      '  let v = value;',
      '  if (v < m.min) v = m.min;',
      '  if (m.max !== undefined && v > m.max) v = m.max;',
      '  return v;',
      '}',
    ].join('\n'),
    [
      '/**',
      ' * 按元数据把值夹到合法范围。',
      ' *',
      ' * `resistCapBonus`：只放开**五行抗性**的上限（周天图 `resist-cap-plus`），',
      ' * 其它属性的 max 一律不动 —— 「抗性上限提升」不该顺手把破绽率/护甲也放开。',
      ' */',
      'export function clampStat(key: StatKey, value: number, resistCapBonus = 0): number {',
      '  const m = STAT_META[key];',
      '  if (!Number.isFinite(value)) return m.base;',
      '  let v = value;',
      '  const bonus = Number.isFinite(resistCapBonus) ? Math.min(Math.max(resistCapBonus, 0), RESIST_CAP_BONUS_MAX) : 0;',
      '  const isResist = (ELEMENT_STAT_KEYS as readonly StatKey[]).includes(key);',
      '  const max = m.max === undefined ? undefined : isResist ? m.max + bonus : m.max;',
      '  if (v < m.min) v = m.min;',
      '  if (max !== undefined && v > max) v = max;',
      '  return v;',
      '}',
    ].join('\n'),
    'clampStat',
  ],
]);

// ── 4) modifier.ts：把封顶加成透到 resolveStat / resolveAllStats ──
patch('src/core/modifier.ts', [
  [
    [
      'export function resolveStat(key: StatKey, mods: readonly Modifier[], tags?: readonly Tag[]): number {',
      '  const agg = aggregate(mods, key, tags);',
      '  return clampStat(key, applyAggregate(STAT_META[key].base, agg));',
      '}',
    ].join('\n'),
    [
      'export interface ResolveOptions {',
      '  /** 五行抗性上限的额外放开量（周天图 resist-cap-plus = +0.05） */',
      '  readonly resistCapBonus?: number;',
      '}',
      '',
      'export function resolveStat(',
      '  key: StatKey,',
      '  mods: readonly Modifier[],',
      '  tags?: readonly Tag[],',
      '  opts?: ResolveOptions,',
      '): number {',
      '  const agg = aggregate(mods, key, tags);',
      '  return clampStat(key, applyAggregate(STAT_META[key].base, agg), opts?.resistCapBonus ?? 0);',
      '}',
    ].join('\n'),
    'resolveStat',
  ],
  [
    [
      'export function resolveAllStats(mods: readonly Modifier[]): Record<StatKey, number> {',
      '  const out = {} as Record<StatKey, number>;',
      '  for (const key of Object.keys(STAT_META) as StatKey[]) {',
      '    out[key] = resolveStat(key, mods);',
      '  }',
      '  return out;',
      '}',
    ].join('\n'),
    [
      'export function resolveAllStats(mods: readonly Modifier[], opts?: ResolveOptions): Record<StatKey, number> {',
      '  const out = {} as Record<StatKey, number>;',
      '  for (const key of Object.keys(STAT_META) as StatKey[]) {',
      '    out[key] = resolveStat(key, mods, undefined, opts);',
      '  }',
      '  return out;',
      '}',
    ].join('\n'),
    'resolveAllStats',
  ],
]);

// ── 5) character.ts：characterStats 把开关的封顶加成传下去 ──
patch('src/core/character.ts', [
  [
    [
      'export function characterStats(ch: CharacterState): Record<StatKey, number> {',
      '  return resolveAllStats(characterModifiers(ch));',
      '}',
    ].join('\n'),
    [
      '/**',
      ' * 全部属性（面板与战斗共用）。',
      ' *',
      ' * 周天图的 `resist-cap-plus` 是**改系统上限**而不是改属性，所以它不走 Modifier，',
      ' * 而是从开关覆盖值里取 `resistCapBonus` 传进 clampStat —— 否则「抗性上限 +5%」',
      ' * 会在 0.75 处被夹掉，变成又一个面板看得见、实战不生效的死属性。',
      ' */',
      'export function characterStats(ch: CharacterState): Record<StatKey, number> {',
      '  const overrides = switchOverridesFor(spentTalentIds(ch));',
      '  return resolveAllStats(characterModifiers(ch), { resistCapBonus: overrides.resistCapBonus ?? 0 });',
      '}',
    ].join('\n'),
    'characterStats',
  ],
  [
    "import { talentModifiers } from './talents-runtime';",
    [
      "import { spentTalentIds, switchOverridesFor, talentModifiers } from './talents-runtime';",
    ].join('\n'),
    'import',
  ],
]);

// ── 6) talents-runtime.ts：加 resistCapBonus + 导出 spentTalentIds ──
patch('src/core/talents-runtime.ts', [
  [
    '  /** fast-pickup：拾取延迟 0.9s → 0.45s */',
    [
      '  /** resist-cap-plus：五行抗性上限 0.75 → 0.80（D82：身法支线身份从「跑得快」改「抗得住」） */',
      '  resistCapBonus?: number;',
      '  /** fast-pickup：拾取延迟 0.9s → 0.45s */',
    ].join('\n'),
    'override-field',
  ],
  [
    "  if (talentIds.includes('fast-pickup')) o.pickupDelay = 0.45;",
    [
      "  if (talentIds.includes('fast-pickup')) o.pickupDelay = 0.45;",
      "  if (talentIds.includes('resist-cap-plus')) o.resistCapBonus = 0.05;",
    ].join('\n'),
    'override-map',
  ],
  [
    '/** 五个开关节点的运行时效果（speed-demon 暂无战斗用途，不产字段） */',
    '/** 六个开关节点的运行时效果（D82：原来的 speed-demon 占位改成 resist-cap-plus） */',
    'override-doc',
  ],
]);

// ── 7) talent-def.ts：开关白名单 ──
patch('src/data/talent-def.ts', [
  [
    "  'speed-demon',",
    "  'resist-cap-plus',",
    'switch-list',
  ],
]);

// ── 8) talents.ts：身法支线改护甲 + b-foot-6 换开关 ──
patch('src/data/talents.ts', [
  [
    "  { id: 'b-foot-1', name: '轻身', desc: '身法（移速）提高 6%', requires: ['t-armor-4'], cost: 1, kind: 'stat', mods: [m('moveSpeed', 'increased', 0.06)] },",
    "  { id: 'b-foot-1', name: '轻身', desc: '护体提高 4%', requires: ['t-armor-4'], cost: 1, kind: 'stat', mods: [m('armor', 'increased', 0.04)] },",
    'b-foot-1',
  ],
  [
    "  { id: 'b-foot-2', name: '踏云', desc: '身法提高 6%', requires: ['b-foot-1'], cost: 1, kind: 'stat', mods: [m('moveSpeed', 'increased', 0.06)] },",
    "  { id: 'b-foot-2', name: '踏云', desc: '护体提高 4%', requires: ['b-foot-1'], cost: 1, kind: 'stat', mods: [m('armor', 'increased', 0.04)] },",
    'b-foot-2',
  ],
  [
    "  { id: 'b-foot-3', name: '游龙', desc: '身法提高 8%', requires: ['b-foot-2'], cost: 1, kind: 'stat', mods: [m('moveSpeed', 'increased', 0.08)] },",
    "  { id: 'b-foot-3', name: '游龙', desc: '护体提高 6%', requires: ['b-foot-2'], cost: 1, kind: 'stat', mods: [m('armor', 'increased', 0.06)] },",
    'b-foot-3',
  ],
  [
    "  { id: 'b-foot-6', name: '形随意动', desc: '开关：遁速提高 20%（v1 占位，暂无移速战斗用途）', requires: ['b-foot-5'], cost: 1, kind: 'switch', switchId: 'speed-demon' },",
    "  { id: 'b-foot-6', name: '形随意动', desc: '开关：五行抗性上限 75% → 80%', requires: ['b-foot-5'], cost: 1, kind: 'switch', switchId: 'resist-cap-plus' },",
    'b-foot-6',
  ],
  [
    "  'speed-demon',",
    "  'resist-cap-plus',",
    'switch-list-2',
  ],
]);

// ── 9) inventory.ts：三个死键权重清零 ──
patch('src/core/inventory.ts', [
  [
    [
      '  moveSpeed: 60,',
      '  projectileSpeed: 12,',
    ].join('\n'),
    [
      '  // D82：moveSpeed / projectileSpeed 在真消费者里 0 行命中（玩家不移动、神通无投射物飞行）。',
      '  // 权重清零有两个作用：①不再把废件算成「高战力」（以前 moveSpeed 是全表最高 60，',
      '  // 自动换装和判据 C 都被它带偏）；②以后谁再给这两个键挂来源，itemPower 也不会奖励它。',
      '  moveSpeed: 0,',
      '  projectileSpeed: 0,',
    ].join('\n'),
    'weights',
  ],
  [
    '  xpGain: 15,',
    '  xpGain: 0, // D37/D82：修为加成通道已取消（gainXp 不读属性），权重归零',
    'xpGain',
  ],
]);
console.log('done');
