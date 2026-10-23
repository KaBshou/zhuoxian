// 一次性：修「清档清不干净」——reset() 先 clear 再 reload，但 reload 触发 pagehide/beforeunload
// 的 flush() 又把当前会话写回 localStorage，于是清档后存档立刻复活（渊痕 777777、深层进度全回来）。
// 这是 dev 钩子的 bug，探针 probe-marks 的「满级前不产渊痕」假红就是它造成的。
// 修法：加一个 suppressFlush 开关，reset 时先立旗再 clear+reload。
import fs from 'node:fs';

const P = 'F:/dsh-work/zhuoxian/src/main.ts';
let c = fs.readFileSync(P, 'utf8');
const before = c.length;

function repl(a, b, tag) {
  if (!c.includes(a)) throw new Error('MISS: ' + tag);
  const n = c.split(a).length - 1;
  if (n !== 1) throw new Error(`AMBIGUOUS(${n}): ${tag}`);
  c = c.replace(a, b);
  console.log('OK:', tag);
}

repl(
  `/** 切后台 / 关页面时立刻存一次（挂机游戏最怕丢进度） */
function flush(): void {
  autosaver.saveNow();
}`,
  `/**
 * 清档期间不许写盘。
 *
 * reset() 的实现是「clear + reload」，而 reload 会触发 pagehide/beforeunload 上的 flush()，
 * 于是刚清掉的存档被当前会话原样写回去 —— 表现就是「点了清档，刷新一下进度全回来了」。
 * 这个旗子只在 reset() 里立一次，页面马上 reload，所以不需要复位。
 */
let suppressFlush = false;

/** 切后台 / 关页面时立刻存一次（挂机游戏最怕丢进度） */
function flush(): void {
  if (suppressFlush) return;
  autosaver.saveNow();
}`,
  'suppress-flag',
);

repl(
  `    reset: () => {
      autosaver.clear();
      location.reload();
    },`,
  `    reset: () => {
      suppressFlush = true;
      autosaver.clear();
      location.reload();
    },`,
  'reset-flag',
);

if (c.length < before * 0.95) throw new Error('结果比原文短，拒绝写盘');
fs.writeFileSync(P, c, 'utf8');
console.log('written', before, '->', c.length);
