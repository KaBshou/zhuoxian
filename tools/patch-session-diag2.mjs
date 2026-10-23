// D95 诊断：给 session 加按稀有度的运行时计数（不入档、玩法不读）
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/src/core/session.ts';
const raw = fs.readFileSync(p, 'utf8');
const crlf = raw.includes('\r\n');
let n = raw.replace(/\r\n/g, '\n');
const before = n.length;

function rep(oldText, newText, tag) {
  if (!n.includes(oldText)) throw new Error(`MISS ${tag}`);
  const count = n.split(oldText).length - 1;
  if (count !== 1) throw new Error(`AMBIGUOUS ${tag}: ${count}`);
  n = n.replace(oldText, newText);
}

rep(
  'export interface GameSession {',
  [
    '/**',
    ' * 运行时诊断计数（**不入档**，也不是玩法状态）。',
    ' *',
    ' * 存在的唯一理由：按稀有度分解掉落 —— 妖纹上线后「出货总数 +9.8% 但法宝 −3%」',
    ' * 需要一个可复算的分解表来区分「份额挤压」与「多掷了一次闸」。',
    ' * **任何玩法逻辑都不许读它**：它只往上涨，不参与任何判定，也不进存档。',
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
    'export interface GameSession {',
    '  /** 运行时诊断计数（不入档，玩法不读） */',
    '  readonly diag: SessionDiag;',
  ].join('\n'),
  'GameSession 接口',
);

rep(
  '  return {\n    character: seeded,',
  '  return {\n    diag: createSessionDiag(),\n    character: seeded,',
  'createSession 返回字面量',
);

rep(
  '      s.kills += 1;\n      s.floorKills += 1;',
  [
    '      s.kills += 1;',
    '      s.floorKills += 1;',
    '      s.diag.killsByRarity[killed.rarity] += 1;',
  ].join('\n'),
  '击杀计数',
);

rep(
  '          s.pocket[cur.id] = (s.pocket[cur.id] ?? 0) + 1;',
  [
    '          s.pocket[cur.id] = (s.pocket[cur.id] ?? 0) + 1;',
    '          s.diag.currencyByRarity[killed.rarity] += 1;',
  ].join('\n'),
  '通货分支',
);

rep(
  '          s.gemPouch[gem.id] = (s.gemPouch[gem.id] ?? 0) + 1;',
  [
    '          s.gemPouch[gem.id] = (s.gemPouch[gem.id] ?? 0) + 1;',
    '          s.diag.gemByRarity[killed.rarity] += 1;',
  ].join('\n'),
  '玉简分支',
);

rep(
  '        if (item) addGroundDrop(s, item, killed.x, killed.y);',
  [
    '        if (item) {',
    '          addGroundDrop(s, item, killed.x, killed.y);',
    '          s.diag.itemsByRarity[killed.rarity] += 1;',
    '        }',
  ].join('\n'),
  '法宝分支',
);

if (n.length === before) throw new Error('没有变化');
if (crlf) n = n.replace(/\n/g, '\r\n');
fs.mkdirSync('F:/dsh-work/zhuoxian/tools/_bak', { recursive: true });
fs.writeFileSync(`F:/dsh-work/zhuoxian/tools/_bak/session.ts.${Date.now()}.bak`, raw);
fs.writeFileSync(p, n);
console.log(`session.ts: ${before} -> ${n.length}`);
