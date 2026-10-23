// 一次性补丁 C3：character.ts marks 字段 + session.ts 计数/D39/渊痕
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

patchFile('src/core/character.ts', [
  [
    'marks-field',
    [
      '  /** 浊气状态 */',
      '  readonly turbid: TurbidState;',
    ].join('\n'),
    [
      '  /** 浊气状态 */',
      '  readonly turbid: TurbidState;',
      '  /**',
      '   * 渊痕（满级后的积累物，D36-A）。由满级后的击杀修为 1:1 转换而来。',
      '   * **绝不影响面板属性** —— 见 src/data/marks.ts 的三条铁律。',
      '   * 可选字段：老存档没有它也能读。',
      '   */',
      '  readonly marks?: number;',
    ].join('\n'),
  ],
]);

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
  [
    'tick-minutes',
    '      const killed = e.monster;',
    [
      '      const killed = e.monster;',
      '      // 累计与本层击杀：按层真实击杀率（BALANCE §21.11）的唯一实测来源',
      '      s.kills += 1;',
      '      s.floorKills += 1;',
    ].join('\n'),
  ],
  [
    'marks-outlet',
    [
      '      const before = s.character.step;',
      '      s.character = gainXp(s.character, killed.xp);',
    ].join('\n'),
    [
      '      const before = s.character.step;',
      '      // 满级（台阶 80）后修为没有去处：xpForStep(80) = Infinity，gainXp 静默吞掉。',
      '      // D36-A 定：满级后的修为 1:1 转成渊痕（长线内容物，不产生任何战力）。',
      '      if (before >= MAX_STEP) {',
      '        s.character = {',
      '          ...s.character,',
      '          marks: (s.character.marks ?? 0) + Math.max(0, Math.round(killed.xp)),',
      '        };',
      '      } else {',
      '        s.character = gainXp(s.character, killed.xp);',
      '      }',
    ].join('\n'),
  ],
]);

console.log('done C3');
