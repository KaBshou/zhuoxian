// D167：图鉴里深层传奇必须写明「与基础传奇同时可掉（不是替换）」——否则玩家会以为层 40 之后只出新的 3 条，
//       那是 D162 刚修掉的误解，别让 UI 把它种回去。
// D168：成就补 codex-l-12（12 条传奇全收）与 xian-80（累计 80 件仙品），25 → 27 条、525k → 585k。
// D169：供给类改动落地后成就锚必须重算并记录（本轮 xian-9 锚 11.2h → 1.35h、codex-l-9 12.0h → 3.8h，只记录）。
import fs from 'node:fs';

function load(f) {
  const raw = fs.readFileSync(f, 'utf8');
  return { crlf: raw.includes('\r\n'), text: raw.replace(/\r\n/g, '\n') };
}
function save(f, crlf, t) {
  fs.writeFileSync(f, crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
  console.log('patched', f);
}
function must(hay, needle, tag) {
  if (!hay.includes(needle)) throw new Error('MISS ' + tag);
  return hay.replace(needle, '');
}

// ── 1. codex.ts：深层传奇 detail 两句 ──────────────────────────────
{
  const { crlf, text } = load('src/core/codex.ts');
  let t = text;

  must(t, "import { ALL_LEGENDARY_DEFS, getLegendary, type LegendaryDef } from '../data/legendary';", 'import legendary');
  t = t.replace(
    "import { ALL_LEGENDARY_DEFS, getLegendary, type LegendaryDef } from '../data/legendary';",
    "import { ALL_LEGENDARY_DEFS, DEEP_LEGENDARY_DEFS, getLegendary, type LegendaryDef } from '../data/legendary';",
  );

  const oldFn = [
    '  for (const id of LEGENDARY_IDS) {',
    '    const def = getLegendary(id);',
    '    if (!def) continue;',
    '    const unlocked = hasLegendary(codex, id);',
    '    out.push({ kind: \'legendary\', id, name: def.name, detail: unlocked ? (def as LegendaryDef).desc : \'尚未获得\', unlocked });',
    '  }',
  ].join('\n');
  const newFn = [
    '  // D167：深层传奇的 detail 必须两句 ——「层 ≥40 才可掉」+「与基础传奇同时可掉（不是替换）」。',
    '  // 第二句是必须的：不写，玩家会以为层 40 之后只出这 3 条 —— 那正是 D162 修掉的误解。',
    '  const DEEP_SET: ReadonlySet<string> = new Set(DEEP_LEGENDARY_DEFS.map((d) => d.id));',
    '  for (const id of LEGENDARY_IDS) {',
    '    const def = getLegendary(id);',
    '    if (!def) continue;',
    '    const unlocked = hasLegendary(codex, id);',
    '    const body = (def as LegendaryDef).desc;',
    '    const detail = DEEP_SET.has(id)',
    '      ? `${body}　｜　层 ≥40 才可掉；与基础传奇同时可掉（不是替换）`',
    '      : body;',
    '    out.push({ kind: \'legendary\', id, name: def.name, detail: unlocked ? detail : \'尚未获得\', unlocked });',
    '  }',
  ].join('\n');
  t = t.replace(oldFn, newFn);
  save('src/core/codex.ts', crlf, t);
}

// ── 2. achievements.ts：facts 加 xianFound + 两条新成就 ───────────
{
  const { crlf, text } = load('src/data/achievements.ts');
  let t = text;

  t = t.replace(
    '  readonly xianEquipped: number;',
    [
      '  readonly xianEquipped: number;',
      '  /** D168：累计获得过的仙品件数（不是身上同时装备数）—— `xian-80` 的度量 */',
      '  readonly xianFound: number;',
    ].join('\n'),
  );

  // EMPTY_FACTS 补 0
  t = t.replace('  xianEquipped: 0,', '  xianEquipped: 0,\n  xianFound: 0,');

  // 传奇收集：在 codex-l-9 之后补 codex-l-12（12 = ALL 传奇数）
  const l9 = "  { id: 'codex-l-9', name: '九器归一', desc: '收齐 9 种传奇效果。', target: 9, reward: 30000, progress: (f) => min(f.codexLegendaries, 9) },";
  if (!t.includes(l9)) throw new Error('MISS codex-l-9');
  t = t.replace(
    l9,
    [
      l9,
      "  // D168：12 = 基础 9 + 深层 3。时间锚 = 12×H(12)=37.24 件 ÷ 6.67 件/h ≈ 5.6h（shuzhi v4.76）。",
      "  { id: 'codex-l-12', name: '十二器圆', desc: '收齐 12 种传奇效果（含深层 3 种）。', target: 12, reward: 30000, progress: (f) => min(f.codexLegendaries, 12) },",
    ].join('\n'),
  );

  // 仙品累计：在 xian-9 之后补 xian-80
  const x9 = "  { id: 'xian-9', name: '九仙在身', desc: '身上带满 9 件仙品。', target: 9, reward: 30000, progress: (f) => min(f.xianEquipped, 9) },";
  if (!t.includes(x9)) throw new Error('MISS xian-9');
  t = t.replace(
    x9,
    [
      x9,
      "  // D168：时间锚 = 80 件 ÷ 6.67 件/h ≈ 12.0h（满级后长线刻度）。度量是**累计获得**，不是身上同时装备。",
      "  { id: 'xian-80', name: '仙缘不浅', desc: '累计收得 80 件仙品。', target: 80, reward: 30000, progress: (f) => min(f.xianFound, 80) },",
    ].join('\n'),
  );

  save('src/data/achievements.ts', crlf, t);
}
