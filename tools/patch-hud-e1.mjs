// HUD：露出渊痕 + 无尽层标识 + 深度仙缘加成
import fs from 'node:fs';

const ROOT = 'F:/dsh-work/zhuoxian';
const p = ROOT + '/src/render/hud-panels.ts';
const orig = fs.readFileSync(p, 'utf8');
let c = orig;
fs.writeFileSync(ROOT + '/tools/_bak/hud-panels.ts.' + Date.now() + '.bak', orig, 'utf8');

function repl(oldText, newText, tag) {
  const n = c.split(oldText).length - 1;
  if (n !== 1) throw new Error('MISS(' + n + '): ' + tag);
  c = c.replace(oldText, newText);
  console.log('ok:', tag);
}

repl(
  "import { MAX_FLOOR } from '../data/monsters';",
  [
    "import { MAX_FLOOR, MAIN_FLOOR_END, depthRarityBonus } from '../data/monsters';",
    "import { TOTAL_STEPS } from '../core/progression';",
    "import { affordableSinks } from '../data/marks';",
  ].join('\n'),
  'imports',
);

repl(
  [
    '  return drawPanel(ctx, 960 - PANEL_W - PANEL_X_GAP, topOffset, [',
    '    { label: TERM.realm, value: formatRealm(s.character.step), color: C.gold },',
    '    { label: \'战力\', value: String(characterPower(s.character)), color: C.teal },',
    '    { label: \'层数\', value: `${s.floor} / ${MAX_FLOOR}`, color: C.text },',
    '    { label: \'波次\', value: String(s.wave), color: C.text },',
    '    { label: \'击杀\', value: `${s.battle.kills}（死 ${s.floorDeaths}）`, color: C.dim },',
    '  ]);',
  ].join('\n'),
  [
    '  const maxed = s.character.step >= TOTAL_STEPS - 1;',
    '  const marks = Math.max(0, Math.floor(s.character.marks ?? 0));',
    '  const lines: Line[] = [',
    '    { label: TERM.realm, value: formatRealm(s.character.step), color: C.gold },',
    '    { label: \'战力\', value: String(characterPower(s.character)), color: C.teal },',
    '    // 层数后面标出无尽区：玩家必须一眼看出「27 之后还有内容」，',
    '    // 否则满级那一刻他会以为游戏结束了（D36-A 的存在理由）。',
    '    {',
    '      label: \'层数\',',
    '      value: s.floor > MAIN_FLOOR_END ? `${s.floor} / ${MAX_FLOOR} · 渊底` : `${s.floor} / ${MAIN_FLOOR_END}`,',
    '      color: s.floor > MAIN_FLOOR_END ? C.purple : C.text,',
    '    },',
    '    { label: \'波次\', value: String(s.wave), color: C.text },',
    '    { label: \'击杀\', value: `${s.battle.kills}（死 ${s.floorDeaths}）`, color: C.dim },',
    '  ];',
    '  // 渊痕只在满级后才有意义（它是满级后的唯一积累物，不产生战力）。',
    '  // 露出「可换什么」比只显示数字有用：玩家看到 20 万就能换一次深层落脚点。',
    '  if (maxed || marks > 0) {',
    '    lines.push({',
    '      label: \'渊痕\',',
    '      value: `${marks.toLocaleString(\'en-US\')}${affordableSinks(marks).length > 0 ? \' · 可换\' : \'\'}`,',
    '      color: marks > 0 ? C.gold : C.dim,',
    '    });',
    '  }',
    '  // 无尽层的仙缘加成：让「越深越富」有可见凭据，不然它只是埋在设计文档里的一句话',
    '  const depth = depthRarityBonus(s.floor);',
    '  if (depth > 0) {',
    '    lines.push({ label: \'深缘\', value: `+${Math.round(depth * 100)}% 仙缘`, color: C.teal });',
    '  }',
    '  return drawPanel(ctx, 960 - PANEL_W - PANEL_X_GAP, topOffset, lines);',
  ].join('\n'),
  'status-panel',
);

if (c.length < orig.length * 0.95) throw new Error('拒绝写盘');
fs.writeFileSync(p, c, 'utf8');
console.log('flush', c.length, 'B');
