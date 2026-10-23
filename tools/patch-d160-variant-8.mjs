// D160（② 异变体）第 8 段：渲染 —— 紫色外环 + 名字前缀「异变·」
import fs from 'node:fs';

function load(file) {
  const raw = fs.readFileSync(file, 'utf8');
  return { crlf: raw.includes('\r\n'), text: raw.replace(/\r\n/g, '\n') };
}
function save(file, crlf, text) {
  fs.writeFileSync(file, crlf ? text.replace(/\n/g, '\r\n') : text, 'utf8');
  console.log('patched', file);
}

{
  const { crlf, text } = load('src/render/battle-renderer.ts');
  const a = `    // 名字：镇守 + 带妖纹的精英（D95）。普通浊物不显示名字，否则满屏文字。`;
  const b = `    // 异变体（D160）：紫色外环（比稀有度环大一圈，两者可叠加 —— 异变是独立的形态标记，不是品阶）。
    if (m.variant === true) {
      ctx.strokeStyle = VARIANT_EDGE;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(m.x, m.y + bob, r + 7, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 名字：镇守 + 带妖纹的精英（D95）。普通浊物不显示名字，否则满屏文字。`;
  if (!text.includes(a)) throw new Error('MISS render comment');
  let t = text.replace(a, b);

  const c = '      const label = isBoss ? m.name : monsterAffixSuffix(m.affixIds).replace(/^ · /, \'\');';
  const d =
    '      const base = isBoss ? m.name : monsterAffixSuffix(m.affixIds).replace(/^ · /, \'\');\n' +
    "      const label = m.variant === true ? `异变·${base}` : base;";
  if (!t.includes(c)) throw new Error('MISS render label');
  t = t.replace(c, d);

  // 名字显示条件：异变体即使没有妖纹（理论上不会）也要显示
  const e = '    if (m.rarity === \'boss\' || (m.affixIds && m.affixIds.length > 0)) {';
  const f = '    if (m.rarity === \'boss\' || m.variant === true || (m.affixIds && m.affixIds.length > 0)) {';
  if (!t.includes(e)) throw new Error('MISS render cond');
  t = t.replace(e, f);

  // 颜色常量
  const g = 'const RARITY_EDGE: Readonly<Record<string, string>> = {';
  const h =
    '/** 异变体描边色（D160）：紫 —— 与稀有度蓝/金/红都不同色相，两者叠加也不会看混 */\n' +
    "const VARIANT_EDGE = 'rgba(186,140,255,0.95)';\n" +
    'const RARITY_EDGE: Readonly<Record<string, string>> = {';
  if (!t.includes(g)) throw new Error('MISS render const');
  t = t.replace(g, h);

  save('src/render/battle-renderer.ts', crlf, t);
}
