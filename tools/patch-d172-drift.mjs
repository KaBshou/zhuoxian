// D172：注释/文案漂移 —— 三处「描述的是当时，不是现在」。
// 族：入口说谎（与 D171 的「文档锚漂移」同族，只是载体是注释/报表文案）。
// 三处都是 shuzhi 冻结前逐项对账抓到的，逻辑零影响，但读的人会先信注释。
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
  if (t.split(oldStr).length - 1 !== 1) throw new Error('AMBIGUOUS ' + tag);
  return t.replace(oldStr, newStr);
}

// ── 1. src/data/legendary.ts:137 注释「另掷一次 30%」→ 0.10 ─────────
{
  const { crlf, text } = load('src/data/legendary.ts');
  let t = text;
  t = rep(
    t,
    ' * 另掷一次 30% 从深层池抽 1 条。',
    ' * 另掷一次 **10%** 从深层池抽 1 条（D164 从 0.30 下调，理由见下方常量前的注释）。',
    'legendary 30% comment',
  );
  save('src/data/legendary.ts', crlf, t);
}

// ── 2. tools/run-timeline.mjs 三处 ────────────────────────────────
{
  const { crlf, text } = load('tools/run-timeline.mjs');
  let t = text;

  // 2a. 段② 判据说明里的「目标 338min≈5.6h」是 D50 时代的旧值
  t = rep(
    t,
    '  // 目标 338min≈5.6h、窗口上限 420min（≤7h）。「毕业（≥2 条对口）」真值 17.1h、「全仙品」≈21h，',
    [
      '  // 目标 = 满级中位 × FORMEd_RATIO（当前 260×0.55 ≈ 143min ≈ 2.4h，D163 从 0.62 下调到设计比例 0.545~0.55），',
      '  // 窗口上限 = 目标 × 1.15。「毕业（≥2 条对口）」真值 17.1h、「全仙品」≈21h，',
    ].join('\n'),
    'run-timeline formed comment',
  );

  // 2b. 打印行里写死 ≈5.6h —— 现算小时，标签不许写死
  t = rep(
    t,
    '`（目标 ${FORMED_TARGET}min≈5.6h，窗口 ≤${FORMED_MAX}min，偏差',
    '`（目标 ${FORMED_TARGET}min≈${f(FORMED_TARGET / 60, 1)}h，窗口 ≤${FORMED_MAX}min，偏差',
    'run-timeline formed print',
  );

  // 2c. 周目时长注释：c1/c2/c3 实测值
  t = rep(
    t,
    '周目时长天然更长（c1≈312 / c2≈375 / c3≈539）',
    '周目时长天然更长（c1≈291 / c2≈381 / c3≈494；D172 按 12 种子实测校准，历史值 312/375/539 作废）',
    'run-timeline cycle comment',
  );

  save('tools/run-timeline.mjs', crlf, t);
}
