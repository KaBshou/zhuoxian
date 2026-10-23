// D95 诊断：按稀有度分解「每杀法宝数」（shuzhi 要的三行）
// 需要 session 侧计数：先给 session 加一个运行时计数（不入档）。
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/src/core/session.ts';
const raw = fs.readFileSync(p, 'utf8');
const crlf = raw.includes('\r\n');
let n = raw.replace(/\r\n/g, '\n');
const before = n.length;

// 1) 类型：diag 计数（运行时态，不入档）
const oldIface = 'export interface GameSession {';
if (!n.includes(oldIface)) throw new Error('MISS GameSession');
n = n.replace(
  oldIface,
  [
    '/**',
    ' * 运行时诊断计数（**不入档**，也不是玩法状态）。',
    ' *',
    ' * 存在的唯一理由：按稀有度分解掉落（D95 妖纹上线后「法宝/分 反而下降」需要一个',
    ' * 可复算的分解表）。**任何玩法逻辑都不许读它** —— 它只往上涨，不参与任何判定。',
    ' */',
    'export interface SessionDiag {',
    '  readonly killsByRarity: Record<MonsterRarity, number>;',
    '  readonly itemsByRarity: Record<MonsterRarity, number>;',
    '  readonly currencyByRarity: Record<MonsterRarity, number>;',
    '  readonly gemByRarity: Record<MonsterRarity, number>;',
    '}',
    '',
    'export function createSessionDiag(): SessionDiag {',
    '  return {',
    '    killsByRarity: { normal: 0, magic: 0, rare: 0, boss: 0 },',
    '    itemsByRarity: { normal: 0, magic: 0, rare: 0, boss: 0 },',
    '    currencyByRarity: { normal: 0, magic: 0, rare: 0, boss: 0 },',
    '    gemByRarity: { normal: 0, magic: 0, rare: 0, boss: 0 },',
    '  };',
    '}',
    '',
    oldIface,
  ].join('\n'),
);

// 2) GameSession 加字段
const oldField = 'export interface GameSession {';
n = n.replace(
  oldField,
  [oldField, '  /** 运行时诊断计数（不入档，玩法不读） */', '  readonly diag: SessionDiag;'].join(
    '\n',
  ),
);

// 3) createSession 里初始化
const oldCreate = '  return {';
if (!n.includes(oldCreate)) throw new Error('MISS createSession literal');
n = n.replace(oldCreate, [oldCreate, '    diag: createSessionDiag(),'].join('\n'));

// 4) 击杀处计数
const oldKill = '    s.kills += 1;\n    s.floorKills += 1;';
if (!n.includes(oldKill)) throw new Error('MISS kill counter');
n = n.replace(
  oldKill,
  [
    '      s.kills += 1;',
    '      s.floorKills += 1;',
    '      s.diag.killsByRarity[killed.rarity] += 1;',
  ].join('\n'),
);

// 5) 三类分支各自计数
const oldCur = '        s.pocket[cur.id] = (s.pocket[cur.id] ?? 0) + 1;';
if (!n.includes(oldCur)) throw new Error('MISS currency branch');
n = n.replace(oldCur, [oldCur, '        s.diag.currencyByRarity[killed.rarity] += 1;'].join('\n'));

const oldGem = '        s.gemPouch[gem.id] = (s.gemPouch[gem.id] ?? 0) + 1;';
if (!n.includes(oldGem)) throw new Error('MISS gem branch');
n = n.replace(oldGem, [oldGem, '        s.diag.gemByRarity[killed.rarity] += 1;'].join('\n'));

const oldItem = '      if (item) addGroundDrop(s, item, killed.x, killed.y);';
if (!n.includes(oldItem)) throw new Error('MISS item branch');
n = n.replace(
  oldItem,
  [
    '        if (item) {',
    '          addGroundDrop(s, item, killed.x, killed.y);',
    '          s.diag.itemsByRarity[killed.rarity] += 1;',
    '        }',
  ].join('\n'),
);

if (n.length === before) throw new Error('没有变化');
if (crlf) n = n.replace(/\n/g, '\r\n');
fs.writeFileSync(`F:/dsh-work/zhuoxian/tools/_bak/session.ts.${Date.now()}.bak`, raw);
fs.writeFileSync(p, n);
console.log(`session.ts: ${before} -> ${n.length}`);
