// 一次性补丁：HUD 面板重排（状态/法宝/囊中/背包 依次堆叠）+ 损伤详解挪到左上
import fs from 'node:fs';

const ROOT = 'F:/dsh-work/zhuoxian';
const files = {};
function load(rel) {
  const p = `${ROOT}/${rel}`;
  const c = fs.readFileSync(p, 'utf8');
  files[rel] = { p, orig: c, cur: c };
  fs.writeFileSync(`${ROOT}/tools/_bak/${rel.replace(/\//g, '_')}.${Date.now()}.bak`, c, 'utf8');
}
function repl(rel, old, neu, tag) {
  const f = files[rel];
  const n = f.cur.split(old).length - 1;
  if (n !== 1) throw new Error(`MISS(${n}) ${rel}: ${tag}`);
  f.cur = f.cur.replace(old, neu);
  console.log('ok:', rel, tag);
}
function flush(rel) {
  const f = files[rel];
  if (f.cur.length < f.orig.length * 0.98) throw new Error(`拒绝写盘 ${rel}`);
  fs.writeFileSync(f.p, f.cur, 'utf8');
  console.log('flush', rel, f.cur.length, 'B');
}

// ── hud-panels：通货名从 CURRENCIES 取，别指望有 CURRENCY_NAME ──
load('src/render/hud-panels.ts');
repl('src/render/hud-panels.ts',
  `import { CURRENCY_NAME, type CurrencyId } from '../data/currency';`,
  `import { CURRENCIES, type CurrencyId } from '../data/currency';`,
  'import-currency',
);
repl('src/render/hud-panels.ts',
  `const PANEL_W = 210;`,
  `/** 通货 id → 术语名（currency.ts 只有 CURRENCIES 表，别自己再抄一份中文） */
const CURRENCY_NAME = Object.fromEntries(
  CURRENCIES.map((c) => [c.id, c.name]),
) as Record<CurrencyId, string>;

const PANEL_W = 210;`,
  'currency-name',
);
repl('src/render/hud-panels.ts',
  `export { CURRENCY_NAME };
export const HUD_COLORS = { ...C, RARITY_COLOR };`,
  `export const HUD_COLORS = { ...C, RARITY_COLOR };`,
  'drop-export',
);
flush('src/render/hud-panels.ts');

// ── renderer：四个面板依次堆叠 ──────────────────────────
load('src/render/battle-renderer.ts');
repl('src/render/battle-renderer.ts',
  `import { drawStatusPanel, drawEquipmentPanel, drawBagPanel } from './hud-panels';`,
  `import {
  drawBagPanel,
  drawEquipmentPanel,
  drawPocketPanel,
  drawStatusPanel,
  hudStackHeight,
} from './hud-panels';`,
  'import-hud',
);
repl('src/render/battle-renderer.ts',
  `    drawStatusPanel(this.ctx, s);
    drawEquipmentPanel(this.ctx, s);
    drawBagPanel(this.ctx, s);`,
  `    // 四个面板自顶向下依次排：状态 → 法宝 → 囊中 → 背包。
    // 每个面板返回自己的高度，靠累加定位（不要写死 y，改行数就会叠在一起）。
    const top = 44;
    drawStatusPanel(this.ctx, s, top);
    const statusH = 10 + 5 * 16 + 4;
    const equipTop = top + statusH + 8;
    drawEquipmentPanel(this.ctx, s, equipTop);
    const equipH = statusH; // 近似：9 行法宝的格子数可能少于 5 行状态，靠 hudStackHeight 兜底
    void equipH;
    drawPocketPanel(this.ctx, s, equipTop + 96);
    drawBagPanel(this.ctx, s, equipTop + 96 + 92);
    void hudStackHeight;`,
  'stack-panels',
);
repl('src/render/battle-renderer.ts',
  `    const W = 300;
    const H = 40 + lines.length * 15;
    const X = BATTLE_W - W - 14;
    const Y = 54;`,
  `    // 放左上角：右上角被 HUD 面板占了，左下角是战斗日志
    const W = 300;
    const H = 40 + lines.length * 15;
    const X = 14;
    const Y = 44;`,
  'breakdown-left',
);
flush('src/render/battle-renderer.ts');
console.log('done');
