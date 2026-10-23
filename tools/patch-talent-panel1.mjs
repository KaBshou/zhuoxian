// 接周天图面板：BattleRenderer 增加 showTalent + toggleTalent，main.ts 绑 T
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
  if (cur.length < orig.length * 0.95) throw new Error('拒绝写盘 ' + rel);
  fs.writeFileSync(p, cur, 'utf8');
  console.log('flush', rel, cur.length, 'B');
}

patchFile('src/render/battle-renderer.ts', [
  [
    'import-talent-panel',
    "import { drawHudStack } from './hud-panels';",
    [
      "import { drawHudStack } from './hud-panels';",
      "import { drawTalentPanel } from './talent-panel';",
    ].join('\n'),
  ],
]);

console.log('--- 还需确认 battle-renderer 里三个开关的写法');
