// D161（③）+ codex 12 条：loot 池子分流 / 深层品阶 ×2 / drop 传层 / 图鉴认全 12 条
import fs from 'node:fs';

function load(file) {
  const raw = fs.readFileSync(file, 'utf8');
  return { crlf: raw.includes('\r\n'), text: raw.replace(/\r\n/g, '\n') };
}
function save(file, crlf, text) {
  fs.writeFileSync(file, crlf ? text.replace(/\n/g, '\r\n') : text, 'utf8');
  console.log('patched', file);
}

// ── loot.ts ────────────────────────────────────────────────────────────
{
  const { crlf, text } = load('src/core/loot.ts');
  let t = text;
  const a1 = "import { LEGENDARY_DEFS } from '../data/legendary';";
  const b1 =
    'import {\n' +
    '  DEEP_LEGENDARY_DEFS,\n' +
    '  DEEP_LEGENDARY_MIN_FLOOR,\n' +
    '  DEEP_LEGENDARY_SHARE,\n' +
    '  DEEP_RARITY_MUL,\n' +
    '  LEGENDARY_DEFS,\n' +
    "} from '../data/legendary';";
  if (!t.includes(a1)) throw new Error('MISS loot import');
  t = t.replace(a1, b1);

  // LootParams 加 floor
  const a2 = '  readonly extraAffixes?: number;';
  const b2 = '  readonly extraAffixes?: number;\n  /**\n   * 怪物所在层（默认 1 = 最浅）。只用于两件事：\n   * ① 层 ≥40 的品阶加成 ×2（D161 (a)）② 层 ≥40 抽 40% 深层传奇池（D161 (b)）。\n   * 不传就等价于「浅层」，所以老调用点行为不变。\n   */\n  readonly floor?: number;';
  if (!t.includes(a2)) throw new Error('MISS LootParams.extraAffixes');
  t = t.replace(a2, b2);

  // rollLoot：层门槛 + 品阶 ×2 + 池子分流
  const a3 = "  const rarity = rollRarity(rng, params.rarityBonus ?? 1);";
  const b3 =
    '  const floor = Number.isFinite(params.floor) ? Math.max(1, Math.floor(params.floor as number)) : 1;\n' +
    '  // D161 (a)：层 ≥40 品阶加成 ×2 —— 这是把「12 条传奇收集」压回 6h 量级的唯一算术手段\n' +
    '  // （传奇必须长在仙品上，不动仙品率就没法让传奇变多；shuzhi 的表格按 6.0 件/h 算的）。\n' +
    '  const deep = floor >= DEEP_LEGENDARY_MIN_FLOOR;\n' +
    '  const rarityBonus0 = (params.rarityBonus ?? 1) * (deep ? DEEP_RARITY_MUL : 1);\n' +
    '  const rarity = rollRarity(rng, rarityBonus0);';
  if (!t.includes(a3)) throw new Error('MISS rollRarity line');
  t = t.replace(a3, b3);

  const a4 = "  const legendary = rarity === 'xian' ? rng.pick(LEGENDARY_DEFS).id : undefined;";
  const b4 =
    "  // D161 (b)：层 ≥40 时 40% 抽深层池、60% 抽基础池 —— **加法共存，不是替换**。\n" +
    '  // 替换会让「停层 46 刷装备」这个最优刷法永远刷不到基础 9 条（收集变成不可能）。\n' +
    "  const legendary =\n" +
    "    rarity === 'xian'\n" +
    '      ? (deep && rng.chance(DEEP_LEGENDARY_SHARE)\n' +
    '          ? rng.pick(DEEP_LEGENDARY_DEFS)\n' +
    '          : rng.pick(LEGENDARY_DEFS)\n' +
    '        ).id\n' +
    '      : undefined;';
  if (!t.includes(a4)) throw new Error('MISS legendary line');
  t = t.replace(a4, b4);
  save('src/core/loot.ts', crlf, t);
}

// ── drop.ts：把层传进 LootParams ────────────────────────────────────────
{
  const { crlf, text } = load('src/core/drop.ts');
  const a = '  const paramsOut: LootParams = {\n    ilvl: ilvlForFloor(floor),';
  const b = '  const paramsOut: LootParams = {\n    ilvl: ilvlForFloor(floor),\n    // D161：深层传奇池与品阶 ×2 都要看层号（不传 = 浅层口径）\n    floor,';
  if (!text.includes(a)) throw new Error('MISS drop params');
  save('src/core/drop.ts', crlf, text.replace(a, b));
}

// ── codex.ts：图鉴认 12 条（基础 9 + 深层 3） ────────────────────────────
{
  const { crlf, text } = load('src/core/codex.ts');
  let t = text;
  t = t.replace("import { LEGENDARY_DEFS, getLegendary, type LegendaryDef } from '../data/legendary';",
    "import { ALL_LEGENDARY_DEFS, getLegendary, type LegendaryDef } from '../data/legendary';");
  t = t.replace('const LEGENDARY_IDS: readonly string[] = LEGENDARY_DEFS.map((l) => l.id);',
    'const LEGENDARY_IDS: readonly string[] = ALL_LEGENDARY_DEFS.map((l) => l.id);');
  if (t === text) throw new Error('MISS codex legendary import');
  save('src/core/codex.ts', crlf, t);
}
