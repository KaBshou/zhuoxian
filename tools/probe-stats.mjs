import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * 统计面板（D200）真机探针。
 *
 * 只证机制：Y 能开、面板真画出来、数据来自会话、与其他面板互斥、Esc 能关。
 * 「数字对不对」由 `tests/stats-panel.test.ts` 覆盖；探针不重复算一遍业务。
 */
const ARGV = process.argv.slice(2);
const BASE =
  process.env.PROBE_URL ?? process.env.BASE_URL ?? ARGV.find((a) => a.startsWith('http')) ?? 'http://127.0.0.1:5292/';
const SHOT = process.env.PROBE_SHOT ?? ARGV.find((a) => a.endsWith('.png')) ?? 'F:/dsh-work/zhuoxian/docs/probe-stats.png';
const PORT = 9394;
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0;
let fail = 0;
function ok(name, cond, detail = '') {
  if (cond) { pass += 1; console.log(`  [PASS] ${name}${detail ? `  — ${detail}` : ''}`); }
  else { fail += 1; console.log(`  [FAIL] ${name}${detail ? `  — ${detail}` : ''}`); }
}

const profile = path.join(os.tmpdir(), `zx-stats-${Date.now()}`);
fs.mkdirSync(profile, { recursive: true });
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--window-size=1280,720', 'about:blank',
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
  await sleep(2000);

  ok('钩子存在（statsVisible / playedSeconds）', (await ev('typeof window.__zhuoxian.statsVisible === "boolean"')) === true);
  ok('新号默认不显示统计面板', (await ev('window.__zhuoxian.statsVisible')) === false);

  /** 统计面板左缘金条（结构像素，D188/D190） */
  async function goldBar() {
    return ev(`(() => {
      const z = window.__zhuoxian;
      const c = document.getElementById('stage');
      const g = c.getContext('2d');
      const s = c.width / z.viewport().logicalW;
      const w = 620; // STATS_PANEL_W
      const x0 = Math.round((960 - w) / 2);
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

  // 挂机几秒，让「本局」那组数字不是全 0
  await sleep(3000);
  const played = await ev('window.__zhuoxian.session.playedSeconds');
  ok('会话真的在累计游玩时长（统计面板的第一组数据靠它）', typeof played === 'number' && played > 2, `${played}`);

  await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyY', key: 'y', windowsVirtualKeyCode: 89 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyY', key: 'y', windowsVirtualKeyCode: 89 });
  await sleep(400);
  ok('按 Y 能打开统计面板', (await ev('window.__zhuoxian.statsVisible')) === true);
  const opened = await goldBar();
  ok('面板真的画出来（左缘金条变多）', opened > before + 100, `${before} → ${opened}`);
  ok('Esc 兜底清单里有 stats', JSON.stringify(await ev('window.__zhuoxian.panelsOpen()')).includes('stats'));

  // 与其它面板互斥：统计开着按 K，应该只剩图鉴
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyK', key: 'k', windowsVirtualKeyCode: 75 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyK', key: 'k', windowsVirtualKeyCode: 75 });
  await sleep(400);
  const panels = await ev('window.__zhuoxian.panelsOpen()');
  ok('开图鉴时统计被收掉（不叠两块遮罩）', Array.isArray(panels) && panels.length === 1 && panels[0] === 'codex', JSON.stringify(panels));

  // Esc 关掉，再打开统计并截图
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Escape', key: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Escape', key: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(300);
  ok('Esc 能关掉面板', (await ev('window.__zhuoxian.panelsOpen()')).length === 0);

  await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyY', key: 'y', windowsVirtualKeyCode: 89 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyY', key: 'y', windowsVirtualKeyCode: 89 });
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
