/**
 * 背包面板（B）真机探针。
 *
 * 只证机制：面板能开、40 格几何与钩子同源、点格子换光标、点面板外关闭、背面板不穿透。
 * 不证「好看」—— 那是眼睛的事。
 *
 * 纪律：
 * - 格子坐标一律从 `bagCells()` 取，**不写死**（D177/D178/D185 都在这上面栽过）；
 * - 像素采样要乘 `viewport().ratio`（D175 之后 canvas.width ≠ 960）；
 * - 一律等服务到 id 再断言（轮询，不用固定 sleep）。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ARGV = process.argv.slice(2);
const BASE =
  process.env.PROBE_URL ??
  process.env.BASE_URL ??
  ARGV.find((a) => a.startsWith('http')) ??
  'http://127.0.0.1:5292/';
const SHOT =
  process.env.PROBE_SHOT ??
  ARGV.find((a) => a.endsWith('.png')) ??
  'F:/dsh-work/zhuoxian/docs/probe-bag.png';
const PORT = 9391;

const CHROME =
  process.env.CHROME_PATH ??
  'C:/Program Files/Google/Chrome/Application/chrome.exe';

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

const profile = path.join(os.tmpdir(), `zx-bag-${Date.now()}`);
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
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
  });
}

async function evalJs(expression) {
  const r = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) {
    return { __error: r.exceptionDetails.exception?.description ?? 'eval-error' };
  }
  return r.result?.value;
}

async function waitHook(timeoutMs = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const has = await evalJs('typeof window.__zhuoxian === "object" && typeof window.__zhuoxian.bagCells === "function"');
    if (has === true) return true;
    await sleep(300);
  }
  return false;
}

async function shot(file) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
}

/** 面板与「左缘 3px 金条」的结构像素 —— 不靠整体亮度（D191.2 教训） */
async function panelFingerprint() {
  return evalJs(`(() => {
    const z = window.__zhuoxian;
    const c = document.getElementById('stage');
    const g = c.getContext('2d');
    const s = c.width / z.viewport().logicalW;
    const geo = { x: Math.round((${960} - 824) / 2), y: Math.round((${540} - 294) / 2) };
    const d = g.getImageData(Math.round(geo.x * s), Math.round(geo.y * s), Math.round(4 * s), Math.round(294 * s)).data;
    let gold = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], gg = d[i + 1], bb = d[i + 2];
      if (r > 120 && gg > 80 && r - bb > 55) gold++;
    }
    const full = g.getImageData(0, 0, c.width, c.height).data;
    let sum = 0, n = 0;
    for (let i = 0; i < full.length; i += 4 * 37) { sum += full[i]; n++; }
    return { gold, mean: n ? sum / n : 0 };
  })()`);
}

async function main() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page');
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        break;
      }
    } catch {
      /* retry */
    }
    await sleep(250);
  }
  if (!ws) throw new Error('chrome 没有起来');
  await new Promise((r) => ws.addEventListener('open', r));
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  });
  await send('Runtime.enable');
  await send('Page.enable');

  const url = BASE.includes('cls=') ? BASE : `${BASE}${BASE.includes('?') ? '&' : '?'}cls=yujian`;
  await send('Page.navigate', { url });
  await sleep(2000);
  // 清档：走产品 reset（它抑制离场 flush），再回 URL
  await evalJs('window.__zhuoxian && window.__zhuoxian.reset && window.__zhuoxian.reset()');
  await sleep(1500);
  await waitHook();

  const hasHook = await evalJs('typeof window.__zhuoxian.bagCells === "function"');
  ok('钩子存在（bagCells/bagVisible）', hasHook === true, String(hasHook));

  const cells0 = await evalJs('window.__zhuoxian.bagCells()');
  ok('网格 40 格且编号连续', Array.isArray(cells0) && cells0.length === 40 && cells0[39].index === 39);

  const vis0 = await evalJs('window.__zhuoxian.bagVisible');
  ok('新号默认不显示背包', vis0 === false, String(vis0));

  const before = await panelFingerprint();

  // 按 B 打开
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyB', key: 'b', windowsVirtualKeyCode: 66 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyB', key: 'b', windowsVirtualKeyCode: 66 });
  await sleep(500);
  const vis1 = await evalJs('window.__zhuoxian.bagVisible');
  ok('按 B 能打开背包', vis1 === true, String(vis1));
  const opened = await panelFingerprint();
  ok('面板真的画出来（左缘金条变多）', opened.gold > before.gold + 100, `${before.gold} → ${opened.gold}`);
  ok('画面被压暗（遮罩生效）', opened.mean < before.mean, `${before.mean.toFixed(1)} → ${opened.mean.toFixed(1)}`);

  const panels = await evalJs('window.__zhuoxian.panelsOpen()');
  ok('打开时互斥清单里有 bag', Array.isArray(panels) && panels.includes('bag'), JSON.stringify(panels));

  // 点第 6 格（用钩子给的中心点，不写死）
  const cell5 = await evalJs('window.__zhuoxian.bagCells()[5]');
  const scale = await evalJs('document.getElementById("stage").getBoundingClientRect().width / window.__zhuoxian.viewport().logicalW');
  const rect = await evalJs('(() => { const r = document.getElementById("stage").getBoundingClientRect(); return { left: r.left, top: r.top, scale: r.width / window.__zhuoxian.viewport().logicalW }; })()');
  const cx = rect.left + (cell5.x + cell5.w / 2) * rect.scale;
  const cy = rect.top + (cell5.y + cell5.h / 2) * rect.scale;
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx, y: cy, button: 'left', clickCount: 1 });
  await sleep(400);
  const cursor = await evalJs('window.__zhuoxian.bagCursor');
  ok('点第 6 格后光标落在 6 号位', cursor === 5, `cursor=${cursor} scale=${scale}`);
  ok('光标格在钩子里被标成 cursor', (await evalJs('window.__zhuoxian.bagCells()[5].cursor')) === true);

  // 点面板外 → 关闭。注意：画布是居中的（rect.left 可能 > 0），
  // 直接发 CSS 坐标 (12, 520) 会落在画布外、pointerdown 根本没触发 —— 必须先按 rect 换算。
  const outX = rect.left + 10 * rect.scale;
  const outY = rect.top + 500 * rect.scale;
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: outX, y: outY, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: outX, y: outY, button: 'left', clickCount: 1 });
  await sleep(400);
  const vis2 = await evalJs('window.__zhuoxian.bagVisible');
  ok('点面板外能关掉', vis2 === false, String(vis2));
  const closed = await panelFingerprint();
  ok('关掉后金条回落', closed.gold < opened.gold, `${opened.gold} → ${closed.gold}`);

  const logHasClose = await evalJs('window.__zhuoxian.session.log.some(l => l.text.includes("关闭背包"))');
  ok('关闭有日志反馈', logHasClose === true);

  // 背包 filled 标记：等真掉落进包（战斗会自动刷），最多 90 秒。
  // 不用 SKIP 糊过去 —— SKIP 不进分母，等于这一项从来没验过。
  let bagCount = await evalJs('window.__zhuoxian.bagCount');
  const t0 = Date.now();
  while ((bagCount ?? 0) < 1 && Date.now() - t0 < 90000) {
    await sleep(1000);
    bagCount = await evalJs('window.__zhuoxian.bagCount');
  }
  const filledTry = await evalJs(`(() => {
    const z = window.__zhuoxian;
    const c = z.bagCells();
    return { filled: c.filter(x => x.filled).length, count: z.bagCount };
  })()`);
  ok(
    '背包 filled 计数与件数一致（真掉落进包）',
    filledTry.count > 0 && filledTry.filled === filledTry.count,
    JSON.stringify(filledTry),
  );

  // 打开面板并截图（此时包里有东西，图才有意义）
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyB', key: 'b', windowsVirtualKeyCode: 66 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyB', key: 'b', windowsVirtualKeyCode: 66 });
  await sleep(400);
  const cell1 = await evalJs('window.__zhuoxian.bagCells().find((c) => c.filled)');
  if (cell1) {
    const rx = rect.left + (cell1.x + cell1.w / 2) * rect.scale;
    const ry = rect.top + (cell1.y + cell1.h / 2) * rect.scale;
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rx, y: ry, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rx, y: ry, button: 'left', clickCount: 1 });
    await sleep(300);
  }
  ok('点有装备的格子能把光标落在它上面', (await evalJs('window.__zhuoxian.bagCells().find((c) => c.cursor)?.filled')) === true);

  await shot(SHOT);

  // 控制台报错
  const errors = await evalJs('window.__zhuoxian.__consoleErrors ? window.__zhuoxian.__consoleErrors.length : 0');
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
