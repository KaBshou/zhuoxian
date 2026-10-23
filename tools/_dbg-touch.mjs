// TEMP debug: why does tapping blank canvas not advance the tutorial in probe-touch?
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9366;
const BASE = process.argv[2] ?? 'http://127.0.0.1:5292/';
const profile = `${process.env.TEMP}\\dbg-touch-${Date.now()}`;
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
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Page.navigate', { url: BASE });
  await sleep(2200);
  await cdp.eval('(()=>{window.__zhuoxian.reset();return 1})()');
  await sleep(2600);

  console.log('phase before', await cdp.eval('window.__zhuoxian.phase'));
  console.log('chosen', await cdp.eval("window.__zhuoxian.chooseClass('yujian')"));
  await sleep(600);
  console.log(
    'state',
    await cdp.eval(`(()=>{const z=window.__zhuoxian;return {
      phase:z.phase, step:z.tutorialStep, len:z.tutorialLength,
      dpr:window.devicePixelRatio,
      canvas:(()=>{const c=document.getElementById('stage');const r=c.getBoundingClientRect();
        return {w:c.width,h:c.height,cssW:Math.round(r.width),cssH:Math.round(r.height),left:Math.round(r.left),top:Math.round(r.top)};})(),
    };})()`),
  );

  // 记录 canvas 收到的 pointerdown / click
  await cdp.eval(`(()=>{window.__ev=[];const c=document.getElementById('stage');
    for (const t of ['pointerdown','pointerup','click','mousedown']) {
      c.addEventListener(t,(e)=>{window.__ev.push(t+':'+Math.round(e.offsetX)+','+Math.round(e.offsetY));},true);
    }
    return 1;})()`);

  const rect = await cdp.eval(`(()=>{const r=document.getElementById('stage').getBoundingClientRect();
    return {left:r.left,top:r.top,w:r.width,h:r.height};})()`);
  const cx = rect.left + rect.w / 2;
  const cy = rect.top + rect.h * 0.55;
  console.log('click at client', Math.round(cx), Math.round(cy), 'rect', JSON.stringify(rect));
  for (const type of ['mousePressed', 'mouseReleased']) {
    await cdp.send('Input.dispatchMouseEvent', {
      type,
      x: cx,
      y: cy,
      button: 'left',
      clickCount: 1,
      pointerType: 'mouse',
    });
    await sleep(60);
  }
  await sleep(400);
  console.log('events', await cdp.eval('window.__ev'));
  console.log('step after', await cdp.eval('window.__zhuoxian.tutorialStep'));
  console.log(
    'elementFromPoint',
    await cdp.eval(
      `(()=>{const el=document.elementFromPoint(${Math.round(cx)},${Math.round(cy)});return el?el.tagName+'#'+(el.id||'')+'.'+(el.className||''):'none';})()`,
    ),
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
