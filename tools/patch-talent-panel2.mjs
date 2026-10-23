// 接周天图面板（T 键）：renderer 加开关 + main.ts 绑键
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
    "import { drawEquipmentDetail } from './detail-panels';",
    [
      "import { drawEquipmentDetail } from './detail-panels';",
      "import { drawTalentPanel } from './talent-panel';",
    ].join('\n'),
  ],
  [
    'field',
    '  private showDetail = false;',
    [
      '  private showDetail = false;',
      '  private showTalent = false;',
    ].join('\n'),
  ],
  [
    'toggle',
    '  toggleBreakdown(): boolean {',
    [
      '  /** 周天图面板（按 T）：天赋 54 个节点必须看得见，否则等于没有这个系统 */',
      '  toggleTalent(): boolean {',
      '    this.showTalent = !this.showTalent;',
      '    return this.showTalent;',
      '  }',
      '',
      '  get talentVisible(): boolean {',
      '    return this.showTalent;',
      '  }',
      '',
      '  toggleBreakdown(): boolean {',
    ].join('\n'),
  ],
  [
    'render-call',
    '    if (this.showDetail) drawEquipmentDetail(this.ctx, s);',
    [
      '    if (this.showDetail) drawEquipmentDetail(this.ctx, s);',
      '    if (this.showTalent) drawTalentPanel(this.ctx, s);',
    ].join('\n'),
  ],
]);

patchFile('src/main.ts', [
  [
    'key-T',
    "  if (e.code === 'KeyD') {",
    [
      "  // T = 周天图（天赋树）。54 个节点必须能看见，否则玩家永远不知道自己点了什么。",
      "  if (e.code === 'KeyT') {",
      '    const on = renderer.toggleTalent();',
      '    session.log.push({',
      "      text: on ? '打开周天图（再按 T 关闭）' : '关闭周天图',",
      "      color: '#6d665c',",
      '      age: 0,',
      '    });',
      '    return;',
      '  }',
      "  if (e.code === 'KeyD') {",
    ].join('\n'),
  ],
]);
