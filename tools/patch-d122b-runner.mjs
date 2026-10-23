// D122 第二批：session-runner 的按层停留统计 + 伤害构成（缩进按实际文件，2/4/6 空格）
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'F:\\dsh-work\\zhuoxian\\tools\\session-runner.mjs';
const raw = readFileSync(P, 'utf8');
const crlf = raw.includes('\r\n');
let t = raw.replace(/\r\n/g, '\n');

const edits = [
  [
    'stay-map',
    '  const postCapXianByFloor = new Map();',
    '  const postCapXianByFloor = new Map();\n' +
      '  // D122：满级后「每层停留分钟」—— 段④ 主口径改 76 层后必须能算「层 76 停留产出」\n' +
      '  const postCapMinutesByFloor = new Map();',
  ],
  [
    'stay-acc',
    '    if (Number.isFinite(maxedAt) && s.floor === F46) f46Minutes += dt / 60;',
    '    if (Number.isFinite(maxedAt) && s.floor === F46) f46Minutes += dt / 60;\n' +
      '    if (Number.isFinite(maxedAt)) postCapMinutesByFloor.set(s.floor, (postCapMinutesByFloor.get(s.floor) ?? 0) + dt / 60);',
  ],
  [
    'stay-report',
    '      byFloor: [...postCapXianByFloor.entries()].map(([floor, xian]) => ({ floor, xian })).sort((a, b) => a.floor - b.floor),',
    '      byFloor: [...postCapXianByFloor.entries()].map(([floor, xian]) => ({ floor, xian })).sort((a, b) => a.floor - b.floor),\n' +
      '      // D122：每层停留分钟 + 该层产出率（件/3h）；样本不足由输出方判「样本不足」而不是给数\n' +
      '      stayByFloor: [...new Set([...postCapXianByFloor.keys(), ...postCapMinutesByFloor.keys()])]\n' +
      '        .map((floor) => {\n' +
      '          const mins = postCapMinutesByFloor.get(floor) ?? 0;\n' +
      '          const xian = postCapXianByFloor.get(floor) ?? 0;\n' +
      '          return { floor, minutes: mins, xian, per3h: mins > 0 ? (xian / mins) * 180 : NaN };\n' +
      '        })\n' +
      '        .sort((a, b) => a.floor - b.floor),',
  ],
  [
    'split-report',
    '    realmArrivals,',
    '    // D122：伤害构成（武器段 vs 神通段）——验证「深层 DPS 是否靠 skillFloorScale 撑着」\n' +
      '    damageSplit: { weapon: s.battle.weaponDamage, skill: s.battle.skillDamage },\n' +
      '    realmArrivals,',
  ],
];

for (const [tag, oldT, newT] of edits) {
  if (t.includes(newT)) continue;
  const hits = t.split(oldT).length - 1;
  if (hits !== 1) throw new Error(`[${tag}] 命中 ${hits} 次`);
  t = t.replace(oldT, newT);
}
writeFileSync(P, crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
console.log('ok', raw.length, '→', t.length);
