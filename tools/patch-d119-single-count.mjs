// D119（shuzhi v4.48）：把两处「重复计罚」改成单一判据 —— 不是放宽阈值。
//
// A. 段②：硬线换成「成型早于满级达成率 ≥90%」（能/不能），比值中位 ≤0.80 降为软线（多早 = 余量，
//    而余量的分母（满级极差）已经比分子更吵：本轮极差 37.0% 已越过 35% 观察线）。
// B. 九境：改判「形状」不判「绝对时间」—— shape_k = arrival_k / maxed，与该种子自己的 maxed 比。
//    整体后移已经被满级窗口罚过一次，量级线再罚一次 = 同一事实罚两次，且第二次更噪。
// C. 撞墙率软线 33% → 35%（免去每次解释四舍五入）。
// D. 脱困率给出「≥2 层」版本的数据（不启用），供下轮决定定义。
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const ROOT = 'F:\\dsh-work\\zhuoxian\\';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
mkdirSync(ROOT + 'tools/_bak', { recursive: true });
const BT = String.fromCharCode(96);

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

// ── 1) 段② 相对线降为软线：hardFail 里去掉它 ──
patch('tools/run-timeline.mjs', [
  [
    'rel-const',
    'const FORMED_REL_MEDIAN_MAX = 0.75;',
    'const FORMED_REL_MEDIAN_MAX = 0.8; // D119：软线（只记录）—— 余量的分母（满级极差）比分子更吵\n' +
      '/** D119：段② 的硬线是「成型早于满级」的达成率（能/不能），比值只记录「多早」。 */\n' +
      'const FORMED_REL_SOFT_ONLY = true;',
  ],
  [
    'rel-ok',
    'const formedRelOk = formedRelMedOk;',
    'const formedRelOk = FORMED_REL_SOFT_ONLY ? true : formedRelMedOk;',
  ],
  [
    'rel-print',
    '    ' + BT + '- 段② 相对副红线（**只判中位** 成型/满级 ≤ ${FORMED_REL_MEDIAN_MAX}；逐种子 ≤ ${FORMED_REL_SEED_MAX} 只打印，D99 起不再判红）：' + BT + ' +',
    '    ' + BT + '- 段② 比值（**D119 软线 ≤ ${FORMED_REL_MEDIAN_MAX}，只记录不拦**；硬线是上面的「成型早于满级达成率」；逐种子 ≤ ${FORMED_REL_SEED_MAX} 只打印）：' + BT + ' +',
  ],
  [
    'wall-soft',
    'const WALL_HIT_RATE_MAX = 0.33;',
    'const WALL_HIT_RATE_MAX = 0.35; // D119：33% → 35%（免去每次解释四舍五入；软线只记录）',
  ],
]);

// ── 2) 九境：绝对量级 → 形状判据 ──
patch('tools/run-timeline.mjs', [
  [
    'realm-shape-const',
    'const REALM_MAGNITUDE_ABS_MIN = 40;',
    'const REALM_MAGNITUDE_ABS_MIN = 40;\n' +
      '/** D119：形状偏离上限（shape_k / REALM_SHAPE_RATIO[k] − 1）。超过 30% 才红 —— 抓「某种子某境独自偏慢」。 */\n' +
      'const REALM_SHAPE_TOLERANCE = 0.3;\n' +
      '/** D119：目标 > 20min 的境才判形状（早期境界绝对分钟小，形状本身噪声大）。 */\n' +
      'const REALM_SHAPE_MIN_TARGET = 20;',
  ],
  [
    'realm-calc',
    '      if (Math.abs(dev) > REALM_MAGNITUDE_LIMIT && absDev > REALM_MAGNITUDE_ABS_MIN) {\n        const row = { seed: r.seed, realm: j, at, target, dev, absDev };',
    '        // D119：判「形状」不判「绝对时间」—— 整体后移由满级窗口负责，这里只抓「快慢是否均匀」。\n' +
      '        const maxedOfSeed = r.maxedAt;\n' +
      '        const shape = Number.isFinite(maxedOfSeed) && maxedOfSeed > 0 ? at / maxedOfSeed : NaN;\n' +
      '        const shapeDev = Number.isFinite(shape) ? Math.abs(shape / REALM_SHAPE_RATIO[j - 1] - 1) : 0;\n' +
      '        const shapeRed = target > REALM_SHAPE_MIN_TARGET && shapeDev > REALM_SHAPE_TOLERANCE;\n' +
      '      if (shapeRed) {\n        const row = { seed: r.seed, realm: j, at, target, dev, absDev, shape, shapeDev };',
  ],
  [
    'realm-print',
    '- 九境量级检查（|偏差| > ${Math.round(REALM_MAGNITUDE_LIMIT * 100)}% **且** 绝对偏差 > ${REALM_MAGNITUDE_ABS_MIN}min 才红，**只抓一错一倍**；逐境 ±${Math.round(REALM_TOLERANCE * 100)}% 只记录）→ **${realmMagnitudeOk ? "通过" : "不通过"}**',
    '- 九境形状检查（**D119 硬线**：shape = 到达/满级，与该境形状比偏离 > ${Math.round(REALM_SHAPE_TOLERANCE * 100)}% 且目标 > ${REALM_SHAPE_MIN_TARGET}min 才红；绝对时间只记录）→ **${realmMagnitudeOk ? "通过" : "不通过"}**',
  ],
]);
