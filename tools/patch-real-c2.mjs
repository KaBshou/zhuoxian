// 一次性补丁 C2：session.ts 计数 + D39 分流 + 渊痕出口；drop.ts 加 cap 常量
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

// ── drop.ts: 数量上限常量 ──
patchFile('src/core/drop.ts', [
  [
    'quantity-cap',
    '/** 掉落物在地上待多久才被自动拾取（秒）。给玩家"我看见它掉了"的时间 */',
    [
      '/**',
      ' * D39：通货/玉简份额的放大上限（+58%）。',
      ' *',
      ' * 为什么是 58%：通货 47.5% + 玉简 12.5% = 60% 的基础份额，乘 (1+q) 后不能吃掉',
      ' * 法宝那 40%，所以 (0.475+0.125)(1+q) <= 0.95 推出 q <= 0.583，取 0.58。',
      ' * 法宝份额永远保底 5%，段②「装备成型 6.9h」不会被任何数量的数量词缀击穿。',
      ' */',
      'export const LOOT_QUANTITY_CAP = 0.58;',
      '',
      '/** 掉落物在地上待多久才被自动拾取（秒）。给玩家"我看见它掉了"的时间 */',
    ].join('\n'),
  ],
]);

// ── character.ts: marks 字段 ──
patchFile('src/core/character.ts', [
  [
    'marks-field',
    '  turbid: TurbidState;',
    [
      '  turbid: TurbidState;',
      '  /**',
      '   * 渊痕（满级后的积累物，D36-A）。1:1 由满级后的击杀修为转换而来。',
      '   * **绝不影响面板属性** —— 见 src/data/marks.ts 的三条铁律。',
      '   */',
      '  marks?: number;',
    ].join('\n'),
  ],
]);

// ── session.ts ──
patchFile('src/core/session.ts', [
  [
    'import-stats',
    "import { createCharacter, gainXp, type CharacterState } from './character';",
    "import { characterStats, createCharacter, gainXp, type CharacterState } from './character';",
  ],
  [
    'import-drop',
    "import { MAX_GROUND_DROPS, PICKUP_DELAY, rollMonsterDrop, type GroundDrop } from './drop';",
    [
      'import {',
      '  LOOT_QUANTITY_CAP,',
      '  MAX_GROUND_DROPS,',
      '  PICKUP_DELAY,',
      '  rollMonsterDrop,',
      '  type GroundDrop,',
      "} from './drop';",
    ].join('\n'),
  ],
  [
    'session-counters',
    [
      '  /** 累计掉落件数（UI 显示"出货"用） */',
      '  dropsFound: number;',
    ].join('\n'),
    [
      '  /** 累计掉落件数（UI 显示"出货"用；含法宝 + 通货 + 玉简三类） */',
      '  dropsFound: number;',
      '  /**',
      '   * 累计击杀（运行期观察量，不进存档）。',
      '   *',
      '   * 为什么必须单独记：battle.kills 是战斗层计数，死亡重开/换层都不区分层；',
      '   * 而「按层真实击杀率」是标定 KILLS_PER_MIN_BY_FLOOR 的唯一实测来源（BALANCE §21.11）。',
      '   * 这里曾经声明了 readonly kills 却没有任何一处赋值，工具读到 NaN。',
      '   */',
      '  kills: number;',
      '  /** 本层击杀（换层清零）。floorKills / floorMinutes = 该层真实击杀率 */',
      '  floorKills: number;',
      '  /** 本层停留分钟数（换层清零）。运行时态，不进存档 */',
      '  floorMinutes: number;',
    ].join('\n'),
  ],
  [
    'init-counters',
    '    dropsFound: 0,\n    breakthroughs: 0,',
    '    dropsFound: 0,\n    kills: 0,\n    floorKills: 0,\n    floorMinutes: 0,\n    breakthroughs: 0,',
  ],
]);

console.log('done C2');
