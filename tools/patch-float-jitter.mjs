// 一次性补丁：浮字抖动不再消耗 rng（浮字是纯显示，吃 rng 会改变后面的掉落序列）
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/src/core/session.ts';
const orig = fs.readFileSync(p, 'utf8');
let c = orig;

function repl(old, neu, tag) {
  const n = c.split(old).length - 1;
  if (n !== 1) throw new Error(`MISS(${n}): ${tag}`);
  c = c.replace(old, neu);
  console.log('ok:', tag);
}

repl(
  `        x: (e.x ?? BATTLE_W / 2) + s.rng.float(-8, 8),
        y: (e.y ?? BATTLE_H / 2) - 8,`,
  `        // 抖动必须**确定性**：浮字是纯显示，吃 rng 会把「第几条随机数」整体错位，
        // 后续所有掉落序列都跟着变 —— 重建时实测种子 3 的满级时长因此偏离 10%。
        x: (e.x ?? BATTLE_W / 2) + jitter(e.amount, 7),
        y: (e.y ?? BATTLE_H / 2) - 8,`,
  'crit-float-jitter',
);

repl(
  `        x: (e.x ?? BATTLE_W / 2) + s.rng.float(-6, 6),
        y: (e.y ?? BATTLE_H / 2) - 30,`,
  `        x: (e.x ?? BATTLE_W / 2) + jitter(e.amount, 5),
        y: (e.y ?? BATTLE_H / 2) - 30,`,
  'hit-float-jitter',
);

repl(
  `/** 波末回气：一次给满比例（25%） */`,
  `/** 确定性抖动（-n..+n）：只给浮字错开位置用，不消耗 rng */
function jitter(seed: number | undefined, n: number): number {
  const v = Math.abs(Math.round((seed ?? 0) * 2654435761)) % 1000;
  return ((v / 1000) * 2 - 1) * n;
}

/** 波末回气：一次给满比例（25%） */`,
  'jitter-helper',
);

if (c.length < orig.length) throw new Error(`拒绝写盘：结果 ${c.length}B 比原文 ${orig.length}B 短`);
fs.writeFileSync(p, c, 'utf8');
console.log('done', c.length, 'B');
