// 一次性补丁：修「层 28 硬天花板」（ceshi FINDING 1）
// 原判据 `s.wave % BOSS_EVERY === 0 && hasBossFloor(s.floor) && ...`
// hasBossFloor 对无尽层（f>27）只认 f%5===0 → 层 28/29/31... 永远没有镇守波 → 永远不满足下潜条件
// 结果：层 28 变硬天花板，层 29~46 不可达（6/6 种子卡在 28）。
//
// 修法：下潜只看「这一层的第 10 波清完了」，不再问这层有没有镇守。
//   - 主线 1~27：每层都有镇守，且第 10 波就是镇守波 → 行为一位不变（仍是「打完镇守下潜」）
//   - 无尽 28+：普通层第 10 波是普通波，清完即下潜；镇守层（30/35/40/45）第 10 波是镇守波，打完下潜
import fs from 'node:fs';

const P = 'F:/dsh-work/zhuoxian/src/core/session.ts';
const BAK = `F:/dsh-work/zhuoxian/tools/_bak/session.ts.${Date.now()}.bak`;

let c = fs.readFileSync(P, 'utf8');
const before = c.length;
fs.writeFileSync(BAK, c, 'utf8');

function repl(oldText, newText, tag) {
  if (!c.includes(oldText)) throw new Error('MISS: ' + tag);
  const cnt = c.split(oldText).length - 1;
  if (cnt !== 1) throw new Error(`AMBIGUOUS(${cnt}): ` + tag);
  c = c.replace(oldText, newText);
  console.log('OK:', tag);
}

repl(
  `      // 打完镇守下潜 1 层（逐层下潜；曾写 +3 导致 1→4→7→9 跳层）
      if (s.wave % BOSS_EVERY === 0 && hasBossFloor(s.floor) && s.floor < MAX_FLOOR) {`,
  `      // 一层 = BOSS_EVERY(10) 波，第 10 波清完下潜 1 层（逐层下潜；曾写 +3 导致 1→4→7→9 跳层）。
      // **不要在这里判 hasBossFloor**：无尽层（28+）只有 30/35/40/45 有镇守，
      // 若下潜也要求「这层有镇守」，层 28 就永远没有镇守波 → 永远下不去 = 硬天花板（ceshi 实测 6/6 种子卡 28）。
      // 主线 1~27 每层都有镇守且第 10 波就是镇守波，所以去掉这个判断后主线行为一位不变。
      if (s.wave % BOSS_EVERY === 0 && s.floor < MAX_FLOOR) {`,
  'descent-drop-hasBossFloor',
);

// hasBossFloor 在 session.ts 里还有 startWave 一处在用，不能删 import
if (!c.includes('hasBossFloor(floor)')) throw new Error('hasBossFloor 的 startWave 用法不见了，检查是否误删');

if (c.length < before * 0.9) throw new Error('结果比原文短了 10% 以上，拒绝写盘');
fs.writeFileSync(P, c, 'utf8');
console.log('written', c.length, 'bak', BAK);
