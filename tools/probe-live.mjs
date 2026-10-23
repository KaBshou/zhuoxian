/**
 * 线上真机验收（`probe-live.mjs`）：直接打开**已部署的公网网址**跑一遍。
 *
 * 为什么必须单独有一条（和 probe-dist 的分工）：
 *   - `probe-dist.mjs` 验的是「本机 dist/ 挂在子路径下能不能跑」——它证明构建产物没问题。
 *   - 本探针验的是「GitHub Pages 上那个真实网址能不能跑」——它额外覆盖：Pages 有没有部署成功、
 *     自定义 404 / https_enforced 有没有拦、CDN 缓存有没有拿到旧产物、真实 origin 下的 localStorage 能不能写。
 *     这三类问题都只在线上出现，本地怎么跑都绿。
 *
 * 关键实现约束：**所有网络请求都在浏览器里发**，不用 Node 的 fetch。
 *   原因：国内直连 github.io 不通，必须走代理；Node 的 fetch 不读 HTTP(S)_PROXY 环境变量，
 *   而 Chrome 可以吃 `--proxy-server`。第一版用 Node fetch 做预检，结果直接误判成「网络不通」并 SKIP。
 *
 * 判据（都要真跑出来，不推理）：
 *   1. 首页 200，且所有 assets/*.js 与 *.css 也 200（零 4xx，favicon 除外）—— 用 CDP Network 事件判，不靠猜
 *   2. canvas 真画了东西（不是白屏/全黑）
 *   3. **生产构建没有调试钩子**（`window.__zhuoxian` 必须 undefined —— 有就是 env 判错了）
 *   4. 点屏幕中间能选道统进战斗（dist 没有钩子，只能靠像素变化判）
 *   5. 战斗在跑（2.5 秒内像素指纹变化）
 *   6. 真实 origin 下 localStorage 能写，reload 后存档还在
 *   7. 控制台零报错
 *
 * 用法：
 *   $env:HTTPS_PROXY='http://127.0.0.1:7897'; node tools/probe-live.mjs
 *   node tools/probe-live.mjs https://kabshou.github.io/zhuoxian/
 *   LIVE_URL=... LIVE_PROXY=http://127.0.0.1:7897 node tools/probe-live.mjs
 *
 * 连不上时打印 SKIP 并 exit 0 —— 网络不通不该算成「部署坏了」，但会明确写出「没验到」。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
function resolveChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  for (const c of CHROME_CANDIDATES) if (fs.existsSync(c)) return c;
  return 'google-chrome';
}

const CHROME = resolveChrome();
const CDP_PORT = Number(process.env.LIVE_CDP_PORT ?? 9371);
const TARGET = process.env.LIVE_URL ?? process.argv[2] ?? 'https://kabshou.github.io/zhuoxian/';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
  return ok;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 40000);
    });
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text ?? 'eval error');
    return r.result.value;
  }
}

async function connectPage() {
  for (let i = 0; i < 80; i++) {
    try {
      const targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then((r) => r.json());
      const page = targets.find((t) => t.type === 'page');
      if (page) {
        const ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((res, rej) => {
          ws.addEventListener('open', res, { once: true });
          ws.addEventListener('error', rej, { once: true });
        });
        return new Cdp(ws);
      }
    } catch {}
    await sleep(250);
  }
  throw new Error('连不上 CDP');
}

/** 取 canvas 的平均亮度 + 亮像素数（采样 1/97，够快也够稳） */
const MEAN_EXPR = `(() => {
  const c = document.getElementById('stage');
  if (!c) return { err: 'no canvas' };
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let sum = 0, bright = 0, n = 0;
  for (let i = 0; i < d.length; i += 4 * 97) {
    const l = (d[i] + d[i + 1] + d[i + 2]) / 3;
    sum += l; n++;
    if (l > 60) bright++;
  }
  return { mean: sum / n, bright, n, w: c.width, h: c.height };
})()`;

const FP_EXPR = `(() => {
  const c = document.getElementById('stage');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let h = 0;
  for (let i = 0; i < d.length; i += 4 * 31) h = (h * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7) | 0;
  return h;
})()`;

async function main() {
  console.log(`\n=== 线上验收：${TARGET} ===\n`);

  const profile = path.join(os.tmpdir(), `zhuoxian-live-${Date.now()}`);
  const proxy = process.env.LIVE_PROXY ?? process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY ?? '';
  if (proxy) console.log(`  （浏览器走代理 ${proxy}）\n`);
  const args = [
    ...(proxy ? [`--proxy-server=${proxy}`, '--proxy-bypass-list=127.0.0.1;localhost'] : []),
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${profile}`,
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--window-size=1280,720',
    'about:blank',
  ];
  const chrome = spawn(CHROME, args, { stdio: 'ignore' });
  let cdp;
  let navigated = false;
  try {
    cdp = await connectPage();
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Log.enable');
    await cdp.send('Network.enable');

    try {
      await cdp.send('Page.navigate', { url: TARGET });
      navigated = true;
    } catch (e) {
      console.log(`  [SKIP] 页面打不开（${e.message}）—— 网络不通，没验到，不等于部署坏了`);
      console.log('\n结论：SKIP（网络不可达）');
      process.exit(0);
    }
    await sleep(6000);

    // 首页/资源状态：从 CDP Network 事件里取（真实浏览器请求，走代理）
    const doc = cdp.events.find((e) => e.method === 'Network.responseReceived' && e.params.type === 'Document');
    const docStatus = doc?.params?.response?.status;
    if (!navigated || (docStatus === undefined && cdp.events.length === 0)) {
      console.log('  [SKIP] 没收到任何网络事件 —— 网络不通，没验到');
      console.log('\n结论：SKIP（网络不可达）');
      process.exit(0);
    }
    check('首页 200', docStatus === 200, `HTTP ${docStatus ?? '未收到'}`);

    const responses = cdp.events
      .filter((e) => e.method === 'Network.responseReceived')
      .map((e) => ({ url: e.params.response.url, status: e.params.response.status, type: e.params.type }));
    const assets = responses.filter((r) => /\/assets\//.test(r.url));
    const bad = assets.filter((r) => r.status >= 400);
    check('资源全 200', assets.length > 0 && bad.length === 0, `${assets.length} 个资源，坏 ${bad.length}${bad.length ? '：' + bad.map((b) => b.url.split('/').pop() + '=' + b.status).join(',') : ''}`);

    // 画面
    const pixels = await cdp.eval(MEAN_EXPR);
    check('canvas 画了东西', !pixels.err && pixels.mean > 2 && pixels.mean < 240, JSON.stringify(pixels));
    // 「内容像素」这一项**必须进战斗之后再采**：首屏是选道统，本身就是一片暗色，
    // 在选道统界面数亮像素等于用错误的场景验判据（第一版就是这么误报成 9/10 的）。

    // 生产构建无钩子
    const hook = await cdp.eval('typeof window.__zhuoxian');
    check('生产构建无调试钩子', hook === 'undefined', `typeof = ${hook}`);

    // 点屏幕进战斗（试三个 y，点空的表现是亮度不变）
    const box = await cdp.eval(`(() => {
      const c = document.getElementById('stage');
      const r = c.getBoundingClientRect();
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height };
    })()`);
    const before = pixels.mean;
    let afterClick = before;
    for (const dy of [0, 0.22, -0.22]) {
      const x = box.cx;
      const y = box.cy + dy * box.h;
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await sleep(40);
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
      await sleep(1400);
      afterClick = (await cdp.eval(MEAN_EXPR)).mean;
      if (Math.abs(afterClick - before) > 1.5) break;
    }
    check('点屏幕能进战斗', Math.abs(afterClick - before) > 1.5, `亮度 ${before.toFixed(1)} → ${afterClick.toFixed(1)}`);

    // 战斗在跑
    const f1 = await cdp.eval(FP_EXPR);
    await sleep(2500);
    const f2 = await cdp.eval(FP_EXPR);
    check('战斗在跑（画面在变）', f1 !== f2, `${f1} → ${f2}`);

    // 进战斗之后才数「内容像素」：这时画面里应该有怪、血条、掉落、HUD。
    //
    // 判据不用绝对像素数：绝对数会随视口大小变（1920 屏和 1000 屏差一倍），
    // 而「亮像素占比」跟画面内容挂钩、跟分辨率无关。1% 是个很松的下限 ——
    // 它只拦「整块纯色/全黑」，不拦「暗色但正常」（本作背景就是近黑）。
    const pixelsInBattle = await cdp.eval(MEAN_EXPR);
    const brightRatio = (pixelsInBattle.bright ?? 0) / Math.max(1, pixelsInBattle.n ?? 1);
    check(
      '战斗画面有内容像素（亮像素占比 ≥1%）',
      brightRatio >= 0.01,
      `${(brightRatio * 100).toFixed(1)}%（${pixelsInBattle.bright}/${pixelsInBattle.n}）`,
    );

    // 存档
    const SAVE_EXPR = `(() => { try { const r = localStorage.getItem('zhuoxian.save.v1'); return r ? r.length : 0; } catch (e) { return -1; } })()`;
    const saved = await cdp.eval(SAVE_EXPR);
    check('线上 localStorage 有存档', saved > 100, `长度 ${saved}`);
    await cdp.send('Page.reload', { ignoreCache: false });
    await sleep(6000);
    const saved2 = await cdp.eval(SAVE_EXPR);
    check('reload 后存档还在', saved2 > 100, `长度 ${saved2}`);

    // 控制台
    const errors = [];
    for (const ev of cdp.events) {
      if (ev.method === 'Runtime.exceptionThrown') errors.push(ev.params.exceptionDetails?.text ?? 'exception');
      if (ev.method === 'Log.entryAdded' && ev.params.entry.level === 'error') {
        const txt = ev.params.entry.text ?? '';
        if (!/favicon/i.test(txt)) errors.push(txt);
      }
    }
    check('控制台零报错', errors.length === 0, errors.slice(0, 3).join(' | '));

    try {
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      const out = path.resolve('docs/live.png');
      fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
      console.log(`\n  截图：${out}`);
    } catch {}
  } finally {
    try { chrome.kill(); } catch {}
  }

  const pass = results.filter((r) => r.ok).length;
  const total = results.length;
  console.log(`\n=== ${pass}/${total} ===`);
  if (pass !== total) {
    console.log('失败项：');
    for (const r of results) if (!r.ok) console.log(`  - ${r.name}: ${r.detail}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('探针自身出错：', e);
  process.exitCode = 1;
});
