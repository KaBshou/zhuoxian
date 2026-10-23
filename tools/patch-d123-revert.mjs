// D123 回滚 + 修 bug：
// ① sword 基底回滚成 flat —— 实测 flat→increased 让满级 284.7 → 457.0（+52%），
//    shuzhi 预估 −3~6% 落空。根因：早期（境 1）伤害几乎全靠普攻，而 flat 8 打在 p.damage 基数 5 上是 +160%，
//    换成 increased 0.08 只有 +8% ⇒ 早期击杀速度崩 58% ⇒ 满级整体后移。**同一组数字，换 op 完全不等价。**
// ② 修 least-slack 的真 bug：`castCooldowns` 初始化是 `{}`，于是 tick 里 `Object.keys(castCooldowns)`
//    一个键都没有 ⇒ `skillOverdue` 永远为空 ⇒ 所有 score 都是 0 ⇒ 又退回「表序第一个就绪」。
//    必须用 rotation 初始化冷却表。
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

patch('src/data/bases.ts', [
  [
    't1',
    "  // D123：sword 的 damage 必须是 increased 而不是 flat —— flat 只进 p.damage（普攻 0.51%，flat 通道已死），\n  // increased 进全伤害乘区（固定型神通 99.49% 也在里面）。数值沿用原三档量级（0.08/0.14/0.24 + 3%/灵蕴）。\n  { id: 'sword-t1', slot: 'sword', name: '铁剑', main: 'damage', mainOp: 'increased', mainFlat: 0.08, mainPerIlvl: 0.0024, tier: 1 },",
    "  // D123 实测记录（回滚）：把 sword 的 damage 从 flat 改 increased（0.08/0.14/0.24）后满级 284.7 → 457.0（+52%）。\n  // 原因：早期伤害几乎全靠普攻，flat 8 打在 p.damage 基数 5 上是 +160%，而 increased 0.08 只有 +8%。\n  // 「同一组数字换 op」并不等价 —— flat 在小基数上是指数级的。要复活这个部位，得先解决「deep 普攻不吃层缩放」。\n  { id: 'sword-t1', slot: 'sword', name: '铁剑', main: 'damage', mainOp: 'flat', mainFlat: 8, mainPerIlvl: 0.24, tier: 1 },",
  ],
  [
    't2',
    "{ id: 'sword-t2', slot: 'sword', name: '青锋法剑', main: 'damage', mainOp: 'increased', mainFlat: 0.14, mainPerIlvl: 0.0042, tier: 2 },",
    "{ id: 'sword-t2', slot: 'sword', name: '青锋法剑', main: 'damage', mainOp: 'flat', mainFlat: 14, mainPerIlvl: 0.42, tier: 2 },",
  ],
  [
    't3',
    "{ id: 'sword-t3', slot: 'sword', name: '逐电飞剑', main: 'damage', mainOp: 'increased', mainFlat: 0.24, mainPerIlvl: 0.0072, tier: 3 },",
    "{ id: 'sword-t3', slot: 'sword', name: '逐电飞剑', main: 'damage', mainOp: 'flat', mainFlat: 24, mainPerIlvl: 0.72, tier: 3 },",
  ],
]);

patch('src/core/battle.ts', [
  [
    'init-cooldowns',
    '    castCooldowns: {},\n    skillOverdue: {},',
    '    // D123 修 bug：冷却表必须用 rotation 初始化 —— 若留空对象，tick 里 `Object.keys(castCooldowns)`\n' +
      '    // 一个键都没有，`skillOverdue` 永远为空，least-slack 的全部 score 都是 0，于是又退回「表序第一个就绪」。\n' +
      '    castCooldowns: Object.fromEntries(rotation.map((sk) => [sk.id, 0])),\n' +
      '    skillOverdue: Object.fromEntries(rotation.map((sk) => [sk.id, 0])),',
  ],
  [
    'reset-cooldowns',
    '      state.castCooldowns = {}; // 冷却表一并清空，避免复活瞬间白屏一个不可用列表\n      state.skillOverdue = {};',
    '      // 冷却表清空后要按当前 rotation 重建（不能留空对象，理由同 createBattle 里的注释）\n' +
      '      state.castCooldowns = Object.fromEntries(state.skillRotation.map((sk) => [sk.id, 0]));\n' +
      '      state.skillOverdue = Object.fromEntries(state.skillRotation.map((sk) => [sk.id, 0]));',
  ],
]);
