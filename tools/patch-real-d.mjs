// 修 1: monsters.ts 引入 MAIN_FLOOR_END（shuzhi 报的 P0：MAX_FLOOR=46 被当成主线末层用）
// 修 2: session.ts 补 TOTAL_STEPS import + 替换 MAX_STEP
import fs from 'node:fs';

const ROOT = 'F:/dsh-work/zhuoxian';

function patchFile(rel, edits) {
  const p = ROOT + '/' + rel;
  const orig = fs.readFileSync(p, 'utf8');
  let cur = orig;
  fs.writeFileSync(ROOT + '/tools/_bak/' + rel.replace(/\//g, '_') + '.' + Date.now() + '.bak', orig, 'utf8');
  for (const [tag, oldText, newText] of edits) {
    const n = cur.split(oldText).length - 1;
    if (n !== 1) throw new Error('MISS(' + n + ') ' + rel + ': ' + tag);
    cur = cur.replace(oldText, newText);
    console.log('ok:', rel, tag);
  }
  if (cur.length < orig.length * 0.98) throw new Error('拒绝写盘 ' + rel);
  fs.writeFileSync(p, cur, 'utf8');
  console.log('flush', rel, cur.length, 'B');
}

patchFile('src/data/monsters.ts', [
  [
    'main-floor-end',
    'export const MAX_FLOOR = 46;',
    [
      'export const MAX_FLOOR = 46;',
      '',
      '/**',
      ' * 主线末层（= 27）。**和 MAX_FLOOR 是两个概念，别混用。**',
      ' *',
      ' * MAX_FLOOR 是「层数上限」（46）；MAIN_FLOOR_END 是「主线在哪一层结束」（27）。',
      ' * E1 实装时踩过这个坑：MAX_FLOOR 从 27 改成 46 之后，scaleOfFloor / bossHpMul /',
      ' * hasBossFloor / depthRarityBonus 四处仍然拿它当「主线末层」用 → 无尽层的 1.10 曲线、',
      ' * 镇守降幂、每 5 层一只、深品阶奖励**全部没生效**，深段怪血硬 2.4~2.5 倍。',
      ' * 规则：任何「主线/无尽层分界」的判断都用 MAIN_FLOOR_END；「能不能再往下走」用 MAX_FLOOR。',
      ' */',
      'export const MAIN_FLOOR_END = 27;',
    ].join('\n'),
  ],
  [
    'scale-hp',
    [
      '  const hp =',
      '    f <= MAX_FLOOR',
      '      ? Math.pow(FLOOR_HP_MUL, f - 1)',
      '      : Math.pow(FLOOR_HP_MUL, MAX_FLOOR - 1) * Math.pow(ENDLESS_HP_GROWTH, f - MAX_FLOOR);',
    ].join('\n'),
    [
      '  const hp =',
      '    f <= MAIN_FLOOR_END',
      '      ? Math.pow(FLOOR_HP_MUL, f - 1)',
      '      : Math.pow(FLOOR_HP_MUL, MAIN_FLOOR_END - 1) *',
      '        Math.pow(ENDLESS_HP_GROWTH, f - MAIN_FLOOR_END);',
    ].join('\n'),
  ],
  [
    'boss-hp-mul',
    '  if (!Number.isFinite(floor) || floor <= MAX_FLOOR) return BOSS_HP_MUL;\n  return Math.max(ENDLESS_BOSS_HP_MUL, BOSS_HP_MUL * Math.pow(0.8, floor - MAX_FLOOR));',
    '  if (!Number.isFinite(floor) || floor <= MAIN_FLOOR_END) return BOSS_HP_MUL;\n  return Math.max(\n    ENDLESS_BOSS_HP_MUL,\n    BOSS_HP_MUL * Math.pow(0.8, floor - MAIN_FLOOR_END),\n  );',
  ],
  [
    'has-boss-floor',
    '  if (!Number.isFinite(floor) || floor <= MAX_FLOOR) return true;',
    '  if (!Number.isFinite(floor) || floor <= MAIN_FLOOR_END) return true;',
  ],
  [
    'depth-rarity',
    '  if (!Number.isFinite(floor) || floor <= MAX_FLOOR) return 0;\n  const raw = (Math.floor(floor) - MAX_FLOOR) * DEPTH_RARITY_PER_FLOOR;',
    '  if (!Number.isFinite(floor) || floor <= MAIN_FLOOR_END) return 0;\n  const raw = (Math.floor(floor) - MAIN_FLOOR_END) * DEPTH_RARITY_PER_FLOOR;',
  ],
]);

patchFile('src/core/session.ts', [
  [
    'import-total-steps',
    "  hasBossFloor, bossOfTier, monstersOfTier, MAX_FLOOR, tierOfFloor } from '../data/monsters';",
    "  hasBossFloor, bossOfTier, monstersOfTier, MAX_FLOOR, tierOfFloor } from '../data/monsters';\nimport { TOTAL_STEPS } from './progression';",
  ],
  ['total-steps', 'if (before >= MAX_STEP) {', 'if (before >= TOTAL_STEPS - 1) {'],
]);

console.log('done');
