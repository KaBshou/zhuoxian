// TEMP debug: does the achievement HUD button / J key open the marks panel instead?
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9371;
const BASE = process.argv[2] ?? 'http://127.0.0.1:5292/';
const profile = `${process.env.TEMP}\\dbg-ach-${Date.now()}`;
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
  async key(code, keyName) {
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: keyName, windowsVirtualKeyCode: 0 });
    await sleep(50);
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: keyName, windowsVirtualKeyCode: 0 });
    await sleep(250);
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
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Page.navigate', { url: `${BASE}?cls=yujian` });
  await sleep(2600);
  await cdp.eval('(()=>{window.__zhuoxian.reset();return 1})()');
  await sleep(2600);
  await cdp.eval("window.__zhuoxian.chooseClass('yujian')");
  await sleep(800);

  console.log('buttons', await cdp.eval('(()=>window.__zhuoxian.hudButtons().map(b=>b.id).join(","))()'));
  console.log('panelsOpen before', await cdp.eval('(()=>window.__zhuoxian.panelsOpen())()'));

  // J 键
  await cdp.key('KeyJ', 'j');
  console.log('after J panelsOpen', await cdp.eval('(()=>window.__zhuoxian.panelsOpen())()'));
  await cdp.key('KeyJ', 'j');
  console.log('after J again', await cdp.eval('(()=>window.__zhuoxian.panelsOpen())()'));

  // 点「成就」按钮（坐标从钩子读）
  const rect = await cdp.eval(
    `(()=>{const c=document.getElementById('stage');const r=c.getBoundingClientRect();return {left:r.left,top:r.top,w:r.width,h:r.height,cw:c.width,ch:c.height};})()`,
  );
  const btn = await cdp.eval(`(()=>{const b=window.__zhuoxian.hudButtons().find(x=>x.id==='achievement');return b;})()`);
  const sx = rect.w / rect.cw;
  const sy = rect.h / rect.ch;
  const cx = rect.left + (btn.x + btn.w / 2) * sx;
  const cy = rect.top + (btn.y + btn.h / 2) * sy;
  for (const type of ['mousePressed', 'mouseReleased']) {
    await cdp.send('Input.dispatchMouseEvent', { type, x: cx, y: cy, button: 'left', clickCount: 1 });
    await sleep(60);
  }
  await sleep(400);
  console.log('after click 成就 panelsOpen', await cdp.eval('(()=>window.__zhuoxian.panelsOpen())()'));
  console.log(
    'achievements hook',
    await cdp.eval('(()=>{const z=window.__zhuoxian;try{return JSON.stringify(z.achievements());}catch(e){return "ERR "+e;}})()'),
  );
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
