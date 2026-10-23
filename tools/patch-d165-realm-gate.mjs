// D165：任何「只在某个域内生效」的判据，输出必须带「这次有没有参与判定」的伴生字段。
// 背景：c2/c3 的 realmMagnitudeOk = false 同时表示「判不过」与「根本没判」，
// 报表读者无法区分（shuzhi v4.75 判为假红）。
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

  const oldLine = [
    '`- 九境病理线（**D121 硬线（中位口径）**：单境耗时中位 ≤ ${REALM_PATHOLOGY_MUL}× 该境目标；逐种子 >2× 与形状偏离 >${Math.round(REALM_SHAPE_TOLERANCE * 100)}% 只记录）→ **${realmMagnitudeOk ? "通过" : "不通过"}**` +',
  ].join('\n');
  const newLine = [
    '// D165：判据只在 c0 生效 ⇒ 必须报「未启用」而不是「不通过」。',
    '  const realmGateActive = CYCLE === 0;',
    '  const realmVerdictText = !realmGateActive ? "未启用（c≥1，D142）" : realmMagnitudeOk ? "通过" : "不通过";',
    '  console.log(',
    '    `- 九境病理线（**D121 硬线（中位口径）**：单境耗时中位 ≤ ${REALM_PATHOLOGY_MUL}× 该境目标；逐种子 >2× 与形状偏离 >${Math.round(REALM_SHAPE_TOLERANCE * 100)}% 只记录）→ **${realmVerdictText}**` +',
  ].join('\n');
  if (!t.includes(oldLine)) throw new Error('MISS realm print head');
  t = t.replace(oldLine, newLine);

  // 原 console.log( 变成了新块里的 console.log(，把紧跟其后的那行「（最差境…」保留即可。
  const oldTail = '      (realmMagnitudeOk ? "" : `：${realmMagnitude.map';
  const newTail = '      (!realmGateActive || realmMagnitudeOk ? "" : `：${realmMagnitude.map';
  if (!t.includes(oldTail)) throw new Error('MISS realm print tail');
  t = t.replace(oldTail, newTail);

  const oldVerdict = '        realmMagnitudeOk,\n';
  const newVerdict = '        realmMagnitudeOk,\n        // D165：伴生字段 —— 这个判据本轮到底有没有参与判定（false 不再二义）。\n        realmGateActive: CYCLE === 0,\n';
  if (!t.includes(oldVerdict)) throw new Error('MISS verdict realmMagnitudeOk');
  t = t.replace(oldVerdict, newVerdict);

  save('tools/run-timeline.mjs', crlf, t);
}

// ── _segments.mjs：同样区分「未启用」 ──────────────────────────────
{
  const { crlf, text } = load('tools/_segments.mjs');
  if (!text.includes('九境')) {
    console.log('_segments.mjs 无九境块，跳过');
  } else {
    console.log('_segments.mjs 有九境块，需人工确认（未自动改）');
  }
}
