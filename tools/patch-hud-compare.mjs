// 一次性：背包露出「同部位战力对比」，法宝露出「传奇」标记（shuzhi D55 的两条展示规则）
//
// 为什么值得做：玩家看到「宝品 · 战力 57」时无法判断该不该换 —— 战力是**部位内**的量纲
// （玉佩 p50 161.8 vs 戒指 21.9，差 7.4 倍），跨部位不可比。所以只显示「和自己身上同部位比 ±X%」。
// 品阶内分位（「前 30%」）需要把 `tools/slot-power-base.json` 搬进 src 并随数值重标重生成，
// 那个分母一旦过期是**静默失真**，本轮不做，留给下一轮统一处理。
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/src/render/hud-panels.ts';
const raw = fs.readFileSync(p, 'utf8');
const crlf = raw.includes('\r\n');
let c = raw.replace(/\r\n/g, '\n');
const before = c.length;

const repl = (oldText, newText, tag) => {
  if (!c.includes(oldText)) throw new Error(`MISS ${tag}`);
  c = c.replace(oldText, newText);
};

repl(
  "import { characterPower, equipmentSummary, itemPower } from '../core/inventory';",
  "import { characterPower, equipmentSummary, itemPower, slotForItem } from '../core/inventory';",
  'import',
);

repl(
  "    value: `${e.item.name} · ${RARITY_NAME[e.item.rarity]}${e.item.affixes.length > 0 ? ` ${e.item.affixes.length}纹` : ''}`,",
  "    value: `${e.item.name} · ${RARITY_NAME[e.item.rarity]}${e.item.affixes.length > 0 ? ` ${e.item.affixes.length}纹` : ''}${e.item.legendary ? ' · 传奇' : ''}`,",
  'equip-legend',
);

const oldBag = [
  "  const shown = s.bag.slice(0, 3);",
  "  if (shown.length === 0) return 0;",
  "  const lines: Line[] = shown.map((item) => ({",
  "    label: SLOT_NAME[item.slot] ?? item.slot,",
  "    value: `${RARITY_NAME[item.rarity]} · 战力 ${Math.round(itemPower(item))}`,",
  "    color: RARITY_COLOR[item.rarity],",
  "  }));",
].join('\n');
const newBag = [
  "  const shown = s.bag.slice(0, 3);",
  "  if (shown.length === 0) return 0;",
  "  const equipped = equipmentSummary(s.character);",
  "  /** 同部位战力对比：只和「自己身上那件」比，跨部位不可比（玉佩 p50 是戒指的 7.4 倍） */",
  "  const diffOf = (item: (typeof shown)[number]): string => {",
  "    const slot = slotForItem(s.character, item);",
  "    const cur = slot ? equipped.find((e) => e.slot === slot) : undefined;",
  "    if (!cur) return ' · 空位';",
  "    const base = itemPower(cur.item);",
  "    if (!(base > 0)) return '';",
  "    const pct = Math.round(((itemPower(item) - base) / base) * 100);",
  "    return ` · ${pct >= 0 ? '+' : ''}${pct}%`;",
  "  };",
  "  const lines: Line[] = shown.map((item) => ({",
  "    label: SLOT_NAME[item.slot] ?? item.slot,",
  "    value: `${RARITY_NAME[item.rarity]} · 战力 ${Math.round(itemPower(item))}${diffOf(item)}${item.legendary ? ' · 传奇' : ''}`,",
  "    color: RARITY_COLOR[item.rarity],",
  "  }));",
].join('\n');
repl(oldBag, newBag, 'bag-compare');

fs.mkdirSync('F:/dsh-work/zhuoxian/tools/_bak', { recursive: true });
fs.writeFileSync(`F:/dsh-work/zhuoxian/tools/_bak/hud-panels.ts.${Date.now()}.bak`, raw, 'utf8');
fs.writeFileSync(p, crlf ? c.replace(/\n/g, '\r\n') : c, 'utf8');
console.log(`ok crlf=${crlf} ${before} -> ${c.length}`);
