/**
 * 桌面视口体检（一次性诊断，不属于盘子）
 *
 * 用法：node tools/diag-viewport.mjs [url]
 *
 * 量三件事：
 *   1) 画布 CSS 尺寸是否铺满视口（保持 16:9，只留必要黑边）
 *   2) 后备缓冲是否跟着放大（`backing / 960` = 像素比；等于 cssW×dpr÷960 才算清晰）
 *   3) 12px 逻辑字折算成 CSS 像素是多少（可读性直接看这个数）
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE_URL = process.argv[2] ?? 'http://127.0.0.1:5274/';
const PORT = 9374;
const PROF = fs.mkdtempSync(path.join(os.tmpdir(), 'zx-vp-'));

const VIEWPORTS = [
  { w: 1920, h: 1080, dpr: 1, name: '1920×1080（主流桌面）' },
  { w: 1440, h: 900, dpr: 1, name: '1440×900（笔记本）' },
  { w: 1512, h: 982, dpr: 2, name: '1512×982 @2x（MacBook）' },
  { w: 2560, h: 1440, dpr: 1, name: '2560×1440（2K）' },
  { w: 1280, h: 720, dpr: 1, name: '1280×720（小窗）' },
];

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROF}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--no-sandbox',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (p) return p.webSocketDebuggerUrl;
    } catch {
      /* wait */
    }
    await sleep(200);
  }
  throw new Error('CDP 起不来');
}

const ws = new WebSocket(await wsUrl());
await new Promise((res, rej) => {
  ws.addEventListener('open', res, { once: true });
  ws.addEventListener('error', rej, { once: true });
});
let id = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
});
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const mid = ++id;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 200));
  return r.result?.result?.value;
}

const MEASURE = `(() => {
  const c = document.getElementById('stage');
  const r = c.getBoundingClientRect();
  const cssPerLogical = r.width / 960;
  const ratio = c.width / 960;
  const hook = window.__zhuoxian && window.__zhuoxian.viewport ? window.__zhuoxian.viewport() : null;
  return {
    css: Math.round(r.width) + 'x' + Math.round(r.height),
    backing: c.width + 'x' + c.height,
    ratio: Number(ratio.toFixed(3)),
    cssPerLogical: Number(cssPerLogical.toFixed(3)),
    minFontCss: Number((12 * cssPerLogical).toFixed(1)),
    hudFontCss: Number((11 * cssPerLogical).toFixed(1)),
    areaPct: Math.round(((r.width * r.height) / (innerWidth * innerHeight)) * 100),
    hookRatio: hook ? Number(hook.ratio.toFixed(3)) : null,
    sharp: Math.abs(ratio - (r.width * (devicePixelRatio || 1)) / 960) < 0.06,
  };
})()`;

const rows = [];
try {
  await send('Page.enable');
  for (const v of VIEWPORTS) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: v.w,
      height: v.h,
      deviceScaleFactor: v.dpr,
      mobile: false,
    });
    await send('Page.navigate', { url: BASE_URL });
    let ok = false;
    for (let i = 0; i < 100; i++) {
      await sleep(200);
      ok = await evaluate('!!document.getElementById("stage")');
      if (ok) break;
    }
    if (!ok) throw new Error('画布没出来 ' + v.name);
    await sleep(700);
    const m = await evaluate(MEASURE);
    rows.push({ ...v, ...m });
    console.log(
      `${v.name.padEnd(24)} 视口 ${v.w}×${v.h}@${v.dpr}x → 画布 ${m.css} CSS · backing ${m.backing}（比 ${m.ratio}）` +
        ` · 12px 字折算 ${m.minFontCss}px · 占屏 ${m.areaPct}% · 清晰 ${m.sharp ? '✅' : '❌'} · 钩子比 ${m.hookRatio}`,
    );
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`F:/dsh-work/zhuoxian/docs/viewport-${v.w}x${v.h}.png`, Buffer.from(shot.result.data, 'base64'));
  }
} catch (e) {
  console.log('ERR ' + String(e).slice(0, 240));
} finally {
  ws.close();
  chrome.kill();
  console.log('\n判据：① 占屏 ≥ 80%（16:9 窗口应接近 100%）② 清晰 ✅（backing = cssW×dpr）③ 12px 字折算 ≥ 11px');
  const bad = rows.filter((r) => r.areaPct < 80 || !r.sharp || r.minFontCss < 11);
  console.log(bad.length === 0 ? '  → 全部达标' : '  → 不达标：' + bad.map((r) => `${r.w}×${r.h}(占屏 ${r.areaPct}% 清晰 ${r.sharp} 字 ${r.minFontCss}px)`).join('、'));
}
