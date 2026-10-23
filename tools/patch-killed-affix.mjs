import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/src/core/battle.ts';
const raw = fs.readFileSync(p, 'utf8');
const crlf = raw.includes('\r\n');
let n = raw.replace(/\r\n/g, '\n');
const before = n.length;

// KilledMonster 带上 affixIds（掉落数量加成要按「死的是哪只精英」算）
const oldIf = 'export interface KilledMonster {\n  readonly defId: string;\n  readonly tier: number;\n  readonly rarity: MonsterRarity;';
const newIf =
  'export interface KilledMonster {\n  readonly defId: string;\n  readonly tier: number;\n  readonly rarity: MonsterRarity;\n  /** 妖纹 id（空/未定义 = 普通浊物）。掉落数量加成靠它，不靠 rarity 反推 */\n  readonly affixIds?: readonly string[];';
if (!n.includes(oldIf)) throw new Error('MISS KilledMonster');
n = n.replace(oldIf, newIf);

// 两处构造击杀事件的地方都要透传
const oldA = '    rarity: target.rarity,';
if (!n.includes(oldA)) throw new Error('MISS kill event a');
n = n.replace(oldA, '    rarity: target.rarity,\n    affixIds: target.affixIds,');

if (n.length === before) throw new Error('没有变化');
if (crlf) n = n.replace(/\n/g, '\r\n');
fs.writeFileSync(`F:/dsh-work/zhuoxian/tools/_bak/battle.ts.${Date.now()}.bak`, raw);
fs.writeFileSync(p, n);
console.log(`battle.ts: ${before} -> ${n.length}`);
