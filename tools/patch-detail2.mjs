// 一次性补丁 2：main.ts 接 KeyE（用真实锚点：D 键那段 + 调试钩子）
import fs from 'node:fs';

const ROOT = 'F:/dsh-work/zhuoxian';
const files = {};
function load(rel) {
  const p = `${ROOT}/${rel}`;
  const c = fs.readFileSync(p, 'utf8');
  files[rel] = { p, orig: c, cur: c };
  fs.writeFileSync(`${ROOT}/tools/_bak/${rel.replace(/\//g, '_')}.${Date.now()}.bak`, c, 'utf8');
}
function repl(rel, old, neu, tag) {
  const f = files[rel];
  const n = f.cur.split(old).length - 1;
  if (n !== 1) throw new Error(`MISS(${n}) ${rel}: ${tag}`);
  f.cur = f.cur.replace(old, neu);
  console.log('ok:', rel, tag);
}
function flush(rel) {
  const f = files[rel];
  if (f.cur.length < f.orig.length * 0.98) throw new Error(`拒绝写盘 ${rel}`);
  fs.writeFileSync(f.p, f.cur, 'utf8');
  console.log('flush', rel, f.cur.length, 'B');
}

load('src/main.ts');
repl('src/main.ts',
  `  // D = 损伤详解面板（"我这一下为什么只打出这么点"的答案）
  if (e.code === 'KeyD') {`,
  `  // E = 法宝详情（"我身上这 9 件到底有什么灵纹"的答案）
  if (e.code === 'KeyE') {
    const on = renderer.toggleDetail();
    session.log.push({
      text: on ? '打开法宝详情（再按 E 关闭）' : '关闭法宝详情',
      color: '#6d665c',
      age: 0,
    });
    return;
  }
  // D = 损伤详解面板（"我这一下为什么只打出这么点"的答案）
  if (e.code === 'KeyD') {`,
  'key-e',
);
flush('src/main.ts');

// 调试钩子：找到 toggleBreakdown 那一行加登记
load('src/main.ts');
const f = files['src/main.ts'];
const probe = f.cur.indexOf('toggleBreakdown');
if (probe < 0) {
  console.log('钩子里没有 toggleBreakdown —— 打印附近内容供下一轮定位');
  const win = f.cur.indexOf('__zhuoxian');
  console.log(f.cur.slice(win, win + 900));
} else {
  const lineStart = f.cur.lastIndexOf('\n', probe) + 1;
  const lineEnd = f.cur.indexOf('\n', probe);
  const line = f.cur.slice(lineStart, lineEnd);
  console.log('anchor line:', line);
  f.cur = f.cur.slice(0, lineEnd + 1)
    + line.replace(/^(\s*)/, '$1').replace('toggleBreakdown:', 'toggleDetail: () => renderer.toggleDetail(),\n' + line.match(/^\s*/)[0] + 'toggleBreakdown:')
    + f.cur.slice(lineEnd + 1);
  fs.writeFileSync(f.p, f.cur, 'utf8');
  console.log('flush src/main.ts', f.cur.length, 'B');
}
console.log('done');
