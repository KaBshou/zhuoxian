import fs from 'node:fs';
const P = 'F:/dsh-work/zhuoxian/tools/probe-playtest.mjs';
const raw = fs.readFileSync(P, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
let c = raw.replace(/\r\n/g, '\n');
if (c.includes('等 canvas 出现')) { console.log('SKIP'); process.exit(0); }

const old = `  await send('Page.navigate', { url: URL_WITH_CLASS });
  await sleep(3500);

  const host = await evaluate(\`(() => {`;
const neu = `  await send('Page.navigate', { url: URL_WITH_CLASS });

  // 等 canvas 出现（冷启动 + 首次 transform 可能要好几秒；写死 sleep 会随机器快慢假红）
  let host = null;
  for (let i = 0; i < 60; i += 1) {
    await sleep(300);
    host = await evaluate(
      \`(() => { const c = document.querySelector('canvas'); if (!c) return null; const r = c.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height, cw: c.width, ch: c.height }; })()\`,
    ).catch(() => null);
    if (host && host.width > 0) break;
  }
  if (!host) throw new Error('canvas 一直没出现（页面没加载起来？）');

  const _unusedHost = await evaluate(\`(() => {`;
if (c.split(old).length - 1 !== 1) { console.log('MISS nav'); process.exit(1); }
c = c.replace(old, neu);

// 删掉原来那段取 host 的旧代码（现在被 _unusedHost 顶替了）
const old2 = `  const _unusedHost = await evaluate(\`(() => {
    const c = document.querySelector('canvas');
    const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height, cw: c.width, ch: c.height };
  })()\`);
`;
if (c.split(old2).length - 1 !== 1) { console.log('MISS old2'); process.exit(1); }
c = c.replace(old2, '');
// 上面这段已经没用，直接删掉标记变量
c = c.replace('  const _unusedHost = await evaluate', '  await evaluate');

fs.writeFileSync(P, c.replace(/\n/g, eol), 'utf8');
console.log('OK', raw.length, '->', c.length);
