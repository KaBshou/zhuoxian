// 测量口子：渊痕消费策略（跨周目携带 + 自动花钱），用于回答「周目能不能补 9h」
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve('.');
function read(p) {
  const raw = fs.readFileSync(path.join(ROOT, p), 'utf8');
  return { text: raw.replace(/\r\n/g, '\n'), crlf: raw.includes('\r\n') };
}
function write(p, text, crlf) {
  fs.writeFileSync(path.join(ROOT, p), crlf ? text.replace(/\n/g, '\r\n') : text, 'utf8');
}
function patch(p, edits) {
  const { text, crlf } = read(p);
  let t = text;
  for (const [tag, oldText, newText] of edits) {
    const at = t.indexOf(oldText);
    if (at < 0) throw new Error(`MISS ${p} :: ${tag}`);
    if (t.indexOf(oldText, at + 1) >= 0) throw new Error(`AMBIGUOUS ${p} :: ${tag}`);
    t = t.slice(0, at) + newText + t.slice(at + oldText.length);
  }
  if (t.length < text.length * 0.9) throw new Error(`SHRINK ${p}`);
  write(p, t, crlf);
  console.log(`patched ${p} (${text.length} -> ${t.length})`);
}

patch('tools/session-runner.mjs', [
  [
    'opts',
    '  const { classId, seed, tables, talentIds = [], autoTalents, minutes, dt, stopAtMaxStep = true, cycle = 0 } = opts;',
    [
      '  const {',
      '    classId,',
      '    seed,',
      '    tables,',
      '    talentIds = [],',
      '    autoTalents,',
      '    minutes,',
      '    dt,',
      '    stopAtMaxStep = true,',
      '    cycle = 0,',
      '    marksStart = 0,',
      "    marksPolicy = 'none',",
      '    marksMod = null,',
      '  } = opts;',
    ].join('\n'),
  ],
  [
    'marks state',
    '  const cumOf = (ch) => progMod.totalXpToStep(ch.step) + ch.xp;',
    [
      '  // 渊痕消费策略（测量口子，默认关）：产品里 spendMarks() 只挂在 main.ts 的按键上，',
      '  // 模拟器从不消费 ⇒ 「周目携带渊痕 / 买定渊」这类补偿通道永远走不到。',
      '  // 打开后每 30 模拟秒按优先级尝试一次：定渊 → 夺造化 → 聚灵（失败不扣钱，见 marks-runtime）。',
      '  let marksSpent = 0;',
      '  let lastMarkSpendAt = -Infinity;',
      '  if (Number.isFinite(marksStart) && marksStart > 0) {',
      '    s.character = { ...s.character, marks: Math.max(0, Math.floor(marksStart)) };',
      '  }',
      '',
      '  const cumOf = (ch) => progMod.totalXpToStep(ch.step) + ch.xp;',
    ].join('\n'),
  ],
  [
    'spend loop',
    '    // 口袋基线必须在打造扣款之后取，否则下一帧的增量会把「花掉」再算回产出\n    prevPocket = { ...s.pocket };',
    [
      '    // 5b) 渊痕消费（测量口子，默认关）',
      "    if (marksPolicy === 'spend' && marksMod && t - lastMarkSpendAt >= 30) {",
      '      lastMarkSpendAt = t;',
      "      for (const sink of ['setStartFloor', 'divineReforge', 'rerollCurrency']) {",
      '        const before = Math.max(0, Math.floor(s.character.marks ?? 0));',
      '        const r = marksMod.spendMarks(s, sink);',
      '        if (r.ok) marksSpent += Math.max(0, before - Math.max(0, Math.floor(s.character.marks ?? 0)));',
      '      }',
      '    }',
      '',
      '    // 口袋基线必须在打造扣款之后取，否则下一帧的增量会把「花掉」再算回产出',
      '    prevPocket = { ...s.pocket };',
    ].join('\n'),
  ],
  [
    'result fields',
    '    pocketEnd: { ...s.pocket },',
    [
      '    pocketEnd: { ...s.pocket },',
      '    marksSpent,',
      '    marksStart: Math.max(0, Math.floor(marksStart || 0)),',
    ].join('\n'),
  ],
]);

patch('tools/run-timeline.mjs', [
  [
    'load marks mod',
    "  const inventoryMod = await load('src/core/inventory.ts');",
    [
      "  const inventoryMod = await load('src/core/inventory.ts');",
      "  const marksMod = await load('src/core/marks-runtime.ts');",
    ].join('\n'),
  ],
  [
    'mods',
    '  const mods = { sessionMod, craftMod, progMod, monstersMod, offlineMod, inventoryMod };',
    '  const mods = { sessionMod, craftMod, progMod, monstersMod, offlineMod, inventoryMod };\n  const MARKS_POLICY = String(args.marksPolicy ?? \'none\');\n  const MARKS_START = Math.max(0, Math.floor(Number(args.marksStart ?? 0) || 0));',
  ],
]);
console.log('done');
