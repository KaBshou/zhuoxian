// 临时诊断：为什么 kills=500 没能触发成就结算
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9371;
const URL = 'http://127.0.0.1:5301/?cls=yujian';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fetchJson = (path) =>
  new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${PORT}${path}`, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(d));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });

const profile = `${process.env.TEMP}\\diag-ach-${Date.now()}`;
fs.mkdirSync(profile, { recursive: true });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
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
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); p(m); }
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    const payload = r.result;
    if (payload.exceptionDetails) throw new Error(JSON.stringify(payload.exceptionDetails));
    return payload.result.value;
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: URL });
  await sleep(3000);
  console.log('phase', await ev('window.__zhuoxian.phase'));
  console.log('kills before', await ev('window.__zhuoxian.session.kills'));
  console.log('set', await ev('(()=>{window.__zhuoxian.session.kills=500;return window.__zhuoxian.session.kills})()'));
  await sleep(300);
  console.log('kills after 300ms', await ev('window.__zhuoxian.session.kills'));
  console.log('facts', await ev('JSON.stringify(window.__zhuoxian.achievementFacts())'));
  await sleep(1200);
  console.log('kills after 1.5s', await ev('window.__zhuoxian.session.kills'));
  console.log('facts2', await ev('JSON.stringify(window.__zhuoxian.achievementFacts())'));
  console.log('prog', await ev('JSON.stringify(window.__zhuoxian.achievements())'));
  console.log('rows unlocked', await ev('JSON.stringify(window.__zhuoxian.achievementRows().filter(r=>r.unlocked).map(r=>r.id))'));
} catch (e) {
  console.log('ERR', e);
} finally {
  try { ws?.close(); } catch {}
  chrome.kill();
}
