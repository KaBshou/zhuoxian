// 一次性：probe-marks.mjs 改用 window.__zhuoxian.reset()（真清档）替代 localStorage.clear()
// 原因：localStorage.clear() 之后 reload 会被 pagehide 的 flush 写回旧档，清了等于没清。
import fs from 'node:fs';

const P = 'F:/dsh-work/tools/probe-marks.mjs';
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
  `  // 先清一次存档再重开：探针会往存档里写 777777 / 深层进度，
  // 不清的话第二次跑必假红（历史上有 2 项就是被上一轮残留顶掉的）。
  await cdp.send('Page.navigate', { url: URL });
  await sleep(1200);
  await cdp.eval('(()=>{try{localStorage.clear();return true}catch{return false}})()');
  await cdp.send('Page.reload', { ignoreCache: true });
  await sleep(2500);`,
  `  // 先清一次存档再重开：探针会往存档里写 777777 / 深层进度，
  // 不清的话第二次跑必假红。必须用 __zhuoxian.reset()（带 suppressFlush），
  // 直接用 localStorage.clear() 会被离场 flush 写回旧档。
  await cdp.send('Page.navigate', { url: URL });
  await sleep(1800);
  await cdp.eval('(()=>{window.__zhuoxian?.reset();return true})()');
  await sleep(2500);`,
  'use-reset',
);

if (c.length < before * 0.95) throw new Error('结果比原文短，拒绝写盘');
fs.writeFileSync(P, c, 'utf8');
console.log('written', before, '->', c.length);
