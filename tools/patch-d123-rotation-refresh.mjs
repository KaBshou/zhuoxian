// D123 真根因：`skillRotation` 是**快照** —— 只在 createBattle 时按当时已解锁的神通构建，之后
// `syncBattleFromCharacter` 只替换 `player`，从不刷新 rotation。于是第 4/9/18/27 重解锁的
// 寒水剑 / 召火竹 / 焚天掌 / 锋锐金芒**终生不出场**（实测武器型神通伤害占比 0.00%）。
// 修法：刷新 rotation，并用「并集」维护 castCooldowns / skillOverdue（新增的神通从 0 开始，移出的丢弃）。
import { readFileSync, writeFileSync } from 'node:fs';

const P = 'F:\\dsh-work\\zhuoxian\\src\\core\\session.ts';
const raw = readFileSync(P, 'utf8');
const crlf = raw.includes('\r\n');
let t = raw.replace(/\r\n/g, '\n');
const before = t.length;

const edits = [
  [
    'import',
    "import { playerBattleFromCharacter } from './battle';",
    "import { playerBattleFromCharacter } from './battle';\nimport { unlockedSkills } from './skills-runtime';",
  ],
  [
    'sync',
    'export function syncBattleFromCharacter(s: GameSession): void {\n  const next = playerBattleFromCharacter(s.character);',
    'export function syncBattleFromCharacter(s: GameSession): void {\n' +
      '  const next = playerBattleFromCharacter(s.character);\n' +
      '  // D123：神通轮转必须跟着境界刷新。旧实现只在 createBattle 时算一次快照 ⇒\n' +
      '  // 第 4/9/18/27 重解锁的神通终生不进轮转（实测武器型神通伤害占比 0.00%）。\n' +
      '  // 冷却表用并集维护：新解锁的神通从 0 冷却开始，被移除的丢弃（不重置已就绪的别的神通）。\n' +
      '  const rotationNext = unlockedSkills(s.character).filter((sk) => sk.cooldown > 0);\n' +
      '  const ids = new Set(rotationNext.map((sk) => sk.id));\n' +
      '  for (const id of Object.keys(s.battle.castCooldowns)) {\n' +
      '    if (!ids.has(id)) delete s.battle.castCooldowns[id];\n' +
      '  }\n' +
      '  for (const id of Object.keys(s.battle.skillOverdue)) {\n' +
      '    if (!ids.has(id)) delete s.battle.skillOverdue[id];\n' +
      '  }\n' +
      '  for (const id of ids) {\n' +
      '    if (!(id in s.battle.castCooldowns)) s.battle.castCooldowns[id] = 0;\n' +
      '    if (!(id in s.battle.skillOverdue)) s.battle.skillOverdue[id] = 0;\n' +
      '  }\n' +
      '  s.battle.skillRotation = rotationNext;',
  ],
];

for (const [tag, oldT, newT] of edits) {
  if (t.includes(newT)) continue;
  const hits = t.split(oldT).length - 1;
  if (hits !== 1) throw new Error(`[${tag}] 命中 ${hits} 次`);
  t = t.replace(oldT, newT);
}
writeFileSync(P, crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
console.log('ok', before, '→', t.length);
