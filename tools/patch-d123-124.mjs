// D123/D124：两件事分开做（shuzhi 裁定）
//  ① sword 三基底的 main 从 flat damage（只进 p.damage → 普攻 0.51%）改成 increased damage（进 99.49% 的乘区）
//     —— flat 通道已死、increased 通道活着，所以「换 op」就能让 1/9 部位复活，且不动任何战斗公式。
//  ② 神通轮转从「表序第一个就绪」改成 least-slack「就绪后等得最久（按各自冷却归一）者先出」，
//     修掉「第 5/6 个神通从未出场」；cd = 0 的神通保持 filler（不进优先级竞争）。
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = 'F:\\dsh-work\\zhuoxian\\';
function patch(rel, edits) {
  const P = ROOT + rel;
  const raw = readFileSync(P, 'utf8');
  const crlf = raw.includes('\r\n');
  let t = raw.replace(/\r\n/g, '\n');
  const before = t.length;
  for (const [tag, oldT, newT] of edits) {
    if (t.includes(newT)) continue;
    const hits = t.split(oldT).length - 1;
    if (hits !== 1) throw new Error(`[${rel} · ${tag}] 命中 ${hits} 次`);
    t = t.replace(oldT, newT);
  }
  writeFileSync(P, crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
  console.log(`OK ${rel} ${before} → ${t.length}`);
}

// ── ① sword 基底换 op ──
patch('src/data/bases.ts', [
  [
    't1',
    "{ id: 'sword-t1', slot: 'sword', name: '铁剑', main: 'damage', mainOp: 'flat', mainFlat: 8, mainPerIlvl: 0.24, tier: 1 },",
    "// D123：sword 的 damage 必须是 increased 而不是 flat —— flat 只进 p.damage（普攻 0.51%，flat 通道已死），\n  // increased 进全伤害乘区（固定型神通 99.49% 也在里面）。数值沿用原三档量级（0.08/0.14/0.24 + 3%/灵蕴）。\n  { id: 'sword-t1', slot: 'sword', name: '铁剑', main: 'damage', mainOp: 'increased', mainFlat: 0.08, mainPerIlvl: 0.0024, tier: 1 },",
  ],
  [
    't2',
    "{ id: 'sword-t2', slot: 'sword', name: '青锋法剑', main: 'damage', mainOp: 'flat', mainFlat: 14, mainPerIlvl: 0.42, tier: 2 },",
    "{ id: 'sword-t2', slot: 'sword', name: '青锋法剑', main: 'damage', mainOp: 'increased', mainFlat: 0.14, mainPerIlvl: 0.0042, tier: 2 },",
  ],
  [
    't3',
    "{ id: 'sword-t3', slot: 'sword', name: '逐电飞剑', main: 'damage', mainOp: 'flat', mainFlat: 24, mainPerIlvl: 0.72, tier: 3 },",
    "{ id: 'sword-t3', slot: 'sword', name: '逐电飞剑', main: 'damage', mainOp: 'increased', mainFlat: 0.24, mainPerIlvl: 0.0072, tier: 3 },",
  ],
]);

// ── ② 轮转改 least-slack ──
patch('src/core/battle.ts', [
  [
    'field',
    '  castCooldowns: Record<string, number>;',
    '  castCooldowns: Record<string, number>;\n' +
      '  /** D123：每个神通「就绪后已等了多久」（秒）—— least-slack 调度用，按各自冷却归一后比大小 */\n' +
      '  skillOverdue: Record<string, number>;',
  ],
  [
    'init',
    '    castCooldowns: {},',
    '    castCooldowns: {},\n    skillOverdue: {},',
  ],
  [
    'reset',
    '      state.castCooldowns = {}; // 冷却表一并清空，避免复活瞬间白屏一个不可用列表',
    '      state.castCooldowns = {}; // 冷却表一并清空，避免复活瞬间白屏一个不可用列表\n      state.skillOverdue = {};',
  ],
  [
    'tick',
    '  for (const id of Object.keys(state.castCooldowns)) {\n    state.castCooldowns[id] = Math.max(0, state.castCooldowns[id] - d);',
    '  for (const id of Object.keys(state.castCooldowns)) {\n' +
      '    const before = state.castCooldowns[id];\n' +
      '    state.castCooldowns[id] = Math.max(0, before - d);\n' +
      '    // D123：已经就绪的神通继续累计「等了多久」—— 这才是 least-slack 的比较量\n' +
      '    if (before <= 0 || state.castCooldowns[id] === 0) {\n' +
      '      state.skillOverdue[id] = (state.skillOverdue[id] ?? 0) + d;\n' +
      '    }',
  ],
  [
    'call',
    '      const skill = pickNextSkillRaw(state.skillRotation, p.mana, state.castCooldowns, state.gemCostMulBySkill);',
    '      const skill = pickNextSkillRaw(\n' +
      '        state.skillRotation,\n' +
      '        p.mana,\n' +
      '        state.castCooldowns,\n' +
      '        state.gemCostMulBySkill,\n' +
      '        state.skillOverdue,\n' +
      '      );',
  ],
  [
    'oncast',
    '        p.mana -= skill.manaCost * (state.gemCostMulBySkill[skill.id] ?? 1);',
    '        p.mana -= skill.manaCost * (state.gemCostMulBySkill[skill.id] ?? 1);\n        state.skillOverdue[skill.id] = 0;',
  ],
  [
    'pick',
    [
      'function pickNextSkillRaw(',
      '  rotation: readonly ActiveSkillDef[],',
      '  mana: number,',
      '  cooldowns: Readonly<Record<string, number>>,',
      '  costMuls: Readonly<Record<string, number>>,',
      '): ActiveSkillDef | null {',
      '  for (const skill of rotation) {',
      '    if (skill.cooldown <= 0) continue; // cooldown=0 的当普攻形态，不独立施放',
      '    if ((cooldowns[skill.id] ?? 0) > 0) continue;',
      '    if (mana < skill.manaCost * (costMuls[skill.id] ?? 1)) continue;',
      '    return skill;',
      '  }',
      '  return null;',
      '}',
    ].join('\n'),
    [
      'function pickNextSkillRaw(',
      '  rotation: readonly ActiveSkillDef[],',
      '  mana: number,',
      '  cooldowns: Readonly<Record<string, number>>,',
      '  costMuls: Readonly<Record<string, number>>,',
      '  overdue: Readonly<Record<string, number>> = {},',
      '): ActiveSkillDef | null {',
      '  // D123 least-slack：在所有「就绪且真元够」的神通里，选「就绪后等得最久（按各自冷却归一）」的那个。',
      '  // 旧实现是「按表序返回第一个就绪的」⇒ 表序靠后的神通（焚天掌第 5、锋锐金芒第 6）永远轮不到，',
      '  // 实测武器型神通伤害占比 0.00%，不是数值问题而是调度问题。',
      '  // cd = 0 的神通仍是 filler（不参与优先级竞争，它的角色就是普攻形态）。',
      '  let best: ActiveSkillDef | null = null;',
      '  let bestScore = -1;',
      '  for (const skill of rotation) {',
      '    if (skill.cooldown <= 0) continue;',
      '    if ((cooldowns[skill.id] ?? 0) > 0) continue;',
      '    if (mana < skill.manaCost * (costMuls[skill.id] ?? 1)) continue;',
      '    const score = (overdue[skill.id] ?? 0) / skill.cooldown;',
      '    if (score > bestScore) {',
      '      bestScore = score;',
      '      best = skill;',
      '    }',
      '  }',
      '  return best;',
      '}',
    ].join('\n'),
  ],
]);
