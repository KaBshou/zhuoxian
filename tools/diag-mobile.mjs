/**
 * 手机视口体检（一次性诊断，不属于盘子；跑完看数字再决定要不要做适配）
 *
 * 用法：node tools/diag-mobile.mjs [url]
 *
 * 为什么单独写：浊仙的逻辑画布是**固定 960×540**，CSS 用 max-width:100% 缩放。
 * 所以在窄屏上「布局不会坏」，但**字会变小**——12px 的逻辑字在 390 CSS 宽的屏上
 * 只剩 12 × (390/960) ≈ 4.9 CSS px。这个脚本就是把「小到什么程度」量出来，
 * 而不是靠猜。指标口径：
 *   1 cssPerLogical = 画布 CSS 宽 / 960   → 1 逻辑像素等于多少 CSS 像素
 *   2 最小字号（12px 逻辑）折算成 CSS px  → <11 就是读不清（视觉标准，不是玄学）
 *   3 画布占视口比例（面积）              → 竖屏 16:9 会浪费大量上下空间
 *   4 是否横屏（宽 > 高）
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE_URL = process.argv[2] ?? 'http://127.0.0.1:5274/';
const PORT = 9371;
const PROF = fs.mkdtempSync(path.join(os.tmpdir(), 'zx-mobile-'));

const DEVICES = [
  { name: 'iPhone 12/13（竖）', width: 390, height: 844, dpr: 3 },
  { name: 'iPhone 12/13（横）', width: 844, height: 390, dpr: 3 },
  { name: '安卓小屏（竖）', width: 360, height: 640, dpr: 2 },
  { name: 'iPad（竖）', width: 820, height: 1180, dpr: 2 },
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
    '--disable-dev-shm-usage',
    'about:blank',
  ],
  { stdio: 'ignore', detached: false },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function wsUrl() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      /* not ready */
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
  return {
    canvasCssW: Math.round(r.width),
    canvasCssH: Math.round(r.height),
    backing: c.width + 'x' + c.height,
    cssPerLogical: Number(cssPerLogical.toFixed(3)),
    minFontCss: Number((12 * cssPerLogical).toFixed(1)),
    hudFontCss: Number((11 * cssPerLogical).toFixed(1)),
    areaPct: Math.round(((r.width * r.height) / (innerWidth * innerHeight)) * 100),
    portrait: innerHeight > innerWidth,
    scrollable: document.documentElement.scrollHeight > innerHeight + 1,
  };
})()`;

const rows = [];
try {
  await send('Page.enable');
  for (const d of DEVICES) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: d.width,
      height: d.height,
      deviceScaleFactor: d.dpr,
      mobile: true,
    });
    await send('Page.navigate', { url: BASE_URL });
    let ok = false;
    for (let i = 0; i < 100; i++) {
      await sleep(200);
      ok = await evaluate('!!(document.getElementById("stage"))');
      if (ok) break;
    }
    if (!ok) throw new Error('画布没出来：' + d.name);
    await sleep(600);
    const m = await evaluate(MEASURE);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const file = `F:/dsh-work/zhuoxian/docs/mobile-${d.width}x${d.height}.png`;
    fs.writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
    rows.push({ ...d, ...m });
    console.log(
      `${d.name.padEnd(18)} 视口 ${d.width}x${d.height} @${d.dpr}x  →  画布 ${m.canvasCssW}x${m.canvasCssH} CSS（backing ${m.backing}）` +
        `  1逻辑px=${m.cssPerLogical} CSS  最小字 ${m.minFontCss}px  HUD 字 ${m.hudFontCss}px  占屏 ${m.areaPct}%` +
        `${m.portrait ? '  竖屏' : '  横屏'}`,
    );
  }
} catch (e) {
  console.log('ERR ' + String(e).slice(0, 200));
} finally {
  ws.close();
  chrome.kill();
  console.log('\n判据（视觉标准，先看数字再动手）：');
  console.log('  可读下限：最小逻辑字 12px 折算成 CSS 后 ≥ 11px（约等于手机上 11pt 正文）');
  console.log('  占屏下限：画布面积占视口 ≥ 45%（再低说明浪费太多黑边）');
  const bad = rows.filter((r) => r.minFontCss < 11 || r.areaPct < 45);
  if (bad.length === 0) console.log('  → 全部达标，不需要适配');
  else {
    console.log('  → 不达标：' + bad.map((r) => `${r.name}(字 ${r.minFontCss}px / 占屏 ${r.areaPct}%)`).join('、'));
    console.log('    修法候选：① 竖屏时提示「请横屏」并给出横屏图标 ② 画布按可用高度反算 CSS 宽（填满高度、左右留黑）');
    console.log('    ③ DPR 后备缓冲（只提清晰度，不改布局）—— 注意 ①③ 可以同时做，② 会裁掉左右 HUD。');
  }
}
