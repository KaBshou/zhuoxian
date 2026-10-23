// 一次性补丁：character.ts 末尾补 characterGemLoadout（上一轮 SKIP 判断误判：函数从未写入）。
import fs from 'node:fs';
const p = 'F:/dsh-work/zhuoxian/src/core/character.ts';
let c = fs.readFileSync(p, 'utf8');
if (c.includes('export function characterGemLoadout')) { console.log('SKIP already'); process.exit(0); }
c += `
/** 装配表归一：只留已解锁 + 去重 + 截到 GEM_SLOTS 条。
 *  老存档带未知 id 直接丢弃，不让脏数据进战斗。 */
export function characterGemLoadout(ch: CharacterState): string[] {
  const out: string[] = [];
  for (const id of ch.gemLoadout ?? []) {
    const def = SUPPORT_GEMS.find((g) => g.id === id);
    if (!def || ch.step < def.unlockStep) continue;
    if (!out.includes(id)) out.push(id);
    if (out.length >= GEM_SLOTS) break;
  }
  return out;
}
`;
fs.writeFileSync(p, c, 'utf8');
console.log('OK');
