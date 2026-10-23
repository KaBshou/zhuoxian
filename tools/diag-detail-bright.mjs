// 诊断：详情面板打开时，画布上到底哪儿亮
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9346;
const profile = fs.mkdtempSync('C:/Windows/Temp/zx-diag-br-');
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--window-size=1000,620', '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding', '--no-first-run', '--no-default-browser-check',
  'http://127.0.0.1:5274/',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let url = null;
for (let i = 0; i < 80 && !url; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    url = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)?.webSocketDebuggerUrl ?? null;
  } catch { /* 等 */ }
  if (!url) await sleep(250);
}
const ws = new WebSocket(url);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const send = (method, params = {}) => {
  const mid = ++id;
  ws.send(JSON.stringify({ id: mid, method, params }));
  return new Promise((r) => pending.set(mid, r));
};
async function ev(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
}

await send('Runtime.enable');
for (let i = 0; i < 60; i++) {
  if (await ev('!!(window.__zhuoxian && window.__zhuoxian.session)')) break;
  await sleep(250);
}
await ev('localStorage.removeItem("zhuoxian.save.v1"); true');
await sleep(6000);

// 画布尺寸 + 网格最大亮度（20x11 格）
const grid = `(() => {
  const c = document.getElementById('stage');
  const ctx = c.getContext('2d');
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const GX = 20, GY = 11;
  const out = [];
  let bright = 0, verybright = 0;
  for (let gy = 0; gy < GY; gy++) {
    const row = [];
    for (let gx = 0; gx < GX; gx++) {
      let max = 0;
      for (let y = Math.floor(gy * c.height / GY); y < Math.floor((gy + 1) * c.height / GY); y++) {
        for (let x = Math.floor(gx * c.width / GX); x < Math.floor((gx + 1) * c.width / GX); x++) {
          const i = (y * c.width + x) * 4;
          const l = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
          if (l > max) max = l;
          if (l > 90) bright++;
          if (l > 170) verybright++;
        }
      }
      row.push(Math.round(max / 26)); // 0~9 压缩成一位数字
    }
    out.push(row.join(''));
  }
  // 关键：登记一下装备与灵纹条数，确认卡片里到底有没有字
  const eq = Object.entries(window.__zhuoxian.session.character.equipment)
    .map(([k, v]) => k + ':' + (v ? v.name + '/' + (v.affixes ? v.affixes.length : '?') : 'null'));
  return { w: c.width, h: c.height, bright, verybright, grid: out, eq };
})()`;

console.log('关闭态:', JSON.stringify(await ev(grid), null, 1));
await ev('window.__zhuoxian.toggleDetail()');
await sleep(600);
const opened = await ev(grid);
console.log('打开态:', JSON.stringify(opened, null, 1));

// 中央区域的详细亮度直方图
console.log('直方图:', JSON.stringify(await ev(`(() => {
  const c = document.getElementById('stage');
  const ctx = c.getContext('2d');
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const h = new Array(8).fill(0);
  for (let i = 0; i < d.length; i += 4) {
    const l = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    h[Math.min(7, Math.floor(l / 32))]++;
  }
  return h;
})()`)));

ws.close();
chrome.kill();
