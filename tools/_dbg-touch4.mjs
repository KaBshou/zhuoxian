// TEMP debug 4: capture errors while tapping blank + test several points
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9369;
const BASE = process.argv[2] ?? 'http://127.0.0.1:5292/';
const profile = `${process.env.TEMP}\\dbg-touch4-${Date.now()}`;
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
  const errors = [];
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Log.enable');
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
      errors.push('console:' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    if (m.method === 'Runtime.exceptionThrown')
      errors.push('exc:' + (m.params.exceptionDetails?.exception?.description ?? '').slice(0, 200));
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error')
      errors.push('log:' + String(m.params.entry.text).slice(0, 200));
  });
  await cdp.send('Page.navigate', { url: BASE });
  await sleep(2200);
  await cdp.eval('(()=>{window.__zhuoxian.reset();return 1})()');
  await sleep(2600);
  await cdp.eval("window.__zhuoxian.chooseClass('yujian')");
  await sleep(500);

  const probe = async (fx, fy, label) => {
    const before = await cdp.eval('window.__zhuoxian.tutorialStep');
    const out = await cdp.eval(`(() => {
      const c = document.getElementById('stage');
      const r = c.getBoundingClientRect();
      const ev = new PointerEvent('pointerdown', {
        clientX: r.left + r.width * ${fx}, clientY: r.top + r.height * ${fy},
        bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1,
      });
      const dispatched = c.dispatchEvent(ev);
      const after = window.__zhuoxian.tutorialStep;
      const panels = window.__zhuoxian.panelsOpen();
      return { dispatched, after, panels };
    })()`);
    console.log(label, `before=${before}`, JSON.stringify(out));
  };
  await probe(0.5, 0.55, 'blank center 55%');
  await probe(0.1, 0.5, 'blank left 50%');
  await probe(0.5, 0.9, 'blank bottom 90%');
  await probe(0.98, 0.05, 'near buttons (top-right)');
  console.log('errors', errors.slice(0, 5));
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
