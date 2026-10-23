// 诊断：详情面板打开时，正文色像素到底有多少、在哪、globalAlpha 是多少
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9348;
const profile = fs.mkdtempSync('C:/Windows/Temp/zx-diag-tx-');
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
await ev('window.__zhuoxian.toggleDetail()');
await sleep(600);

// 全画布找「任意亮色」并统计分布 + 取几个样本点颜色
console.log(JSON.stringify(await ev(`(() => {
  const c = document.getElementById('stage');
  const ctx = c.getContext('2d');
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const buckets = {};
  const samples = [];
  let maxL = 0, maxAt = null;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      const r = d[i], g = d[i+1], b = d[i+2];
      const l = (r + g + b) / 3;
      if (l > maxL) { maxL = l; maxAt = [x, y, r, g, b]; }
      if (l > 120) {
        const key = [Math.round(r/32)*32, Math.round(g/32)*32, Math.round(b/32)*32].join(',');
        buckets[key] = (buckets[key] || 0) + 1;
        if (samples.length < 12 && l > 150) samples.push([x, y, r, g, b]);
      }
    }
  }
  return { maxL: Math.round(maxL), maxAt, buckets, samples };
})()`), null, 1));

ws.close();
chrome.kill();
