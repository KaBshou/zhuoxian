// D161（③(b)+(a)）：深层专属传奇 3 条 + 层 ≥40 池子 40/60 加法分流 + 深层品阶加成 ×2
import fs from 'node:fs';

function load(file) {
  const raw = fs.readFileSync(file, 'utf8');
  return { crlf: raw.includes('\r\n'), text: raw.replace(/\r\n/g, '\n') };
}
function save(file, crlf, text) {
  fs.writeFileSync(file, crlf ? text.replace(/\n/g, '\r\n') : text, 'utf8');
  console.log('patched', file);
}

// ── legendary.ts：深层 3 条 + 池子访问器 ─────────────────────────────────
{
  const { crlf, text } = load('src/data/legendary.ts');
  const anchor = 'export function getLegendary(id: string | undefined): LegendaryDef | undefined {';
  const block = [
    '/**',
    ' * 深层专属传奇（D161 / shuzhi v4.72 ③b）。',
    ' *',
    ' * **只在层 ≥40 掉落**，且与基础 9 条**加法共存**（层 ≥40 时 40% 抽深层池、60% 抽基础池）。',
    ' * 为什么不能「替换」：段④ 的标准刷法是停层 46，若层 ≥40 只掉深层池，',
    ' * 基础 9 条在最优刷法下永远刷不到 ⇒ 收集变成不可能（D161）。',
    ' *',
    ' * 为什么是「加深层内容」而不是「给低层加门槛」：低层传奇是存量战力，',
    ' * 设门槛会在练级期前 53%（145.5/273min）里减战力 ⇒ 满级变慢 ⇒ 撞 D64（D161 的教训）。',
    ' */',
    'export const DEEP_LEGENDARY_MIN_FLOOR = 40;',
    '/** 层 ≥40 时抽深层池的概率（其余抽基础池；两池都可得） */',
    'export const DEEP_LEGENDARY_SHARE = 0.4;',
    '/** 层 ≥40 时品阶加成再翻倍（把 12 条收集压回 6h 量级，D161 的 (a) 分量） */',
    'export const DEEP_RARITY_MUL = 2;',
    '',
    'export const DEEP_LEGENDARY_DEFS: readonly LegendaryDef[] = [',
    '  {',
    "    id: 'yuanhen'",
    "    name: '渊痕刻印',",
    "    desc: '伤害更多 45%（深层专属，比太一余烬更重）',",
    "    mods: [{ stat: 'damage', op: 'more', value: 0.45 }],",
    '  },',
    '  {',
    "    id: 'shenyuan'",
    "    name: '深渊回响',",
    "    desc: '护体提高 400%（深层专属）',",
    "    mods: [{ stat: 'armor', op: 'increased', value: 4 }],",
    '  },',
    '  {',
    "    id: 'changye'",
    "    name: '长夜未明',",
    "    desc: '破绽率 +18%（深层专属，比追魂夺魄更高）',",
    "    mods: [{ stat: 'critChance', op: 'flat', value: 0.18 }],",
    '  },',
    '];',
    '',
    '/** 图鉴/洗档用：12 条全部（基础 9 + 深层 3） */',
    'export const ALL_LEGENDARY_DEFS: readonly LegendaryDef[] = [...LEGENDARY_DEFS, ...DEEP_LEGENDARY_DEFS];',
    '',
    anchor,
  ].join('\n');
  if (!text.includes(anchor)) throw new Error('MISS legendary anchor');
  let t = text.replace(anchor, block);
  save('src/data/legendary.ts', crlf, t);
}

// getLegendary / isLegendaryId 改成搜全部 12 条
{
  const { crlf, text } = load('src/data/legendary.ts');
  const a = 'export function getLegendary(id: string | undefined): LegendaryDef | undefined {';
  const lines = text.split('\n');
  const at = lines.findIndex((l) => l === a);
  const bodyEnd = lines.findIndex((l, i) => i > at && l === '}');
  const body = lines.slice(at, bodyEnd + 1).join('\n');
  console.log('--- getLegendary body ---\n' + body);
  if (body.includes('LEGENDARY_DEFS.find')) {
    const nb = body.replace(/LEGENDARY_DEFS\.find/g, 'ALL_LEGENDARY_DEFS.find');
    save('src/data/legendary.ts', crlf, text.replace(body, nb));
  } else {
    console.log('getLegendary 未使用 LEGENDARY_DEFS.find，需人工确认');
  }
}
{
  const { crlf, text } = load('src/data/legendary.ts');
  const lines = text.split('\n');
  const at = lines.findIndex((l) => l.startsWith('export function isLegendaryId'));
  const bodyEnd = lines.findIndex((l, i) => i > at && l === '}');
  const body = lines.slice(at, bodyEnd + 1).join('\n');
  console.log('--- isLegendaryId body ---\n' + body);
  if (body.includes('LEGENDARY_DEFS.some')) {
    save('src/data/legendary.ts', crlf, text.replace(body, body.replace(/LEGENDARY_DEFS\.some/g, 'ALL_LEGENDARY_DEFS.some')));
  }
}
