// D162 第 2 段：追加槽真的被消费（drop 层返回数组 + session/offline 都接）
import fs from 'node:fs';

function load(file) {
  const raw = fs.readFileSync(file, 'utf8');
  return { crlf: raw.includes('\r\n'), text: raw.replace(/\r\n/g, '\n') };
}
function save(file, crlf, text) {
  fs.writeFileSync(file, crlf ? text.replace(/\n/g, '\r\n') : text, 'utf8');
  console.log('patched', file);
}

// ── drop.ts：新增 rollMonsterDropAll，旧函数变薄壳（向后兼容测试/离线） ──
{
  const { crlf, text } = load('src/core/drop.ts');
  let t = text;
  const a = 'export function rollMonsterDrop(';
  if (!t.includes(a)) throw new Error('MISS drop head');
  const b = [
    '/**',
    ' * D162：一次击杀可能掉**两件**（追加槽）。所有真正收货的地方都必须用这个，',
    ' * 用 `rollMonsterDrop` 会把 extraItem 静默丢掉 —— 那是「字段存在但没人读」的第八个死通道。',
    ' */',
    'export function rollMonsterDropAll(',
  ].join('\n');
  t = t.replace(a, b);
  // 原函数体结尾返回 item：改成返回数组，并加一个薄壳
  const a2 = '  if (!result || !result.item) return null;\n\n  // 名字带上怪的出处，玩家会记住"这只怪掉过好东西"\n  const item = result.item;\n  return { ...item, name: item.name, uid: `${item.uid}-${defId.slice(0, 4)}` };';
  const b2 = [
    '  if (!result || !result.item) return [];',
    '',
    '  // 名字带上怪的出处，玩家会记住"这只怪掉过好东西"',
    '  const item = result.item;',
    '  const main = { ...item, uid: `${item.uid}-${defId.slice(0, 4)}` };',
    '  if (!result.extraItem) return [main];',
    '  // 追加槽那件也带上出处后缀，避免 uid 与其它来源撞车',
    '  return [main, { ...result.extraItem, uid: `${result.extraItem.uid}-${defId.slice(0, 4)}` }];',
    '}',
    '',
    '/** 只要第一件（旧签名，保留给单件语义的调用方/测试） */',
    'export function rollMonsterDrop(',
    '  ...args: Parameters<typeof rollMonsterDropAll>',
    '): Item | null {',
    '  return rollMonsterDropAll(...args)[0] ?? null;',
    '}',
  ].join('\n');
  if (!t.includes(a2)) throw new Error('MISS drop tail');
  t = t.replace(a2, b2);
  save('src/core/drop.ts', crlf, t);
}

// ── session.ts：收货改成数组 ─────────────────────────────────────────
{
  const { crlf, text } = load('src/core/session.ts');
  let t = text;
  t = t.replace('        const item = rollMonsterDrop(', '        const items = rollMonsterDropAll(');
  t = t.replace(
    '        if (item) {\n          addGroundDrop(s, item, killed.x, killed.y);\n          s.diag.itemsByRarity[killed.rarity] += 1;\n        }',
    [
      '        for (const item of items) {',
      '          addGroundDrop(s, item, killed.x, killed.y);',
      '          s.diag.itemsByRarity[killed.rarity] += 1;',
      '        }',
    ].join('\n'),
  );
  t = t.replace('  rollMonsterDrop,', '  rollMonsterDropAll,');
  save('src/core/session.ts', crlf, t);
}

// ── offline.ts：同上 ───────────────────────────────────────────────
{
  const { crlf, text } = load('src/core/offline.ts');
  let t = text;
  t = t.replace("import { rollDropGate, rollMonsterDrop } from './drop';", "import { rollDropGate, rollMonsterDropAll } from './drop';");
  t = t.replace('      const item = rollMonsterDrop(', '      const dropped = rollMonsterDropAll(');
  t = t.replace('      if (item) items.push(item);', '      for (const it of dropped) items.push(it);');
  save('src/core/offline.ts', crlf, t);
}

// ── 测试：deep-legendary 换新常量与追加槽语义 ─────────────────────────
{
  const { crlf, text } = load('tests/deep-legendary.test.ts');
  let t = text;
  t = t.replace('  DEEP_LEGENDARY_SHARE,\n  DEEP_RARITY_MUL,\n', '  DEEP_EXTRA_CHANCE,\n');
  save('tests/deep-legendary.test.ts', crlf, t);
}
