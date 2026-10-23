// 一次性补丁：接「法宝详情」面板（按 E）
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

// ── renderer：加 showDetail + toggleDetail + draw ──
load('src/render/battle-renderer.ts');
repl('src/render/battle-renderer.ts',
  `import { drawHudStack } from './hud-panels';`,
  `import { drawHudStack } from './hud-panels';
import { drawEquipmentDetail } from './detail-panels';`,
  'import-detail',
);
repl('src/render/battle-renderer.ts',
  `    if (this.showBreakdown) this.drawBreakdown(s);`,
  `    if (this.showBreakdown) this.drawBreakdown(s);
    if (this.showDetail) drawEquipmentDetail(this.ctx, s);`,
  'draw-detail',
);
flush('src/render/battle-renderer.ts');

// showBreakdown 字段附近加 showDetail + toggleDetail
load('src/render/battle-renderer.ts');
repl('src/render/battle-renderer.ts',
  `  private showBreakdown = false;`,
  `  private showBreakdown = false;

  /** 法宝详情（按 E）。和损伤详解一样是"按需覆盖"的调试/阅读层 */
  private showDetail = false;

  /** 切换法宝详情，返回切换后的状态 */
  toggleDetail(): boolean {
    this.showDetail = !this.showDetail;
    return this.showDetail;
  }

  /** 详情是否开着（探针用） */
  get detailVisible(): boolean {
    return this.showDetail;
  }`,
  'detail-field',
);
flush('src/render/battle-renderer.ts');

// ── main.ts：KeyE 绑定 + 钩子 ──
load('src/main.ts');
repl('src/main.ts',
  `      if (code === 'KeyD') {`,
  `      if (code === 'KeyE') {
        const on = renderer.toggleDetail();
        // 详情挡视野，开着时给一句提示（不然玩家以为画面卡了）
        window.__zhuoxian?.notice?.(on ? '法宝详情：开（按 E 关）' : '法宝详情：关');
        return;
      }
      if (code === 'KeyD') {`,
  'key-e',
);
repl('src/main.ts',
  `    toggleBreakdown: () => renderer.toggleBreakdown(),`,
  `    toggleBreakdown: () => renderer.toggleBreakdown(),
    toggleDetail: () => renderer.toggleDetail(),`,
  'hook',
);
flush('src/main.ts');
console.log('done');
