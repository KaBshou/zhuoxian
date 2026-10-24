// 1920x1080 下截图 + HUD 区域体检（D176 验收用）。
// 用法：node tools/shot-hud.mjs [url] [out.png]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const URL = process.argv[2] ?? 'http://127.0.0.1:5297/?cls=yujian';
const OUT = process.argv[3] ?? 'docs/hud-1920.png';
const PORT = 9371;

function resolveChrome() {
  const cands = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  for (const c of cands) if (fs.existsSync(c)) return c;
  return 'google-chrome';
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = path.join(os.tmpdir(), `zx-shot-${Date.now()}`);
const chrome = spawn(
  resolveChrome(),
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--window-size=1920,1080',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    URL,
  ],
  { stdio: 'ignore' },
);

async function targets() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch {
      /* 还没起来 */
    }
    await sleep(250);
  }
  throw new Error('chrome 没起来');
}

const page = await targets();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.addEventListener('open', res, { once: true });
  ws.addEventListener('error', rej, { once: true });
});
let id = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  }
});
function send(method, params = {}) {
  id += 1;
  const myId = id;
  return new Promise((resolve, reject) => {
    pending.set(myId, { resolve, reject });
    ws.send(JSON.stringify({ id: myId, method, params }));
  });
}
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) {
    console.error('[evaluate 抛异常]', JSON.stringify(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
    return undefined;
  }
  return r.result?.value;
}

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 1920,
  height: 1080,
  deviceScaleFactor: 1,
  mobile: false,
});
await send('Page.navigate', { url: URL });
await sleep(2600);
// 点一下中间：开局选道统（dist 与 dev 都走 pointerdown）
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 960, y: 520, button: 'left', clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 960, y: 520, button: 'left', clickCount: 1 });
await sleep(4000);

// 等到修为 > 0（进度条有内容），最多等 10 秒；0% 时只有暗底轨、没有青色像素
for (let i = 0; i < 20; i += 1) {
  const xpNow = await evaluate(`window.__zhuoxian ? window.__zhuoxian.session.character.xp : 0`);
  if (typeof xpNow === `number` && xpNow > 0) break;
  await sleep(500);
}
const regions = await evaluate(`(() => {
  const c = document.getElementById('stage');
  const g = c.getContext('2d');
  const W = c.width, H = c.height;
  const sx = W / 960;
  const box = (x, y, w, h) => {
    const d = g.getImageData(Math.round(x * sx), Math.round(y * sx), Math.round(w * sx), Math.round(h * sx)).data;
    let lit = 0, gold = 0, teal = 0, chroma = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      const lum = 0.299 * r + 0.587 * gg + 0.114 * b;
      if (lum > 90) lit += 1;
      if (r > 150 && gg > 110 && b < 120 && r - b > 50) gold += 1;
      if (gg > 150 && b > 120 && r < 130) teal += 1;
      // 饱和色（血条是锈红、浊气是紫、罡气是金；文字基本是灰白）
      if (Math.max(r, gg, b) - Math.min(r, gg, b) > 60) chroma += 1;
    }
    return {
    footerHint: (() => { const z = window.__zhuoxian; return z && typeof z.bossWaveHint === 'function' ? z.bossWaveHint() : ''; })(), lit, gold, teal, chroma };
  };
  return {
    footerHint: (() => { const z = window.__zhuoxian; return z && typeof z.bossWaveHint === 'function' ? z.bossWaveHint() : ''; })(),
    canvas: { w: W, h: H },
    buttons: window.__zhuoxian?.hudButtons?.()?.length ?? -1,
    phase: window.__zhuoxian?.phase ?? '?',
    topStrip: box(600, 0, 360, 38),
    gapBand: box(0, 38, 960, 4),
    buttonBand: box(380, 42, 580, 24),
    leftPanel: box(14, 42, 210, 200),
    rightPanel: box(736, 74, 210, 240),
    barArea: box(8, 4, 630, 26),
    hookedButtons: (() => {
      try { return window.__zhuoxian.hudButtons().length; } catch { return -1; }
    })(),
    // 右列「修为」那一行下方的 4px 进度条（D192）
    xpBar: box(736, 98, 210, 16),
  };
})()`);

const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
console.log(JSON.stringify({ url: URL, out: OUT, ...regions }, null, 2));

const checks = [
  ['画布已铺满 1920 宽', regions.canvas.w === 1920],
  ['HUD 按钮数与钩子一致（不写死数量）', regions.buttons === regions.hookedButtons],
  ['HUD 按钮数合理（≥8）', regions.buttons >= 8],
  ['已进战斗（phase=play）', regions.phase === 'play'],
  ['顶栏右侧有字（境界/战力/层数/波次）', regions.topStrip.lit > 200],
  ['顶栏下有 4px 空白带（不再有字压着按钮）', regions.gapBand.lit < 260],
  ['按钮条区域有按钮边框/文字', regions.buttonBand.lit > 300],
  ['左列法宝面板有内容', regions.leftPanel.lit > 300],
  ['右列面板有内容', regions.rightPanel.lit > 200],
  ['血条区有内容', regions.barArea.lit > 200],
  ['血条区有饱和色（气血锈红 / 浊气紫 / 罡气金）', regions.barArea.chroma > 200],
  // 只证「画出来了」：刚开局进度条只有几个像素宽，阈值不能按满格定（那是拿掉率/时长赌断言）
  ['修为进度条画出来了（右列青色像素）', regions.xpBar.teal > 6],
  // D194：底栏要有镇守倒计时（不断言具体数字——数字随开局计时浮动）
  ['底栏显示镇守倒计时（D194）', /距镇守 \d+ 波|本波镇守|下潜中|渊底/.test(String(regions.footerHint ?? ''))],
];
let bad = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) bad += 1;
}
console.log(bad === 0 ? 'ALL PASS' : `${bad} FAIL`);

ws.close();
chrome.kill();
process.exitCode = bad === 0 ? 0 : 1;
