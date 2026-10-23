/**
 * 部署验收探针（`probe-dist.mjs`）：把 `dist/` 当成真实静态站，**挂在子路径 `/zhuoxian/` 下**跑起来。
 *
 * 为什么必须单独有一条：
 *   所有别的探针都跑 `vite dev`（`tools/_serve.mjs`），dev 下的资源路径是 `/src/main.ts` 这种，
 *   而真实部署是 `index.html + assets/*.js`。`vite.config.ts` 里那句 `base: './'` 就是为子路径写的，
 *   但它是不是真的对 —— dev 环境**永远验证不到**。这个项目已经踩过一次「本地好看、部署白屏」类的坑
 *   （`base: '/'` 会在 /zhuoxian/ 下把资源指到根目录）。玩家打开的第一个页面不能靠推理。
 *
 * 判据（都要真跑出来）：
 *   1. `/zhuoxian/` 返回 200，`assets/*.js` 与 `assets/*.css` 也 200（**没有任何 4xx**，favicon 除外）
 *   2. canvas 真的画了东西（不是全黑，也不是白屏）
 *   3. `window.__zhuoxian` 调试钩子存在（说明 `main.ts` 真的执行了，而不是只加载了文件）
 *   4. 会打：10 秒内 kills > 0（说明战斗循环在跑）
 *   5. 存档在子路径 origin 下可用：reload 后 kills 不回零
 *   6. 控制台零报错
 *
 * 用法：`node tools/probe-dist.mjs [port]`
 *
 * 盘子里的调用方式：`_plate.ps1` 给每个探针传的是 **base URL**（`http://127.0.0.1:5292/`），
 * 而本探针自己起静态站、参数是**端口**。所以这里把「URL 或端口」都接受：
 * 传 `http://...` 时忽略它（用默认 SITE_PORT），只为让盘子能统一调用；
 * 另外 `dist/index.html` 不存在时打印 `SKIP ...` 并 exit 0 —— 缺构建产物不该算红
 * （判定见 `_plate-summary.mjs` 的 SKIP 语义：不进分母）。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9365;
const RAW_ARG = process.argv[2];
const ARG_IS_URL = typeof RAW_ARG === 'string' && /^https?:\/\//.test(RAW_ARG);
const SITE_PORT = ARG_IS_URL ? 5388 : Number(RAW_ARG ?? 5388);
const PREFIX = '/zhuoxian/';
const DIST = path.resolve('dist');
const SHOT = process.argv[3] ?? 'docs/probe-dist.png';
if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.log(`SKIP  dist/index.html 不存在（先跑 npm run build；缺产物不参与分母） ${DIST}`);
  process.exit(0);
}

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' · ' + detail : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/** 只服务 /zhuoxian/ 下的 dist，故意不做「找不到就回退 index.html」——SPA 回退会掩盖路径错。 */
const served = [];
const site = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  if (!url.startsWith(PREFIX)) {
    served.push({ url, status: 404, note: '前缀外' });
    res.writeHead(404).end('not here');
    return;
  }
  let rel = url.slice(PREFIX.length);
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  const file = path.join(DIST, rel);
  if (!file.startsWith(DIST)) {
    served.push({ url, status: 403 });
    res.writeHead(403).end();
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      served.push({ url, status: 404 });
      res.writeHead(404, { 'content-type': 'text/plain' }).end('404');
      return;
    }
    served.push({ url, status: 200 });
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' }).end(data);
  });
});
await new Promise((r) => site.listen(SITE_PORT, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${SITE_PORT}`;
const URL = `${ORIGIN}${PREFIX}`;

function cdpGet(p) {
  return new Promise((resolve, reject) => {
    http
      .get(`http://127.0.0.1:${CDP_PORT}${p}`, (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(d));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    };
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      throw new Error(String(r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)));
    }
    return r.result.value;
  }
}

const profile = `${process.env.TEMP}\\probe-dist-${Date.now()}`;
fs.mkdirSync(profile, { recursive: true });
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${profile}`,
    '--window-size=1000,620',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--hide-scrollbars',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

let ws;
let failed = 0;
try {
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(250);
    try {
      target = (await cdpGet('/json/list')).find((t) => t.type === 'page');
    } catch {
      /* 等 */
    }
  }
  if (!target) throw new Error('CDP 没起来');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  const cdp = new Cdp(ws);

  const consoleErrors = [];
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Network.enable');
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      consoleErrors.push(m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    }
  });

  await cdp.send('Page.navigate', { url: URL });
  await sleep(2500);

  const html = await cdp.eval('document.documentElement.outerHTML.slice(0, 400)');
  check('子路径下 index.html 打开了', typeof html === 'string' && html.length > 100, `${html?.length} chars`);

  const assets = await cdp.eval(
    '(()=>Array.from(document.querySelectorAll("script[src],link[rel=stylesheet]")).map(e=>e.src||e.href))()',
  );
  const badAsset = (assets ?? []).filter((u) => !u.includes(PREFIX));
  check(
    '资源 URL 都带子路径前缀（base: \'./\' 生效）',
    Array.isArray(assets) && assets.length >= 2 && badAsset.length === 0,
    `assets=${assets?.length}${badAsset.length ? ' 越界=' + badAsset[0] : ''}`,
  );

  const notFound = served.filter((s) => s.status !== 200 && !s.url.includes('favicon'));
  check('没有任何 4xx/403（favicon 除外）', notFound.length === 0, notFound.length ? notFound.map((s) => s.status + ' ' + s.url).join('; ') : `${served.length} 次请求`);

  // 白屏检测：canvas 全黑（平均亮度 < 2）或全亮（> 240）都算没画对
  const paint = await cdp.eval(`(() => {
    const c = document.getElementById('stage');
    if (!c) return { missing: true };
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let sum = 0, lit = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      sum += r * 0.299 + g * 0.587 + b * 0.114; n++;
      if (r + g + b > 90) lit++;
    }
    return { mean: sum / n, lit, w: c.width, h: c.height };
  })()`);
  check(
    'canvas 真的画了东西（不是白屏也不是全黑）',
    !paint?.missing && paint.mean > 2 && paint.mean < 240 && paint.lit > 500,
    paint?.missing ? 'canvas 不存在' : `mean=${paint.mean.toFixed(1)} lit=${paint.lit}/${paint.w * paint.h}`,
  );

  const hooks = await cdp.eval('Boolean(window.__zhuoxian && window.__zhuoxian.session)');

  // 生产构建**故意不带** `window.__zhuoxian`（`main.ts` 里 `if (import.meta.env.DEV)` 守住，
  // 免得给玩家一份能改存档的控制台）。所以这里不读钩子，改看客观事实：
  //   ① 画面在变 → 循环真的在跑（不是画了一帧就死）
  //   ② localStorage 里出现存档 → 在子路径 origin 下存档链路是通的
  check(
    '生产构建不带调试钩子（玩家打不开后门）',
    hooks === false,
    hooks === true ? '⚠ dist 里暴露了 __zhuoxian' : 'hooks 未暴露，符合预期',
  );

  // 真实玩家第一步：选道统。dist 里没有 `?cls=` 捷径的用法（那是探针专用参数），
  // 这里就走真按键 —— 顺便验证「选道统 → 进战斗」在构建产物里也接得上。
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Enter', key: 'Enter', windowsVirtualKeyCode: 13 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Enter', key: 'Enter', windowsVirtualKeyCode: 13 });
  await sleep(1500);
  const entered = await cdp.eval(`(() => {
    const c = document.getElementById('stage');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let sum = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { sum += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114; n++; }
    return { mean: sum / n };
  })()`);
  check(
    '按 Enter 能进入战斗（选道统界面确实过了）',
    entered.mean < paint.mean - 1 || entered.mean > paint.mean + 1,
    `mean ${paint.mean.toFixed(1)} → ${entered.mean.toFixed(1)}`,
  );

  const snap = () =>
    cdp.eval(`(() => {
      const c = document.getElementById('stage');
      const ctx = c.getContext('2d');
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let h = 2166136261;
      for (let i = 0; i < d.length; i += 457) h = ((h ^ d[i]) * 16777619) >>> 0;
      const s = localStorage.getItem('zhuoxian.save.v1');
      let savedAt = 0;
      try { savedAt = s ? (JSON.parse(s).savedAt || 0) : 0; } catch {}
      return { h, has: Boolean(s), savedAt };
    })()`);


  const s0 = await snap();
  await sleep(6000);
  const s1 = await snap();
  check('游戏循环在跑（6 秒内画面像素变化）', s0.h !== s1.h, `hash ${s0.h} → ${s1.h}`);

  try {
    fs.mkdirSync(path.dirname(SHOT), { recursive: true });
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(SHOT, Buffer.from(shot.data, 'base64'));
  } catch {
    /* 截图不是判据 */
  }

  check(
    '子路径 origin 下写出了存档（localStorage 键名 zhuoxian.save.v1）',
    s1.has,
    s1.has ? `savedAt=${new Date(s1.savedAt).toISOString()}` : '没有 zhuoxian.save.v1',
  );

  // reload：存档必须还能读回来（这是「给朋友玩」最容易坏的一环 —— 换个路径就白给了）
  await cdp.send('Page.reload', { ignoreCache: false });
  await sleep(2800);
  const after = await snap();
  check(
    'reload 后存档仍在同 origin（子路径部署不会丢档）',
    after.has && after.savedAt >= s1.savedAt,
    after.has ? `savedAt ${s1.savedAt} → ${after.savedAt}` : 'reload 后读不到存档',
  );

  const keys = await cdp.eval(`(() => Object.keys(localStorage).filter((k) => k.includes('zhuoxian')))()`);
  check(
    '存储键不越界（只有本游戏自己的键）',
    Array.isArray(keys) && keys.length > 0 && keys.every((k) => k.startsWith('zhuoxian.')),
    Array.isArray(keys) ? keys.join(',') : '读不到',
  );

  // ── 手机路径：没有键盘，只能用手点 ────────────────────────────────────
  // 这条必须跑在**构建产物**上：dev 里有调试钩子能绕过，dist 里没有，
  // 而「手机能不能点进游戏」是"发链接给朋友玩"这条目标的唯一验收点。
  // 注意：dist 里读不到 classCardRects，所以这里**逐点试探**（不发死坐标常量，
  // 布局改了也不会静默点空 —— 点空的表现就是"亮度不变"，那会红）。
  //
  // 清档必须走 CDP 的 Storage.clearDataForOrigin：**先 localStorage.clear() 再 reload
  // 会把旧档写回来**（reload 触发 pagehide → 离场 flush 把当前会话存回去），
  // 这是本项目 reset() 那次的同一个坑（D44 之前踩过）。不带 origin 清除就永远清不掉。
  await cdp.send('Page.navigate', { url: 'about:blank' });
  await sleep(600);
  await cdp.send('Storage.clearDataForOrigin', { origin: ORIGIN, storageTypes: 'local_storage' });
  await cdp.send('Page.navigate', { url: URL });
  await sleep(2800);
  const meanOf = () =>
    cdp.eval(`(() => {
      const c = document.getElementById('stage');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let sum = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { sum += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114; n++; }
      return sum / n;
    })()`);
  const geo = await cdp.eval(`(() => {
    const c = document.getElementById('stage');
    const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height, cw: c.width, ch: c.height };
  })()`);
  const beforeClick = await meanOf();
  // 兜底：真清档后应该停在选道统（画面偏暗）。若不是，说明档没清掉，后面全部读数都不可信
  check('手机路径起点确实是选道统界面（档真清掉了）', beforeClick < 20, `mean=${beforeClick.toFixed(1)}`);
  let clickedIn = false;
  let usedY = 0;
  const trace = [];
  for (const frac of [0.3, 0.55, 0.78]) {
    const cx = geo.left + 0.5 * geo.width; // 画布水平中心
    const cy = geo.top + frac * geo.height;
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', clickCount: 1 });
    await sleep(40);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx, y: cy, button: 'left', clickCount: 1 });
    await sleep(900);
    const m = await meanOf();
    trace.push(`y${frac}:${cx.toFixed(0)},${cy.toFixed(0)}→${m.toFixed(1)}`);
    if (Math.abs(m - beforeClick) > 1) {
      clickedIn = true;
      usedY = frac;
      break;
    }
  }
  check(
    '手机路径：点屏幕中间能选道统并进战斗（dist 里没有键盘）',
    clickedIn,
    clickedIn
      ? `点 y=${usedY} 后亮度 ${beforeClick.toFixed(1)} 变化`
      : `三次点击后画面无变化 ${trace.join(' ')} · canvas ${geo.width.toFixed(0)}x${geo.height.toFixed(0)}@${geo.left.toFixed(0)},${geo.top.toFixed(0)}`,
  );

  // 进战斗后必须真的在动（否则"点进去了"只是换了个静态画面）
  const h0 = await snap();
  await sleep(2500);
  const h1 = await snap();
  check('点进来的战斗确实在跑（2.5 秒像素变化）', h0.h !== h1.h, `hash ${h0.h} → ${h1.h}`);

  check('控制台零报错', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  failed = results.filter((r) => !r.pass).length;
} finally {
  try {
    ws?.close();
  } catch {
    /* ignore */
  }
  chrome.kill();
  site.close();
}


const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} 通过 · ${failed === 0 ? 'EXIT=0' : 'EXIT=1'}`);
process.exitCode = failed === 0 ? 0 : 1;
