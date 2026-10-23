// D134/D135：攻不吃周目 + 按层渐入的 effCycle(floor)
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve('.');
function read(p) {
  const raw = fs.readFileSync(path.join(ROOT, p), 'utf8');
  return { text: raw.replace(/\r\n/g, '\n'), crlf: raw.includes('\r\n') };
}
function write(p, text, crlf) {
  fs.writeFileSync(path.join(ROOT, p), crlf ? text.replace(/\n/g, '\r\n') : text, 'utf8');
}
function patch(p, edits) {
  const { text, crlf } = read(p);
  let t = text;
  for (const [tag, oldText, newText] of edits) {
    const at = t.indexOf(oldText);
    if (at < 0) throw new Error(`MISS ${p} :: ${tag}`);
    if (t.indexOf(oldText, at + 1) >= 0) throw new Error(`AMBIGUOUS ${p} :: ${tag}`);
    t = t.slice(0, at) + newText + t.slice(at + oldText.length);
  }
  if (t.length < text.length * 0.9) throw new Error(`SHRINK ${p}`);
  write(p, t, crlf);
  console.log(`patched ${p} (${text.length} -> ${t.length})`);
}

patch('src/data/cycles.ts', [
  [
    'dmg mul',
    "/** 每周目怪物攻伐倍率（乘算：第 N 周目 = 1.25^N） */\nexport const CYCLE_DMG_MUL = 1.25;",
    [
      '/**',
      ' * 每周目怪物攻伐倍率（D134：**攻不再吃周目**，1.25 → 1.00）。',
      ' *',
      ' * 为什么拿掉：补 9h 需要的是「时长」不是「死亡」。血 ×1.35 已经把时长给足（击杀率 ×0.74）；',
      ' * 而全重置后玩家每轮回到同一强度，`1.25^N` 的攻直接压在同一份 EHP 上 ——',
      ' * 实测 c1 只 +25% 攻就让死亡中位 1.5 → 18.5、首次撞墙 60 → 35，c2 直接在层 1 就死。',
      ' * 那不是难度，是惩罚。危险的来源已经有 §6.5 的 threat 斜坡（层 22+ ×1~4、镇守 ×1.5），',
      ' * 不需要周目再叠一层。将来真要「越轮回越险」，正确形状是 1.05^N 缓坡 + 配套 EHP 通道。',
      ' */',
      'export const CYCLE_DMG_MUL = 1.0;',
    ].join('\n'),
  ],
  [
    'effCycle',
    '/** 第 N 周目的怪物气血倍率。脏输入按第 0 周目（= 1）。 */\nexport function cycleHpMul(cycle: number): number {\n  const c = Number.isFinite(cycle) && cycle > 0 ? Math.floor(cycle) : 0;\n  return Math.pow(CYCLE_HP_MUL, c);\n}',
    [
      '/** 渐入起点层：层 1~9 不吃周目倍率（轮回后从 0 装备起跑，那一段就是教学期） */',
      'export const CYCLE_FADE_FROM_FLOOR = 9;',
      '',
      '/**',
      ' * 按层渐入的有效周目数（D135）：`cycle × clamp((floor − 9) / 9, 0, 1)`。',
      ' *',
      ' * 为什么按**层**不按强度：轮回后玩家从 0 装备起跑，「层 1~9」对新角色就该是教学期；',
      ' * 按层渐入 = 用「你已经打过一遍」这个事实承接倍率，而不是拿倍率去惩罚重开。',
      ' */',
      'export function effectiveCycle(cycle: number, floor: number): number {',
      '  const c = Number.isFinite(cycle) && cycle > 0 ? Math.floor(cycle) : 0;',
      '  if (c === 0) return 0;',
      '  const f = Number.isFinite(floor) && floor > 0 ? Math.floor(floor) : 1;',
      '  const fade = Math.min(1, Math.max(0, (f - CYCLE_FADE_FROM_FLOOR) / CYCLE_FADE_FROM_FLOOR));',
      '  return c * fade;',
      '}',
      '',
      '/** 第 N 周目的怪物气血倍率（接受小数 = 渐入后的有效周目）。脏输入按第 0 周目（= 1）。 */',
      'export function cycleHpMul(cycle: number): number {',
      '  const c = Number.isFinite(cycle) && cycle > 0 ? cycle : 0;',
      '  return Math.pow(CYCLE_HP_MUL, c);',
      '}',
    ].join('\n'),
  ],
  [
    'dmg mul fn',
    '/** 第 N 周目的怪物攻伐倍率。脏输入按第 0 周目（= 1）。 */\nexport function cycleDmgMul(cycle: number): number {\n  const c = Number.isFinite(cycle) && cycle > 0 ? Math.floor(cycle) : 0;\n  return Math.pow(CYCLE_DMG_MUL, c);\n}',
    '/** 第 N 周目的怪物攻伐倍率（接受小数；D134 起 CYCLE_DMG_MUL = 1 ⇒ 恒为 1）。 */\nexport function cycleDmgMul(cycle: number): number {\n  const c = Number.isFinite(cycle) && cycle > 0 ? cycle : 0;\n  return Math.pow(CYCLE_DMG_MUL, c);\n}',
  ],
]);

patch('src/core/battle.ts', [
  [
    'import effCycle',
    "import { cycleDmgMul, cycleHpMul } from '../data/cycles';",
    "import { cycleDmgMul, cycleHpMul, effectiveCycle } from '../data/cycles';",
  ],
  [
    'hp',
    'Math.round(BASE_MONSTER_HP * def.hpMul * s.hp * bossRel * (1 + affix.lifeInc) * cycleHpMul(cycle)),',
    'Math.round(\n        BASE_MONSTER_HP * def.hpMul * s.hp * bossRel * (1 + affix.lifeInc) * cycleHpMul(effectiveCycle(cycle, floor)),\n      ),',
  ],
  [
    'dmg',
    'BASE_MONSTER_DAMAGE * def.dmgMul * s.damage * (1 + affix.damageInc) * threatMul(floor, !!def.boss) * cycleDmgMul(cycle),',
    'BASE_MONSTER_DAMAGE *\n          def.dmgMul *\n          s.damage *\n          (1 + affix.damageInc) *\n          threatMul(floor, !!def.boss) *\n          cycleDmgMul(effectiveCycle(cycle, floor)),',
  ],
]);
console.log('done');
