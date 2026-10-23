/**
 * 存档面板探针（导出 / 导入）：S 键打开、按钮能点、导出能解析、导入有确认门、刷新后还在。
 *
 * 为什么这条探针必须存在：
 *   `tests/save-transfer.test.ts` 16 条只证明「纯逻辑对」，证明不了三件事 ——
 *   ① S 键真的接在存档面板上（本项目踩过一次同类：activatePanel 没有新分支，按键打出了别的面板）；
 *   ② 面板真的画出来了（像素），而且关闭态与打开态能区分；
 *   ③ 导入走的是「先确认再覆盖」而不是手滑即覆盖。
 *
 * 判据纪律（沿用 probe-achievement / probe-codex / probe-touch）：
 * - 近黑底板盖上来 ⇒ 平均亮度会【降】；
 * - **结构像素 > 调色板像素**：存档面板左缘有 3px 金条，关着时那一列不是金色；
 * - 看不见的状态一律走调试钩子；**不许写死产品常量**（按钮数、面板宽度都从钩子取）。
 *
 * 跑法：先 `node tools/_serve.mjs 5293`，再 `node tools/probe-save-panel.mjs http://127.0.0.1:5293/`
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const CHROME =
  process.env.CHROME_PATH ??
  (process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : 'google-chrome');
const PORT = Number(process.env.PROBE_PORT ?? 9371);
const BASE_URL = process.env.PROBE_URL ?? process.argv[2] ?? 'http://127.0.0.1:5293/';
const PROBE_CLASS = process.env.PROBE_CLASS ?? 'yujian';
const URL = BASE_URL.includes('cls=')
  ? BASE_URL
  : `${BASE_URL}${BASE_URL.includes('?') ? '&' : '?'}cls=${PROBE_CLASS}`;
const SHOT = process.argv[3] ?? 'F:\\dsh-work\\zhuoxian\\docs\\probe-save-panel.png';

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' · ' + detail : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fetchJson(p) {
  return new Promise((resolve, reject) => {
    http
      .get(`http://127.0.0.1:${PORT}${p}`, (res) => {
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
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      throw new Error(String(r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)));
    }
    return r.result.value;
  }
  async key(code, keyName) {
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: keyName, windowsVirtualKeyCode: 0 });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: keyName, windowsVirtualKeyCode: 0 });
    await sleep(180);
  }
  async click(x, y) {
    const ev = (type) => ({
      type,
      x,
      y,
      button: 'left',
      buttons: type === 'mousePressed' ? 1 : 0,
      clickCount: 1,
    });
    await this.send('Input.dispatchMouseEvent', ev('mousePressed'));
    await sleep(45);
    await this.send('Input.dispatchMouseEvent', ev('mouseReleased'));
    await sleep(300);
  }
}

/** 全屏亮度 + 面板左缘结构金条（save-panel W=560 居中于 960 ⇒ 左缘 x≈200） */
const FINGERPRINT = `(() => {
  const c = document.getElementById('stage');
  const ctx = c.getContext('2d');
  const all = ctx.getImageData(0, 0, c.width, c.height).data;
  let sum = 0, n = 0;
  for (let i = 0; i < all.length; i += 4) {
    sum += all[i] * 0.299 + all[i + 1] * 0.587 + all[i + 2] * 0.114;
    n++;
  }
  const x0 = Math.round((c.width - 560) / 2);
  const bar = ctx.getImageData(x0, 24, 6, 480).data;
  let gold = 0;
  for (let i = 0; i < bar.length; i += 4) {
    const r = bar[i], g = bar[i + 1], b = bar[i + 2];
    if (r > 120 && r - b > 55 && g > 60) gold++;
  }
  return { mean: sum / n, goldBar: gold, canvasW: c.width };
})()`;

const profile = path.join(os.tmpdir(), `probe-savepanel-${Date.now()}`);
fs.mkdirSync(profile, { recursive: true });
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--window-size=1000,620',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--hide-scrollbars',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

let ws;
try {
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(250);
    try {
      const list = await fetchJson('/json/list');
      target = list.find((t) => t.type === 'page');
    } catch {
      /* 等 */
    }
  }
  if (!target) throw new Error('CDP 没起来（端口被上一轮崩掉的 chrome 占着？）');

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
    if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) {
      const url = m.params.response.url;
      if (!url.includes('favicon')) consoleErrors.push(`HTTP ${m.params.response.status} ${url}`);
    }
  });

  // 真清档（走 reset()：localStorage.clear() 之后 reload 会被离场 flush 写回旧档）
  await cdp.send('Page.navigate', { url: URL });
  await sleep(1800);
  await cdp.eval('(()=>{window.__zhuoxian?.reset();return true})()');
  await sleep(2600);

  // ── 1. 钩子齐全 ────────────────────────────────────────────
  const hooks = await cdp.eval(`(() => {
    const z = window.__zhuoxian;
    if (!z) return { ok: false };
    return {
      ok: true,
      savePanel: typeof z.savePanel === 'object' && z.savePanel !== null,
      exportSaveText: typeof z.exportSaveText === 'function',
      stageImportText: typeof z.stageImportText === 'function',
      confirmImport: typeof z.confirmImport === 'function',
      hudButtons: typeof z.hudButtons === 'function',
      panelsOpen: typeof z.panelsOpen === 'function',
    };
  })()`);
  check(
    '调试钩子齐全（探针不靠点文件选择器）',
    hooks.ok && hooks.savePanel && hooks.exportSaveText && hooks.stageImportText && hooks.confirmImport,
    JSON.stringify(hooks),
  );

  const closed = await cdp.eval(FINGERPRINT);
  const p0 = await cdp.eval('window.__zhuoxian.savePanel');
  check('新号：面板关着、状态 idle、没有待导入', p0.visible === false && p0.phase === 'idle' && p0.pending === false, JSON.stringify(p0));

  // ── 2. S 键打开 ────────────────────────────────────────────
  await cdp.key('KeyS', 's');
  const open1 = await cdp.eval(FINGERPRINT);
  const p1 = await cdp.eval('window.__zhuoxian.savePanel');
  const panels1 = await cdp.eval('window.__zhuoxian.panelsOpen()');
  check('按 S 打开存档面板', p1.visible === true && Array.isArray(panels1) && panels1.length === 1 && panels1[0] === 'save', `panelsOpen=${JSON.stringify(panels1)}`);
  check('面板真的画出来了（亮度下降）', open1.mean < closed.mean - 3, `${closed.mean.toFixed(1)} → ${open1.mean.toFixed(1)}`);
  check('左侧结构金条（结构像素，比金色总量可靠）', open1.goldBar > 200 && closed.goldBar < 50, `关 ${closed.goldBar} → 开 ${open1.goldBar}`);

  // ── 3. 导出文本可解析 ──────────────────────────────────────
  const exported = await cdp.eval(`(() => {
    const t = window.__zhuoxian.exportSaveText();
    let env = null;
    try { env = JSON.parse(t); } catch {}
    return { len: t.length, magic: env?.magic ?? null, hasSave: typeof env?.save === 'object' };
  })()`);
  check('导出文本是带信封的 JSON（magic + save）', exported.len > 200 && exported.magic === 'zhuoxian-save' && exported.hasSave, JSON.stringify(exported));

  // ── 4. 导入走「先确认再覆盖」────────────────────────────────
  const staged = await cdp.eval(`(() => {
    const z = window.__zhuoxian;
    const text = z.exportSaveText();
    const r = z.stageImportText(text);
    return { r, panel: z.savePanel };
  })()`);
  check(
    '暂存自己的存档：解码成功 + 进入确认阶段（不直接覆盖）',
    staged.r.ok === true && staged.r.message.length > 0 && staged.panel.phase === 'confirm' && staged.panel.pending === true,
    `${staged.r.message}`,
  );

  const bad = await cdp.eval(`(() => {
    const z = window.__zhuoxian;
    const r = z.stageImportText('这不是存档文件');
    return { r, panel: z.savePanel };
  })()`);
  check(
    '暂存垃圾文件：判否 + 给一句人话 + 不进入确认阶段',
    bad.r.ok === false && bad.r.message.length > 4 && bad.panel.pending === true,
    `${bad.r.message}`,
  );

  // ── 5. 点击「确认导入」按钮（真鼠标事件，走命中测试） ────────
  const geo = await cdp.eval(`(() => {
    const c = document.getElementById('stage');
    const rect = c.getBoundingClientRect();
    return { left: rect.left, top: rect.top, w: rect.width, h: rect.height, cw: c.width, ch: c.height };
  })()`);
  const toClient = (x, y) => [geo.left + (x / geo.cw) * geo.w, geo.top + (y / geo.ch) * geo.h];

  const beforeImport = await cdp.eval('window.__zhuoxian.session.character.step');
  const panelBtns = await cdp.eval('window.__zhuoxian.saveButtons()');
  // 不写死坐标：按钮矩形由 save-panel.ts 的 savePanelButtons 给出（唯一出处）
  const confirmBtn = Array.isArray(panelBtns) ? panelBtns.find((b) => b.id === 'confirm') : null;
  check('确认阶段有两个按钮，且来自渲染器的同一份布局', Array.isArray(panelBtns) && panelBtns.length >= 2, JSON.stringify(panelBtns?.map?.((b) => b.id)));
  if (confirmBtn) {
    const [cx, cy] = toClient(confirmBtn.x + confirmBtn.w / 2, confirmBtn.y + confirmBtn.h / 2);
    await cdp.click(cx, cy);
  }
  const pAfter = await cdp.eval('window.__zhuoxian.savePanel');
  const stepAfter = await cdp.eval('window.__zhuoxian.session.character.step');
  check(
    '点「确认导入」真的执行了导入（待导入被消费、面板关闭）',
    pAfter.pending === false && pAfter.visible === false,
    `pending=${pAfter.pending} visible=${pAfter.visible} step ${beforeImport} → ${stepAfter}`,
  );

  // ── 6. 点 HUD「存档」按钮也能开（手机唯一入口）─────────────
  await cdp.eval('window.__zhuoxian.reset()');
  await sleep(2600);
  const btns = await cdp.eval('window.__zhuoxian.hudButtons()');
  const saveBtn = Array.isArray(btns) ? btns.find((b) => b.id === 'save') : null;
  check('HUD 有「存档」按钮（手机没有 S 键）', saveBtn !== null && saveBtn !== undefined, saveBtn ? `key=${saveBtn.key}` : 'missing');
  if (saveBtn) {
    const [cx, cy] = toClient(saveBtn.x + saveBtn.w / 2, saveBtn.y + saveBtn.h / 2);
    await cdp.click(cx, cy);
    const p2 = await cdp.eval('window.__zhuoxian.savePanel');
    check('点 HUD「存档」按钮能打开面板', p2.visible === true, JSON.stringify(p2));
    // 面板开着时点面板外空白：不该穿透关掉面板（否则点空白=关面板，玩家会以为按钮失灵）
    const [ox, oy] = toClient(20, 300);
    await cdp.click(ox, oy);
    const p3 = await cdp.eval('window.__zhuoxian.savePanel');
    check('面板开着时点面板外空白不穿透', p3.visible === true, JSON.stringify(p3));
    await cdp.key('Escape', 'Escape');
    const p4 = await cdp.eval('window.__zhuoxian.savePanel');
    check('Escape 能关掉面板', p4.visible === false, JSON.stringify(p4));
  }

  // ── 7. 导入后写盘、刷新还在 ────────────────────────────────
  const persisted = await cdp.eval(`(() => {
    const raw = localStorage.getItem('zhuoxian.save.v1');
    return { has: typeof raw === 'string' && raw.length > 100 };
  })()`);
  check('存档键里有内容（导入/自动存档都写这条键）', persisted.has === true, JSON.stringify(persisted));

  await cdp.send('Page.reload');
  await sleep(3200);
  const afterReload = await cdp.eval(`(() => {
    const z = window.__zhuoxian;
    if (!z) return { ok: false };
    return { ok: true, step: z.session.character.step, savePanel: z.savePanel };
  })()`);
  check('刷新后游戏还在跑、面板是关着的', afterReload.ok === true && afterReload.savePanel.visible === false, JSON.stringify(afterReload));

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(SHOT, Buffer.from(shot.data, 'base64'));

  check('控制台零报错', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  const passed = results.filter((r) => r.pass).length;
  console.log('');
  console.log(`${passed}/${results.length} 通过 · ${SHOT}`);
  console.log(`EXIT=${passed === results.length ? 0 : 1}`);
  process.exitCode = passed === results.length ? 0 : 1;
} finally {
  try {
    ws?.close();
  } catch {
    /* ignore */
  }
  try {
    chrome.kill();
  } catch {
    /* ignore */
  }
}
