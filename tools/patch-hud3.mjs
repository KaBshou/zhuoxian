// 一次性补丁：renderer 改用 drawHudStack + 损伤详解挪左上
import fs from 'node:fs';

const ROOT = 'F:/dsh-work/zhuoxian';
const p = `${ROOT}/src/render/battle-renderer.ts`;
const orig = fs.readFileSync(p, 'utf8');
let c = orig;
fs.writeFileSync(`${ROOT}/tools/_bak/battle-renderer.ts.${Date.now()}.bak`, orig, 'utf8');

function repl(old, neu, tag) {
  const n = c.split(old).length - 1;
  if (n !== 1) throw new Error(`MISS(${n}): ${tag}`);
  c = c.replace(old, neu);
  console.log('ok:', tag);
}

repl(
  `import { drawStatusPanel, drawEquipmentPanel, drawBagPanel } from './hud-panels';`,
  `import { drawHudStack } from './hud-panels';`,
  'import',
);

repl(
  `    drawStatusPanel(this.ctx, s);
    drawEquipmentPanel(this.ctx, s);
    drawBagPanel(this.ctx, s);`,
  `    // 四块面板（状态 / 法宝 / 囊中 / 背包）由 hud-panels 自己按高度堆叠，
    // 这里不给坐标 —— 行数是变的，写死坐标一改行数就叠在一起。
    drawHudStack(this.ctx, s);`,
  'stack',
);

repl(
  `    const W = 300;
    const H = 40 + lines.length * 15;
    const X = BATTLE_W - W - 14;
    const Y = 54;`,
  `    // 挪到左上：右上角被 HUD 面板占了，左下角是战斗日志
    const W = 300;
    const H = 40 + lines.length * 15;
    const X = 14;
    const Y = 44;`,
  'breakdown-pos',
);

if (c.length < orig.length * 0.98) throw new Error('拒绝写盘');
fs.writeFileSync(p, c, 'utf8');
console.log('done', c.length, 'B');
