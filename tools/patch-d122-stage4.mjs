// D122：段④ 主口径改「层 76 停留产出」+ 三条护栏；并加「伤害来源拆分」（武器段 vs 神通段）
//       用于验证 shuzhi 的假设 3（skillFloorScale 只对 fixed 类神通生效，weapon 类不吃）。
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
  const d = t.length - before;
  if (d < -600 || d > 20000) throw new Error(`[${rel}] 改动量异常 ${d}`);
  writeFileSync(P, crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
  console.log(`OK ${rel} ${before} → ${t.length}（+${d}）`);
}

// ── 1) battle.ts：两个伤害来源计数器（运行时，不入档） ──
patch('src/core/battle.ts', [
  [
    'fields',
    '  /** 单次最大入伤（D105 的「致死距离」代理：lifeMax / maxHit = 还能挨几下最重的） */\n  maxHit: number;',
    '  /** 单次最大入伤（D105 的「致死距离」代理：lifeMax / maxHit = 还能挨几下最重的） */\n  maxHit: number;\n' +
      '  /** D122：普攻（武器段）累计伤害 —— 用来验证「深层 DPS 构成」，运行时计数、不入档 */\n  weaponDamage: number;\n' +
      '  /** D122：神通（技能段）累计伤害；含 weapon 类神通（它吃 p.damage，不吃 skillFloorScale） */\n  skillDamage: number;',
  ],
  [
    'init',
    '  maxHit: 0,',
    '  maxHit: 0,\n  weaponDamage: 0,\n  skillDamage: 0,',
  ],
  [
    'skill-count',
    '  target.hp -= res.amount;\n  state.lastBreakdown = {\n    label: `${skill.name} → ${target.name}`,',
    '  target.hp -= res.amount;\n  state.skillDamage += res.amount;\n  state.lastBreakdown = {\n    label: `${skill.name} → ${target.name}`,',
  ],
  [
    'weapon-count',
    '  target.hp -= res.amount;\n  state.lastBreakdown = {\n    label: `普攻 → ${target.name}`,',
    '  target.hp -= res.amount;\n  state.weaponDamage += res.amount;\n  state.lastBreakdown = {\n    label: `普攻 → ${target.name}`,',
  ],
]);

// ── 2) session-runner：按层累计「停留分钟 + 仙品件数」，并透出伤害构成 ──
patch('tools/session-runner.mjs', [
  [
    'stay-map',
    'const postCapXianByFloor = new Map();',
    'const postCapXianByFloor = new Map();\n// D122：满级后「每层停留分钟」—— 段④ 主口径改 76 层后必须能算「层 76 停留产出」\nconst postCapMinutesByFloor = new Map();',
  ],
  [
    'stay-acc',
    '      if (Number.isFinite(maxedAt) && s.floor === F46) f46Minutes += dt / 60;',
    '      if (Number.isFinite(maxedAt) && s.floor === F46) f46Minutes += dt / 60;\n' +
      '      if (Number.isFinite(maxedAt)) postCapMinutesByFloor.set(s.floor, (postCapMinutesByFloor.get(s.floor) ?? 0) + dt / 60);',
  ],
  [
    'stay-report',
    '      byFloor: [...postCapXianByFloor.entries()].map(([floor, xian]) => ({ floor, xian })).sort((a, b) => a.floor - b.floor),',
    '      byFloor: [...postCapXianByFloor.entries()].map(([floor, xian]) => ({ floor, xian })).sort((a, b) => a.floor - b.floor),\n' +
      '      // D122：每层停留分钟 + 该层产出率（件/3h）；样本不足的层由输出方判「样本不足」而不是给数\n' +
      '      stayByFloor: [...new Set([...postCapXianByFloor.keys(), ...postCapMinutesByFloor.keys()])]\n' +
      '        .map((floor) => {\n' +
      '          const mins = postCapMinutesByFloor.get(floor) ?? 0;\n' +
      '          const xian = postCapXianByFloor.get(floor) ?? 0;\n' +
      '          return { floor, minutes: mins, xian, per3h: mins > 0 ? (xian / mins) * 180 : NaN };\n' +
      '        })\n' +
      '        .sort((a, b) => a.floor - b.floor),',
  ],
  [
    'combat-report',
    '    realmArrivals,',
    '    // D122：伤害构成（武器段 vs 神通段）——验证「深层 DPS 是否靠 skillFloorScale 撑着」\n' +
      '    damageSplit: { weapon: s.battle.weaponDamage, skill: s.battle.skillDamage },\n    realmArrivals,',
  ],
]);
