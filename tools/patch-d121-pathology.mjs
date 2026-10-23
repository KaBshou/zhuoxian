// D121（shuzhi v4.49）：三条判定落地
//  ① 九境：硬线改「单境耗时 ≤ 2 × 该境目标」（病理线，抓某境卡死/爆炸），形状偏离降为记录。
//     不重给 REALM_SHAPE_RATIO —— 那是拿实测反向定义设计标尺，标尺一旦按数据重写，以后再出偏差就永远抓不到。
//  ② 脱困率：排除前沿带（floorAt >= MAX_FLOOR - 6 = 70），降为记录（现样本 5 个）；前沿带单独统计。
//     在最后一层上永远不可能推进 2 层 —— 那是定义的几何错误，不是玩家不行。
//  ③ 中段鼓包不治：层 22~30 一次逃生阀事件都没有 ⇒ 是「变慢」不是「卡住」。「卡住」要治，「变慢」要认。
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const ROOT = 'F:\\dsh-work\\zhuoxian\\';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
mkdirSync(ROOT + 'tools/_bak', { recursive: true });

function patch(rel, edits) {
  const path = ROOT + rel;
  const raw = readFileSync(path, 'utf8');
  const crlf = raw.includes('\r\n');
  let text = raw.replace(/\r\n/g, '\n');
  const before = text.length;
  for (const [tag, oldText, newText] of edits) {
    if (text.includes(newText)) continue;
    const hits = text.split(oldText).length - 1;
    if (hits !== 1) throw new Error(`[${rel} · ${tag}] 锚点命中 ${hits} 次`);
    text = text.replace(oldText, newText);
  }
  const delta = text.length - before;
  if (delta < -600 || delta > 16000) throw new Error(`[${rel}] 改动量异常：${delta}`);
  copyFileSync(path, `${ROOT}tools/_bak/${rel.replace(/[\\/]/g, '_')}.${stamp}.bak`);
  writeFileSync(path, crlf ? text.replace(/\n/g, '\r\n') : text, 'utf8');
  console.log(`OK ${rel} ${before} → ${text.length}（+${delta}）`);
}

// ── 1) 九境：病理线取代形状硬线 ──
patch('tools/run-timeline.mjs', [
  [
    'patho-const',
    'const REALM_SHAPE_MIN_TARGET = 20;',
    'const REALM_SHAPE_MIN_TARGET = 20;\n' +
      '/** D121：病理线 —— 单境耗时不得超过该境目标的 2 倍（抓「某境卡死/爆炸」，不抓「整体平移」）。 */\n' +
      'const REALM_PATHOLOGY_MUL = 2;\n' +
      '/** D121：形状偏离从硬线降为记录。 */\n' +
      'const REALM_SHAPE_SOFT_ONLY = true;',
  ],
  [
    'patho-calc',
    '        const shapeRed = target > REALM_SHAPE_MIN_TARGET && shapeDev > REALM_SHAPE_TOLERANCE;\n      if (shapeRed) {',
    '        const shapeRed = !REALM_SHAPE_SOFT_ONLY && target > REALM_SHAPE_MIN_TARGET && shapeDev > REALM_SHAPE_TOLERANCE;\n' +
      '        // D121 病理线：本境耗时 = 到达本境 − 到达上一境（第 1 境从 0 起算）\n' +
      '        const prevAt = j > 1 ? r.realmArrivals[j - 1] : 0;\n' +
      '        const spent = Number.isFinite(prevAt) ? at - prevAt : NaN;\n' +
      '        const prevTarget = j > 1 ? TARGET_REALM_MINUTES[j - 2] : 0;\n' +
      '        const spentTarget = target - prevTarget;\n' +
      '        const pathological = Number.isFinite(spent) && spentTarget > 0 && spent > spentTarget * REALM_PATHOLOGY_MUL;\n      if (pathological || shapeRed) {',
  ],
  [
    'patho-print',
    '- 九境形状检查（**D119 硬线**：shape = 到达/满级，与该境形状比偏离 > ${Math.round(REALM_SHAPE_TOLERANCE * 100)}% 且目标 > ${REALM_SHAPE_MIN_TARGET}min 才红；绝对时间只记录）→ **${realmMagnitudeOk ? "通过" : "不通过"}**',
    '- 九境病理线（**D121 硬线**：单境耗时 ≤ ${REALM_PATHOLOGY_MUL}× 该境目标；形状偏离 >${Math.round(REALM_SHAPE_TOLERANCE * 100)}% 只记录）→ **${realmMagnitudeOk ? "通过" : "不通过"}**',
  ],
]);

// ── 2) 脱困率：排除前沿带 + 降为记录 ──
patch('tools/run-timeline.mjs', [
  [
    'esc-const',
    'const ESCAPE_RATE_ENFORCED = false;',
    'const ESCAPE_RATE_ENFORCED = false; // D121：降为记录，等 MAX_FLOOR 扩容后再判\n' +
      '/** D121：前沿带（最后一层附近）不计入脱困率 —— 在那里永远不可能「推进 2 层」，是定义的几何错误。 */\n' +
      'const ESCAPE_FRONTIER_MARGIN = 6;',
  ],
  [
    'esc-calc',
    '  const allEscapes = runs.flatMap((r) => r.escapeEvents ?? []);',
    '  const allEscapesRaw = runs.flatMap((r) => r.escapeEvents ?? []);\n' +
      '  const frontierFloor = MAX_FLOOR - ESCAPE_FRONTIER_MARGIN;\n' +
      '  const allEscapes = allEscapesRaw.filter((e) => e.floorAt < frontierFloor);\n' +
      '  const frontierEscapes = allEscapesRaw.filter((e) => e.floorAt >= frontierFloor);',
  ],
  [
    'esc-print',
    "`- 脱困率（**${ESCAPE_RATE_ENFORCED ? `硬线 ≥${(ESCAPE_RATE_MIN * 100).toFixed(0)}%` : \"首轮只记录，次轮起判 ≥80%\"}**）：${escapedCount}/${allEscapes.length} = ${(escapeRate * 100).toFixed(1)}% → ${escapeRateOk ? '通过' : '**不通过**'}（逃生阀后 30min 内是否重新推进层）`,",
    "`- 脱困率（**D121 记录项**，排除前沿带 floor ≥ ${frontierFloor}）：${escapedCount}/${allEscapes.length} = ${(escapeRate * 100).toFixed(1)}%` +\n" +
      "      `｜前沿带单独统计：${frontierEscapes.length} 个事件（最后一层附近不可用「推进 2 层」判定，改看「能否最终清过最后一层」）`,",
  ],
  [
    'esc-verdict',
    '        escapeRateEvents: allEscapes.length,',
    '        escapeRateEvents: allEscapes.length,\n        frontierEscapeEvents: frontierEscapes.length,',
  ],
]);

// ── 3) MAX_FLOOR 引进来（若尚未引入） ──
patch('tools/run-timeline.mjs', [
  [
    'maxfloor-import',
    'const ESCAPE_FRONTIER_MARGIN = 6;',
    'const ESCAPE_FRONTIER_MARGIN = 6;\n' +
      '/** D121：前沿带要用层数上限，直接读数据表，避免再抄一个常量。 */\n' +
      'const { MAX_FLOOR } = await load(\'src/data/monsters.ts\');',
  ],
]);
