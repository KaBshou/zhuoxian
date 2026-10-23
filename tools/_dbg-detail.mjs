// TEMP debug: where are the pale pixels when the detail panel is open?
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9372;
const BASE = process.argv[2] ?? 'http://127.0.0.1:5292/';
const profile = `${process.env.TEMP}\\dbg-detail-${Date.now()}`;
fs.mkdirSync(profile, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fetchJson = (p) =>
  new Promise((res, rej) =>
    http
      .get(`http://127.0.0.1:${PORT}${p}`, (r) => {
        let d = '';
        r.on('data', (c) => (d += c));
        r.on('end', () => res(JSON.parse(d)));
      })
      .on('error', rej),
  );
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      }
    };
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.pending.set(id, { resolve: res, reject: rej }));
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description ?? 'eval error'));
    return r.result.value;
  }
}
const SCAN = `(() => {
  const c = document.getElementById('stage');
  const ctx = c.getContext('2d');
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let pale = 0, minX = 1e9, minY = 1e9, maxX = -1, maxY = -1, sum = 0, n = 0;
  const rows = {};
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    sum += (r * 0.299 + g * 0.587 + b * 0.114); n++;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mn > 150 && mx - mn < 45) {
      pale++;
      const p = i / 4, x = p % c.width, y = (p / c.width) | 0;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      const band = Math.floor(y / 40) * 40;
      rows[band] = (rows[band] || 0) + 1;
    }
  }
  return { pale, bbox: pale ? { minX, minY, maxX, maxY } : null, mean: sum / n, rows };
})()`;
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--window-size=1000,620',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    'about:blank',
  ],
  { stdio: 'ignore' },
);
let ws;
try {
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(250);
    try {
      target = (await fetchJson('/json/list')).find((t) => t.type === 'page');
    } catch {}
  }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  const cdp = new Cdp(ws);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Page.navigate', { url: `${BASE}?cls=yujian` });
  await sleep(2600);
  await cdp.eval('(()=>{window.__zhuoxian.reset();return 1})()');
  await sleep(2600);
  await cdp.eval("window.__zhuoxian.chooseClass('yujian')");
  await cdp.eval('(()=>window.__zhuoxian.finishTutorial())()');
  await sleep(1500);
  console.log('equipped', await cdp.eval('(()=>window.__zhuoxian.session.character.equipment ? Object.keys(window.__zhuoxian.session.character.equipment).length : -1)()'));
  console.log('closed scan', JSON.stringify(await cdp.eval(SCAN)));
  console.log('toggleDetail', await cdp.eval('(()=>window.__zhuoxian.toggleDetail())()'));
  await sleep(600);
  console.log('open scan', JSON.stringify(await cdp.eval(SCAN)));
  console.log('panelsOpen', JSON.stringify(await cdp.eval('(()=>window.__zhuoxian.panelsOpen())()')));
} catch (e) {
  console.log('ERR', String(e).slice(0, 300));
} finally {
  try {
    ws?.close();
  } catch {}
  chrome.kill();
  await sleep(300);
  fs.rmSync(profile, { recursive: true, force: true });
}
