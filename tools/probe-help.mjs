import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * 帮助面板（D190）真机探针。
 *
 * 只证机制：H/? 能开、底部「?」按钮能点、面板真画出来、Esc 能关、不暂停战斗。
 * 「写得清不清楚」只能靠人读 —— 探针不假装能判断那个。
 */
const ARGV = process.argv.slice(2);
const BASE =
  process.env.PROBE_URL ?? process.env.BASE_URL ?? ARGV.find((a) => a.startsWith('http')) ?? 'http://127.0.0.1:5292/';
const SHOT = process.env.PROBE_SHOT ?? ARGV.find((a) => a.endsWith('.png')) ?? 'F:/dsh-work/zhuoxian/docs/probe-help.png';
const PORT = 9392;
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0;
let fail = 0;
function ok(name, cond, detail = '') {
  if (cond) {
    pass += 1;
    console.log(`  [PASS] ${name}${detail ? `  — ${detail}` : ''}`);
  } else {
    fail += 1;
    console.log(`  [FAIL] ${name}${detail ? `  — ${detail}` : ''}`);
  }
}

const profile = path.join(os.tmpdir(), `zx-help-${Date.now()}`);
fs.mkdirSync(profile, { recursive: true });
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--window-size=1280,720',
  'about:blank',
], { stdio: 'ignore' });

let ws;
let msgId = 0;
const pending = new Map();
function send(method, params = {}) {
  msgId += 1;
  const id = msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => pending.set(id, { res, rej }));
}
async function ev(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { __err: r.exceptionDetails.exception?.description };
  return r.result?.value;
}

async function main() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break; }
    } catch { /* retry */ }
    await sleep(250);
  }
  if (!ws) throw new Error('chrome 没起来');
  await new Promise((r) => ws.addEventListener('open', r));
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) p.rej(new Error(m.error.message));
      else p.res(m.result);
    }
  });
  await send('Runtime.enable');
  await send('Page.enable');

  const url = BASE.includes('cls=') ? BASE : `${BASE}${BASE.includes('?') ? '&' : '?'}cls=yujian`;
  await send('Page.navigate', { url });
  await sleep(2500);
  await ev('window.__zhuoxian && window.__zhuoxian.reset && window.__zhuoxian.reset()');
  await sleep(1800);

  ok('钩子存在（helpVisible/helpButton/toggleHelp）', (await ev('typeof window.__zhuoxian.helpButton === "function"')) === true);
  ok('新号默认不显示帮助', (await ev('window.__zhuoxian.helpVisible')) === false);

  const rect = await ev(`(() => { const r = document.getElementById('stage').getBoundingClientRect(); return { left: r.left, top: r.top, scale: r.width / window.__zhuoxian.viewport().logicalW }; })()`);

  /** 帮助面板的左缘金条像素（结构像素，D188） */
  async function goldBar() {
    return ev(`(() => {
      const z = window.__zhuoxian;
      const c = document.getElementById('stage');
      const g = c.getContext('2d');
      const s = c.width / z.viewport().logicalW;
      const x0 = Math.round((960 - 720) / 2);
      const d = g.getImageData(Math.round(x0 * s), 0, Math.round(4 * s), c.height).data;
      let gold = 0;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], gg = d[i + 1], bb = d[i + 2];
        if (r > 120 && gg > 80 && r - bb > 55) gold++;
      }
      return gold;
    })()`);
  }

  const before = await goldBar();

  // H 打开
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyH', key: 'h', windowsVirtualKeyCode: 72 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyH', key: 'h', windowsVirtualKeyCode: 72 });
  await sleep(400);
  ok('按 H 能打开帮助', (await ev('window.__zhuoxian.helpVisible')) === true);
  const opened = await goldBar();
  ok('面板真的画出来（左缘金条变多）', opened > before + 100, `${before} → ${opened}`);
  ok('Esc 兜底清单里有 help', JSON.stringify(await ev('window.__zhuoxian.panelsOpen()')).includes('help'));

  // 战斗没被暂停：打开状态跑 2 秒，时间仍在推进
  const t1 = await ev('window.__zhuoxian.session.battle.time');
  await sleep(2000);
  const t2 = await ev('window.__zhuoxian.session.battle.time');
  ok('帮助开着时战斗不暂停（挂机游戏暂停=损失）', typeof t1 === 'number' && typeof t2 === 'number' && t2 > t1 + 1.5, `${t1} → ${t2}`);

  // Esc 关闭
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Escape', key: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Escape', key: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(400);
  ok('Esc 能关掉帮助', (await ev('window.__zhuoxian.helpVisible')) === false);
  const closed = await goldBar();
  ok('关掉后金条回落', closed < opened, `${opened} → ${closed}`);

  // 点底部「?」按钮打开（坐标从钩子取，不写死）
  const btn = await ev('window.__zhuoxian.helpButton()');
  const bx = rect.left + (btn.x + btn.w / 2) * rect.scale;
  const by = rect.top + (btn.y + btn.h / 2) * rect.scale;
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: bx, y: by, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: bx, y: by, button: 'left', clickCount: 1 });
  await sleep(400);
  ok('点底部「?」按钮能打开', (await ev('window.__zhuoxian.helpVisible')) === true, JSON.stringify(btn));

  // 再点一次关掉
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: bx, y: by, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: bx, y: by, button: 'left', clickCount: 1 });
  await sleep(400);
  ok('同一个按钮再点一次能关', (await ev('window.__zhuoxian.helpVisible')) === false);

  // 打开帮助后按 B：帮助应被收掉，只剩背包（互斥不重叠）
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyH', key: 'h', windowsVirtualKeyCode: 72 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyH', key: 'h', windowsVirtualKeyCode: 72 });
  await sleep(200);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyB', key: 'b', windowsVirtualKeyCode: 66 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyB', key: 'b', windowsVirtualKeyCode: 66 });
  await sleep(400);
  const panels = await ev('window.__zhuoxian.panelsOpen()');
  ok('打开背包会把帮助收掉（不叠两块遮罩）', Array.isArray(panels) && panels.length === 1 && panels[0] === 'bag', JSON.stringify(panels));

  await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Escape', key: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Escape', key: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(300);

  // 截图时打开帮助
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyH', key: 'h', windowsVirtualKeyCode: 72 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyH', key: 'h', windowsVirtualKeyCode: 72 });
  await sleep(400);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(SHOT, Buffer.from(shot.data, 'base64'));

  const errors = await ev('window.__zhuoxian.__consoleErrors ? window.__zhuoxian.__consoleErrors.length : 0');
  ok('控制台零报错', (errors ?? 0) === 0, `errors=${errors}`);

  console.log(`\n  截图：${SHOT}`);
  console.log(`\n=== ${pass}/${pass + fail} ===`);
  console.log(`结果：${pass}/${pass + fail}`);
  chrome.kill();
  process.exitCode = fail === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error('EXPLODE', err);
  chrome.kill();
  process.exitCode = 1;
});
