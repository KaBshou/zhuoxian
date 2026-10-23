// 一次性：按 D62「同一条旗子取最大值，不求和」更新测试，并补两条新钉子
//   D61：带传奇的仙品必须能换上身（itemPower 读不到 legendary）
//   D62：10 部位全带血祭也只有 8% 回气，堆同一条传奇零收益
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/tests/legendary.test.ts';
const raw = fs.readFileSync(p, 'utf8');
const crlf = raw.includes('\r\n');
let c = raw.replace(/\r\n/g, '\n');
const before = c.length;

const oldBlock = [
  "  it('重复叠加被封顶（有界，不产生无限战力）', () => {",
  '    // 手动塞 20 件血祭（正常游戏里不可能：每个部位一件，但上限必须存在）',
  '    const equipment: Partial<Record<SlotId, Item>> = {};',
  "    for (const s of SLOT_IDS) equipment[s] = makeTestItem('xueji');",
  '    const flags = legendaryFlags(equipment);',
  '    expect(flags.killHeal).toBeLessThanOrEqual(0.5);',
  '    expect(flags.killHeal).toBeCloseTo(0.5, 6);',
  '  });',
  '});',
].join('\n');

const newBlock = [
  "  it('同一条旗子取最大值，不求和（D62：堆同一条传奇零收益）', () => {",
  '    // 10 部位全带血祭。求和的话是 0.8（8%×10 = 80% 击杀回气 = 不死之身），',
  '    // 而这是**可刷的** —— 那就成了 D45 禁止的无限战力种子。取最大后仍是 8%。',
  '    const equipment: Partial<Record<SlotId, Item>> = {};',
  "    for (const s of SLOT_IDS) equipment[s] = makeTestItem('xueji');",
  '    const flags = legendaryFlags(equipment);',
  '    expect(flags.killHeal).toBeCloseTo(0.08, 6);',
  '  });',
  '',
  "  it('不同旗子互不影响（三条各取各自的最大值）', () => {",
  '    const equipment: Partial<Record<SlotId, Item>> = {',
  "      sword: makeTestItem('xueji'),",
  "      robe: makeTestItem('shuangying'),",
  "      crown: makeTestItem('zhuopo'),",
  '    };',
  '    const flags = legendaryFlags(equipment);',
  '    expect(flags.killHeal).toBeCloseTo(0.08, 6);',
  '    expect(flags.doubleStrike).toBeCloseTo(0.18, 6);',
  '    expect(flags.boomMore).toBeCloseTo(0.5, 6);',
  '  });',
  '});',
  '',
  "describe('传奇效果 · itemPower 盲区（D61）', () => {",
  "  it('带传奇的仙品即使战力更低也能换上身（否则传奇永远进不了身）', () => {",
  "    const ch = createCharacter('yujian');",
  '    // 身上先穿一件很肥的普通武器（战力远高于仙品），再把仙品给它比',
  "    const fat = makeTestItem(undefined, [affix(0), affix(1), affix(2), affix(3)]);",
  '    const withFat = { ...ch, equipment: { ...ch.equipment, sword: fat } };',
  "    const legend = makeTestItem('taiyi');",
  '    expect(itemPower(legend)).toBeLessThan(itemPower(fat));',
  '    const decision = decideEquip(withFat, legend);',
  '    expect(decision.shouldEquip).toBe(true);',
  '  });',
  '',
  "  it('两件都有传奇时回到战力比较（不会互相无限换装）', () => {",
  "    const ch = createCharacter('yujian');",
  "    const strong = makeTestItem('taiyi', [affix(0), affix(1), affix(2), affix(3)]);",
  '    const withLegend = { ...ch, equipment: { ...ch.equipment, sword: strong } };',
  "    const weak = makeTestItem('zhuopo');",
  '    expect(decideEquip(withLegend, weak).shouldEquip).toBe(false);',
  '  });',
  '});',
].join('\n');

if (!c.includes(oldBlock)) throw new Error('MISS flags block');
c = c.replace(oldBlock, newBlock);

const importAnchor = "import { rollLootMany } from '../src/core/loot';";
if (!c.includes(importAnchor)) throw new Error('MISS import anchor');
c = c.replace(
  importAnchor,
  importAnchor + "\nimport { decideEquip, itemPower } from '../src/core/inventory';",
);

fs.writeFileSync(p, crlf ? c.replace(/\n/g, '\r\n') : c, 'utf8');
console.log(`ok crlf=${crlf} ${before} -> ${c.length}`);
