// D170：`unlockCodex(['variant'])` 收不进图鉴不是「dev 钩子缺陷」，是死内容 ——
// 图鉴 34 行里那一行只有测试在填，玩家路径永远填不满。
// 修法按 shuzhi：**接产品路径**（recordMonsterKill 里判 variant），不给钩子加分支。
// 判据（她给的）：关掉钩子，这条内容还可达吗？
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

// ── 1. codex.ts：recordMonsterKill 认 variant ──────────────────────
{
  const { crlf, text } = load('src/core/codex.ts');
  let t = text;

  const oldFn = [
    '/** 收录一只浊物。没变化时返回原对象（热路径不复制）。 */',
    'export function recordMonsterKill(codex: CodexState, monsterId: string): CodexState {',
    '  if (!MONSTER_SET.has(monsterId)) return codex;',
    '  if (codex.monsters.includes(monsterId)) return codex;',
    '  return {',
    '    monsters: MONSTER_IDS.filter((id) => id === monsterId || codex.monsters.includes(id)),',
    '    legendaries: codex.legendaries,',
    '    variants: codex.variants,',
    '  };',
    '}',
  ].join('\n');
  const newFn = [
    '/**',
    ' * 收录一只浊物。没变化时返回原对象（热路径不复制）。',
    ' *',
    ' * D170：`variant` 为真时**同时**解锁「异变体」那一行 —— 这是玩家路径上的唯一入口。',
    ' * 之前只靠 dev 钩子 `recordVariant`，等于「图鉴里有一格玩家永远填不上」（死词条第 8 例，',
    ' * 且形状是「只有测试在消费」：它通过了所有测试，因为测试也走钩子）。',
    ' */',
    'export function recordMonsterKill(codex: CodexState, monsterId: string, variant = false): CodexState {',
    '  const known = MONSTER_SET.has(monsterId);',
    '  const wantMonster = known && !codex.monsters.includes(monsterId);',
    '  const wantVariant = variant === true && codex.variants.length === 0;',
    '  if (!wantMonster && !wantVariant) return codex;',
    '  return {',
    '    monsters: wantMonster',
    '      ? MONSTER_IDS.filter((id) => id === monsterId || codex.monsters.includes(id))',
    '      : codex.monsters,',
    '    legendaries: codex.legendaries,',
    '    variants: wantVariant ? VARIANT_IDS : codex.variants,',
    '  };',
    '}',
  ].join('\n');
  t = rep(t, oldFn, newFn, 'recordMonsterKill');

  save('src/core/codex.ts', crlf, t);
}

// ── 2. session.ts：一次调用 + 两条播报（去掉独立 variant 块） ─────
{
  const { crlf, text } = load('src/core/session.ts');
  let t = text;

  const oldBlock = [
    '      const nextCodex = recordMonsterKill(s.codex, killed.defId);',
    '      if (nextCodex !== s.codex) {',
    '        s.codex = nextCodex;',
    '        const def = getMonster(killed.defId);',
    '        if (def) pushLog(s, codexUnlockText(\'monster\', def.name), \'#8eeae2\');',
    '      }',
    '      // 图鉴（D160）：异变体独立一行。只记「见过」，不计数（计数是成就的活）。',
    '      if (killed.variant === true) {',
    '        const nextVariant = recordVariant(s.codex);',
    '        if (nextVariant !== s.codex) {',
    '          s.codex = nextVariant;',
    '          pushLog(s, codexUnlockText(\'variant\', \'异变体\'), \'#c9a3ff\');',
    '        }',
    '      }',
  ].join('\n');
  const newBlock = [
    '      // D170：异变体那一行由 recordMonsterKill 走**产品路径**解锁（跨过 dev 钩子），',
    '      // 所以这里只调一次、再按「哪一段真变了」分别播报。',
    '      const prevCodex = s.codex;',
    '      const nextCodex = recordMonsterKill(prevCodex, killed.defId, killed.variant === true);',
    '      if (nextCodex !== prevCodex) {',
    '        s.codex = nextCodex;',
    '        const def = getMonster(killed.defId);',
    '        if (nextCodex.monsters !== prevCodex.monsters && def) {',
    '          pushLog(s, codexUnlockText(\'monster\', def.name), \'#8eeae2\');',
    '        }',
    '        if (nextCodex.variants !== prevCodex.variants) {',
    '          pushLog(s, codexUnlockText(\'variant\', \'异变体\'), \'#c9a3ff\');',
    '        }',
    '      }',
  ].join('\n');
  t = rep(t, oldBlock, newBlock, 'session kill block');

  // recordVariant 不再被 session 使用（导出保留给 dev 钩子/测试）
  t = rep(
    t,
    "import { codexUnlockText, createCodex, recordLegendary, recordMonsterKill, recordVariant, type CodexState } from './codex';",
    "import { codexUnlockText, createCodex, recordLegendary, recordMonsterKill, type CodexState } from './codex';",
    'session import',
  );

  save('src/core/session.ts', crlf, t);
}
