import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/src/render/battle-renderer.ts';
const raw = fs.readFileSync(p, 'utf8');
const crlf = raw.includes('\r\n');
let n = raw.replace(/\r\n/g, '\n');
const before = n.length;

// 1) import 妖纹展示串
const oldImp = "import { drawHudButtons, type HudButtonId } from './hud-buttons';";
if (!n.includes(oldImp)) throw new Error('MISS hud-buttons import');
n = n.replace(
  oldImp,
  [oldImp, "import { monsterAffixSuffix } from '../data/monster-affixes';"].join('\n'),
);

// 2) 精英怪名字挂在血条上方（普通浊物不显示名字，避免满屏文字）
const oldDraw = [
  '    // 镇守名字',
  '    if (m.rarity === \'boss\') {',
  '      ctx.fillStyle = \'rgba(255,220,150,0.92)\';',
  '      ctx.font = \'600 12px "Noto Sans SC", system-ui, sans-serif\';',
  '      ctx.textAlign = \'center\';',
  '      ctx.textBaseline = \'alphabetic\';',
  '      ctx.fillText(m.name, m.x, m.y - r - 14);',
  '    }',
].join('\n');
if (!n.includes(oldDraw)) throw new Error('MISS monster name block');
const newDraw = [
  '    // 名字：镇守 + 带妖纹的精英（D95）。普通浊物不显示名字，否则满屏文字。',
  '    // 妖纹挂在名字右边而不是串成一行（shuzhi：K 面板/血条行宽有限，超宽截断）。',
  '    if (m.rarity === \'boss\' || (m.affixIds && m.affixIds.length > 0)) {',
  '      const isBoss = m.rarity === \'boss\';',
  '      ctx.fillStyle = isBoss ? \'rgba(255,220,150,0.92)\' : RARITY_EDGE[m.rarity] || \'rgba(216,211,196,0.9)\';',
  '      ctx.font = isBoss ? \'600 12px "Noto Sans SC", system-ui, sans-serif\' : \'500 11px "Noto Sans SC", system-ui, sans-serif\';',
  '      ctx.textAlign = \'center\';',
  '      ctx.textBaseline = \'alphabetic\';',
  '      // 精英只写妖纹（「凶煞·厚皮」），怪名在战斗日志/图鉴里都有；这样一行放得下',
  '      const label = isBoss ? m.name : monsterAffixSuffix(m.affixIds).replace(/^ · /, \'\');',
  '      if (label) ctx.fillText(label, m.x, m.y - r - 12);',
  '    }',
].join('\n');
n = n.replace(oldDraw, newDraw);

if (n.length === before) throw new Error('没有变化');
if (crlf) n = n.replace(/\n/g, '\r\n');
fs.writeFileSync(`F:/dsh-work/zhuoxian/tools/_bak/battle-renderer.ts.${Date.now()}.bak`, raw);
fs.writeFileSync(p, n);
console.log(`battle-renderer.ts: ${before} -> ${n.length}`);
