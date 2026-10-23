// 一次性：breakdown.test.ts 的 makePlayer 从「手搓字面量 + as PlayerBattle」换成工厂
// 起因：PlayerBattle 加 killHeal/doubleStrike/boomMore 后，`as PlayerBattle` 只能靠 tsc 报错
// 才暴露缺字段；而且旧字面量里 critMulti / moveSpeed 根本不是这个接口的字段（早就在撒谎）。
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/tests/breakdown.test.ts';
const raw = fs.readFileSync(p, 'utf8');
const crlf = raw.includes('\r\n');
let c = raw.replace(/\r\n/g, '\n');
const before = c.length;

const start = c.indexOf('function makePlayer(): PlayerBattle {');
const endMarker = '  } as PlayerBattle;\n}';
const end = c.indexOf(endMarker, start);
if (start < 0 || end < 0) throw new Error('MISS makePlayer block');
const stop = end + endMarker.length;

const replacement = [
  'function makePlayer(): PlayerBattle {',
  '  // 用工厂而不是手搓字面量：接口加字段时**这里不会静默缺字段**（`as PlayerBattle`',
  '  // 会把它藏起来，直到 tsc 在别处报错 —— 本轮加传奇旗子就是这么暴露的）。',
  '  return createPlayerBattle({',
  '    maxHp: 500,',
  '    level: 1,',
  '    armor: 0,',
  '    damage: 30,',
  '    attackSpeed: 1,',
  '    critChance: 0,',
  '    range: 200,',
  '    maxMana: 100,',
  '  });',
  '}',
].join('\n');

c = c.slice(0, start) + replacement + c.slice(stop);

if (!c.includes('  createPlayerBattle,')) {
  const anchor = "import { createBattle, spawnMonster, tickBattle } from '../src/core/battle';";
  if (!c.includes(anchor)) throw new Error('MISS import anchor');
  c = c.replace(anchor, "import { createBattle, createPlayerBattle, spawnMonster, tickBattle } from '../src/core/battle';");
}

fs.writeFileSync(p, crlf ? c.replace(/\n/g, '\r\n') : c, 'utf8');
console.log(`ok crlf=${crlf} ${before} -> ${c.length}`);
