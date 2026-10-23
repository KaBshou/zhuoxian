// 一次性：probe-marks.mjs 启动时清档（两次失败都是上一次运行残留的 localStorage 造成的假红）
// ①「满级前不产渊痕」读到上一轮写进去的 777777
// ②「按 2 落到第 5 层」被残留的 firstClearedFloors（到过 24 层）顶成 25
// 注意：文件里有两处 `Page.navigate + sleep(2500)`，锚点必须带上前一行空行/注释区分。
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
  `  await cdp.send('Page.navigate', { url: URL });
  await sleep(2500);

  const hooked = await cdp.eval('Boolean(window.__zhuoxian && window.__zhuoxian.session)');`,
  `  // 先清一次存档再重开：探针会往存档里写 777777 / 深层进度，
  // 不清的话第二次跑必假红（历史上有 2 项就是被上一轮残留顶掉的）。
  await cdp.send('Page.navigate', { url: URL });
  await sleep(1200);
  await cdp.eval('(()=>{try{localStorage.clear();return true}catch{return false}})()');
  await cdp.send('Page.reload', { ignoreCache: true });
  await sleep(2500);

  const hooked = await cdp.eval('Boolean(window.__zhuoxian && window.__zhuoxian.session)');`,
  'clear-save',
);

repl(
  `    '(()=>{const s=window.__zhuoxian.session;s.maxFloorReached=5;s.floor=1;return {floor:s.floor,max:s.maxFloorReached}})()',`,
  `    '(()=>{const s=window.__zhuoxian.session;s.firstClearedFloors=[];s.maxFloorReached=5;s.floor=1;return {floor:s.floor,max:s.maxFloorReached}})()',`,
  'clear-first-cleared',
);

if (c.length < before * 0.95) throw new Error('结果比原文短，拒绝写盘');
fs.writeFileSync(P, c, 'utf8');
console.log('written', before, '->', c.length);
