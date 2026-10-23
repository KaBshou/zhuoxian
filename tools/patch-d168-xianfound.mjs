// D168 附：`xian-80` 的度量是「累计获得过的仙品件数」，必须入档 ——
// 只放运行时字段会在刷新后归零，成就就永远拿不到（与渊痕/引导同类事故）。
import fs from 'node:fs';

function load(f) {
  const raw = fs.readFileSync(f, 'utf8');
  return { crlf: raw.includes('\r\n'), text: raw.replace(/\r\n/g, '\n') };
}
function save(f, crlf, t) {
  fs.writeFileSync(f, crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
  console.log('patched', f);
}
function rep(t, oldStr, newStr, tag) {
  if (!t.includes(oldStr)) throw new Error('MISS ' + tag);
  return t.replace(oldStr, newStr);
}

// ── session.ts ─────────────────────────────────────────────────────
{
  const { crlf, text } = load('src/core/session.ts');
  let t = text;

  t = rep(
    t,
    '  deaths: number;',
    [
      '  deaths: number;',
      '  /** D168：累计获得过的仙品件数（成就 `xian-80` 的度量；入档，否则刷新后归零） */',
      '  xianFound: number;',
    ].join('\n'),
    'session field',
  );
  t = rep(t, '  deaths: 0,', '  deaths: 0,\n  xianFound: 0,', 'createSession init');
  t = rep(t, '    xianEquipped: xianEquippedCount(s.character),', '    xianEquipped: xianEquippedCount(s.character),\n    xianFound: s.xianFound,', 'facts');

  // 拾取分支：仙品计入累计（判定用掉落物本身，与图鉴同一处）
  t = rep(
    t,
    '      if (g.item.legendary) {\n        const nextCodex = recordLegendary(s.codex, g.item.legendary);',
    [
      '      // D168：累计仙品件数（成就在 tick 末尾结算，这里只记账；不判「装没装上」）。',
      '      if (g.item.rarity === \'xian\') s.xianFound += 1;',
      '      if (g.item.legendary) {',
      '        const nextCodex = recordLegendary(s.codex, g.item.legendary);',
    ].join('\n'),
    'pickup counter',
  );

  save('src/core/session.ts', crlf, t);
}

// ── save.ts ────────────────────────────────────────────────────────
{
  const { crlf, text } = load('src/core/save.ts');
  let t = text;
  t = rep(t, '  readonly cycle?: number;', '  readonly cycle?: number;\n  /** D168：累计获得过的仙品件数 */\n  readonly xianFound?: number;', 'ProgressSave field');
  t = rep(t, '  cycle?: number;', '  cycle?: number;\n  xianFound?: number;', 'serialize input');
  t = rep(t, '    cycle: Math.max(0, Math.floor(input.cycle ?? 0)),', '    cycle: Math.max(0, Math.floor(input.cycle ?? 0)),\n    xianFound: Math.max(0, Math.floor(input.xianFound ?? 0)),', 'serialize body');
  t = rep(
    t,
    '      typeof pr.deaths === \'number\' && Number.isFinite(pr.deaths) ? Math.max(0, Math.floor(pr.deaths)) : 0,',
    [
      '      typeof pr.deaths === \'number\' && Number.isFinite(pr.deaths) ? Math.max(0, Math.floor(pr.deaths)) : 0,',
      '    xianFound: typeof pr.xianFound === \'number\' && Number.isFinite(pr.xianFound) ? Math.max(0, Math.floor(pr.xianFound)) : 0,',
    ].join('\n'),
    'deserialize body',
  );
  save('src/core/save.ts', crlf, t);
}

// ── save-bridge.ts ────────────────────────────────────────────────
{
  const { crlf, text } = load('src/core/save-bridge.ts');
  let t = text;
  t = rep(t, '    cycle: s.cycle ?? 0,', '    cycle: s.cycle ?? 0,\n    xianFound: s.xianFound ?? 0,', 'bridge out');
  t = rep(
    t,
    '  s.cycle = clampCycle(state.progress.cycle ?? 0);',
    '  s.cycle = clampCycle(state.progress.cycle ?? 0);\n  s.xianFound = Math.max(0, Math.floor(state.progress.xianFound ?? 0));',
    'bridge in',
  );
  save('src/core/save-bridge.ts', crlf, t);
}
