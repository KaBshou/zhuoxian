// 修 achievement.test.ts 里几条「我的测试写错了」的断言
import fs from 'node:fs';

const P = 'F:/dsh-work/zhuoxian/tests/achievement.test.ts';
let raw = fs.readFileSync(P, 'utf8');
const before = raw.length;

const pairs = [
  // 1) kill-500 不是真 id（真 id 是 kill-1/2/3）
  [
    "    const s = sanitizeAchievements({ unlocked: ['kill-500', 'nope', 'kill-500', null, 7, 'floor-10'] });\n    expect(s.unlocked).toEqual(['kill-500', 'floor-10']);",
    "    const s = sanitizeAchievements({ unlocked: ['kill-1', 'nope', 'kill-1', null, 7, 'floor-10'] });\n    expect(s.unlocked).toEqual(['kill-1', 'floor-10']);",
  ],
  // 2) EMPTY_FACTS.maxFloor === 1（脚下就是第一层），所以 floor-10 的进度是 1 不是 0
  [
    "  it('空档：条目全锁、进度 0', () => {\n    const entries = achievementEntries(createAchievements(), EMPTY_FACTS);\n    expect(entries.length).toBe(ACHIEVEMENT_TOTAL);\n    for (const e of entries) {\n      expect(e.unlocked).toBe(false);\n      expect(e.progress).toBe(0);\n    }\n  });",
    "  it('空档：条目全锁、进度只有「脚下第一层」那 1 点', () => {\n    const entries = achievementEntries(createAchievements(), EMPTY_FACTS);\n    expect(entries.length).toBe(ACHIEVEMENT_TOTAL);\n    for (const e of entries) {\n      expect(e.unlocked).toBe(false);\n      // EMPTY_FACTS.maxFloor = 1（玩家一开始就站在第 1 层）⇒ floor-10 进度是 1，其余全 0\n      expect(e.progress).toBe(e.target === 10 ? 1 : 0);\n    }\n  });",
  ],
  // 3) 已达成用真 id
  [
    "    const s = sanitizeAchievements({ unlocked: ['kill-500'] });\n    const fresh = newlyUnlocked(s, factsAllDone()).map((d) => d.id);\n    expect(fresh).not.toContain('kill-500');",
    "    const s = sanitizeAchievements({ unlocked: ['kill-1'] });\n    const fresh = newlyUnlocked(s, factsAllDone()).map((d) => d.id);\n    expect(fresh).not.toContain('kill-1');",
  ],
  // 4) 面板返回的 rows 是数组
  [
    '    expect(r.rows).toBe(ACHIEVEMENT_TOTAL);',
    '    expect(r.rows.length).toBe(ACHIEVEMENT_TOTAL);',
  ],
  // 5) 达成时用真 id
  [
    "    expect(hasAchievement(s.achievements, 'kill-500')).toBe(true);",
    "    expect(hasAchievement(s.achievements, 'kill-1')).toBe(true);",
  ],
  // 6) 死亡要走真实伤害路径：battle 只在 damagePlayer 里判 hp<=0，
  //    直接写 hp=0 不会产生 player-died 事件。
  [
    "    const s = createSession({ classId: 'yujian', seed: 13, tables: TABLES });\n    expect(s.deaths).toBe(0);\n    s.character.hp = 0;\n    s.battle.deathCleanup = true;\n    for (let i = 0; i < 30; i++) tickSession(s, 1 / 60);\n    expect(s.deaths).toBeGreaterThan(0);\n    expect(hasAchievement(s.achievements, 'death-1')).toBe(true);",
    "    const s = createSession({ classId: 'yujian', seed: 13, tables: TABLES });\n    expect(s.deaths).toBe(0);\n    // 死亡只发生在 damagePlayer 内部（battle.ts 的 `if (p.hp <= 0)`），\n    // 所以必须让怪真打着：把气血压到 1 点，等第一次挨打。\n    s.character = { ...s.character, hp: 1 };\n    for (let i = 0; i < 60 * 30 && s.deaths === 0; i++) tickSession(s, 1 / 60);\n    expect(s.deaths).toBeGreaterThan(0);\n    expect(hasAchievement(s.achievements, 'death-1')).toBe(true);",
  ],
];

for (const [oldText, newText] of pairs) {
  if (!raw.includes(oldText)) throw new Error(`MISS: ${oldText.slice(0, 50)}`);
  raw = raw.replace(oldText, newText);
}

if (raw.length < before) throw new Error('长度断言失败');
fs.writeFileSync(P, raw);
console.log(`test patched: ${before} -> ${raw.length}`);
