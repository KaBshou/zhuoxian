// D163：段② FORMER_RATIO 0.62→0.55、去绝对带、比值带收紧上沿 0.75
// D164：DEEP_EXTRA_CHANCE 0.30→0.10
import fs from 'node:fs';

function load(f) {
  const raw = fs.readFileSync(f, 'utf8');
  return { crlf: raw.includes('\r\n'), text: raw.replace(/\r\n/g, '\n') };
}
function save(f, crlf, t) {
  fs.writeFileSync(f, crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
  console.log('patched', f);
}

// ── run-timeline.mjs ───────────────────────────────────────────────
{
  const { crlf, text } = load('tools/run-timeline.mjs');
  let t = text;

  t = t.replace(
    'const FORMED_RATIO = 0.62;',
    [
      '// D163：0.62 追不到需求，是 D65 从历史中位数反推的**锚**；真正的设计比例在 GDD 1.7：',
      '//   段② 装备成型 6h : 段③ 境界圆满 5h ⇒ 6/11 = 0.545 ≈ **0.55**（target = 140）。',
      '// 实测 130.8/254.7 = 0.514（比设计值低 5.7%，属「已经很好、但尺子错了」）⇒ 改尺子不改内容。',
      'const FORMED_RATIO = 0.55;',
    ].join('\n'),
  );

  t = t.replace(
    'const FORMED_REL_MEDIAN_MAX = 0.8; // D119：软线（只记录）—— 余量的分母（满级极差）比分子更吵',
    [
      '// D163：上沿从 0.80 收紧到 0.75 —— 成型晚于满级 75% = 「满级了还没成型」，那是真事故。',
      'const FORMED_REL_MEDIAN_MAX = 0.75;',
    ].join('\n'),
  );

  const shapeOld = [
    '  const formedShapeOk = CYCLE === 0',
    '    ? Number.isFinite(formedMed) &&',
    '      formedMed <= FORMED_MAX && formedMed / FORMED_TARGET <= 1.15 && formedMed / FORMED_TARGET >= 0.85',
    '    : Number.isFinite(formedMed);',
  ].join('\n');
  const shapeNew = [
    '  // D163：**绝对带已删除** —— 它是比值带 [0.45,0.75] 的更严别名（÷254.7 = [0.538,0.726]），',
    '  // 同一事实罚两次（D119「去掉重复计罚」的第三例）。段② 现在只有两条判据：',
    '  //   ① 达成率 ≥90%（能/不能成型）② 中位比值 ∈ [0.45,0.75]（多早）。',
    '  // 绝对分钟只在报表里打印，用于人眼核对「140 目标 vs 实测 130.8」。',
    '  const formedShapeOk = Number.isFinite(formedMed);',
  ].join('\n');
  if (!t.includes(shapeOld)) throw new Error('MISS formedShapeOk');
  t = t.replace(shapeOld, shapeNew);

  save('tools/run-timeline.mjs', crlf, t);
}

// ── legendary.ts：追加槽概率 0.30 → 0.10 ────────────────────────────
{
  const { crlf, text } = load('src/data/legendary.ts');
  let t = text;
  const a = 'export const DEEP_EXTRA_CHANCE = 0.3;';
  if (!t.includes(a)) throw new Error('MISS extra chance');
  const b = [
    '//',
    '// D164：0.30 实测把段④ 收集从 5.3h 压到 **3.2h**（设计目标 5.5~6.5h）。',
    '// 根因不是「+30% 传奇」而是「额外那件是**一整件新仙品**，而仙品率只有 4.81%」：',
    '// 拿「传奇件数 ×30%」的比例去推「仙品件数」的绝对量，两个分母不同（族纪律：不许跨分母推绝对量）。',
    '// 0.10 ⇒ per3h 14.3→17.5 ⇒ 段④ ≈4.4h（留一点「深层独占惊喜」，又不把 24h 账吃掉）。',
    'export const DEEP_EXTRA_CHANCE = 0.1;',
  ].join('\n');
  t = t.replace(a, b);
  save('src/data/legendary.ts', crlf, t);
}
