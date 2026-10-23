// 一次性诊断：详情面板开着时战斗是否真的停了
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9344;
const profile = fs.mkdtempSync('C:/Windows/Temp/zx-diag-dt-');
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--window-size=1000,620', '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding', '--no-first-run', '--no-default-browser-check',
  'http://127.0.0.1:5274/',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let wsUrl = null;
for (let i = 0; i < 80 && !wsUrl; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    wsUrl = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)?.webSocketDebuggerUrl ?? null;
  } catch { /* 等 */ }
  if (!wsUrl) await sleep(250);
}
const ws = new WebSocket(wsUrl);
await new Promise((res) => ws.addEventListener('open', res, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const send = (method, params = {}) => {
  const mid = ++id;
  ws.send(JSON.stringify({ id: mid, method, params }));
  return new Promise((res) => pending.set(mid, res));
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
await sleep(3000);

const snap = `(() => { const s = window.__zhuoxian.session; return {
  kills: s.battle.kills, deaths: s.battle.deaths, floorDeaths: s.floorDeaths,
  floor: s.floor, wave: s.wave, monsters: s.battle.monsters.length,
  hp: Math.round(s.battle.player.hp), maxHp: Math.round(s.battle.player.maxHp),
  revive: s.battle.reviveCooldown.toFixed(1), waveTimer: s.waveTimer.toFixed(2),
}; })()`;

console.log('=== 关着面板 ===');
for (let i = 0; i < 4; i++) {
  console.log(JSON.stringify(await ev(snap)));
  await sleep(2000);
}

await ev('window.__zhuoxian.toggleDetail()');
console.log('=== 开着面板 ===');
for (let i = 0; i < 6; i++) {
  console.log(JSON.stringify(await ev(snap)));
  await sleep(2000);
}

ws.close();
chrome.kill();
