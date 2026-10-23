/**
 * 触屏 / 鼠标输入探针（D92）：点卡片选道统、点按钮开面板、缩放后仍点得中。
 *
 * 为什么这条探针必须存在：
 *   这个项目的原始目标是「发个链接给朋友、手机点开就能玩」。
 *   2026-10-23 之前 `src/main.ts` 里【零个】click / pointer / touch 监听 —— 手机上
 *   连开局选道统都过不去（Enter 按不了）。这条探针就是那条链路的唯一验收。
 *
 * 判据纪律：
 * - **不许自己抄一套坐标常量**：按钮布局走 `hudButtons()`、卡片矩形走 `classCards()`
 *   （抄了就会在「按钮自适应压窄」「卡片按视口重排」之后静默点空，而点空只表现为
 *   「面板没开」，看起来像产品没做）；
 * - **点完必须读状态**：`panelsOpen()` 与 `classId` 是真相，像素只证明画出来了；
 * - 命中用**按钮中心**，另加一条「按钮下沿之外点不中」（防止命中判定写成整屏）；
 * - 干净 server 才可信：`tools/_serve.mjs` 里 `watch: null`，改了源码必须重启 server。
 *
 * 用法：node tools/probe-touch.mjs [URL] [截图路径]
 *   URL 默认 http://127.0.0.1:5288/ ；**不要带 cls=**（这条探针要自己点卡片选道统）。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = Number(process.env.PROBE_CDP_PORT ?? 9363);
const BASE_URL = process.env.PROBE_URL ?? process.argv[2] ?? 'http://127.0.0.1:5288/';
const SHOT = process.argv[3] ?? 'F:\\dsh-work\\zhuoxian\\docs\\probe-touch.png';

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' · ' + detail : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fetchJson(path) {
  return new Promise((resolve, reject) => {
    http
      .get(`http://127.0.0.1:${PORT}${path}`, (res) => {
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
    const r = await this.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) {
      throw new Error(String(r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)));
    }
    return r.result.value;
  }
  /** 真鼠标点击：按下 + 抬起（只发 down 不会触发 pointerdown 之后的 click 语义） */
  async click(x, y) {
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await sleep(40);
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await sleep(160);
  }
}

/** 画布平均亮度（面板压上来会【降】，但要跟"同一场景开/关"比，不能跨场景比） */
const MEAN = `(() => {
  const c = document.getElementById('stage');
  const ctx = c.getContext('2d');
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let sum = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) { sum += d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114; n++; }
  return sum / n;
})()`;

/** 画布 CSS 矩形 + 画布内坐标 → 客户端坐标（浏览器缩放/DPR 全走这条路） */
const locate = `(() => {
  const c = document.getElementById('stage');
  const r = c.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height, cw: c.width, ch: c.height };
})()`;

const profile = `${process.env.TEMP}\\probe-touch-${Date.now()}`;
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
    if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) {
      const url = m.params.response.url;
      if (!url.includes('favicon')) consoleErrors.push(`HTTP ${m.params.response.status} ${url}`);
    }
  });

  // 真清档（走 reset()：localStorage.clear() 之后 reload 会被离场 flush 写回旧档）
  await cdp.send('Page.navigate', { url: BASE_URL });
  await sleep(1800);
  await cdp.eval('(()=>{window.__zhuoxian?.reset();return true})()');
  await sleep(2500);

  // 轮询等钩子：reset() 之后是一整页 reload，冷启动时 Vite 首次 transform 可能要 3~5 秒。
  // 固定 sleep 2.5s 会让「冷启动慢」看起来像「钩子不存在」—— 这是探针的假红，不是产品的 bug。
  const hookExpr =
    'Boolean(window.__zhuoxian && window.__zhuoxian.hudButtons && window.__zhuoxian.panelsOpen && window.__zhuoxian.classCards)';
  let hooked = false;
  for (let i = 0; i < 25 && !hooked; i++) {
    try {
      hooked = await cdp.eval(hookExpr);
    } catch {
      hooked = false;
    }
    if (!hooked) await sleep(400);
  }
  check('调试钩子存在（hudButtons / panelsOpen / classCards）', hooked);
  if (!hooked) throw new Error('no hook');

  const host = await cdp.eval(locate);
  // 画布内坐标 → 客户端坐标：手机/缩放全靠这一步，探针自己也必须走它（否则测的是假的 1:1）
  const toClient = (x, y) => ({ x: host.left + (x / host.cw) * host.width, y: host.top + (y / host.ch) * host.height });

  // ── 1. 选道统：点卡片中心 ────────────────────────────────────────────
  const phase0 = await cdp.eval('(()=>window.__zhuoxian.phase)()');
  check('新号（或清档后）停在选道统阶段', phase0 === 'select', `phase=${phase0}`);

  const cards = await cdp.eval('(()=>window.__zhuoxian.classCards())()');
  const classIds = await cdp.eval('(()=>window.__zhuoxian.classIds())()');
  check('六张卡片矩形都读得到', Array.isArray(cards) && cards.length === classIds.length, `cards=${cards.length}`);

  // 点第 3 张（刻意不点第一张：能区分"点了"和"默认值"）
  const pick = 2;
  const target2 = cards[pick];
  const pt2 = toClient(target2.x + target2.w / 2, target2.y + target2.h / 2);
  await cdp.click(pt2.x, pt2.y);
  const afterClick = await cdp.eval('(()=>({phase: window.__zhuoxian.phase, cls: window.__zhuoxian.session?.character?.classId}))()');
  check('点卡片直接进入战斗（不用按 Enter）', afterClick.phase === 'play', `phase=${afterClick.phase}`);
  check('点的是哪张就选哪个道统（不是默认第一个）', afterClick.cls === classIds[pick], `cls=${afterClick.cls}`);

  await sleep(1200);
  const meanBase = await cdp.eval(MEAN);

  // ── 1.5 点空白处 = 跳过一条引导（手机没有空格键）────────────────────
  // 判据只认「步数涨 1」，不认像素：引导是纯文本条，像素变化说不清是哪条。
  const stepBefore = await cdp.eval('(()=>window.__zhuoxian.tutorialStep)()');
  const blank = toClient(host.cw / 2, host.ch * 0.55);
  await cdp.click(blank.x, blank.y);
  const stepAfter = await cdp.eval('(()=>window.__zhuoxian.tutorialStep)()');
  check('点空白处推进一条引导（手机的"空格"）', stepAfter === stepBefore + 1, `${stepBefore} → ${stepAfter}`);

  // 点按钮**不能**顺手把引导跳掉（两个功能一起动最难查，D92 之前空格与换玉简就撞过）
  const stepPreBtn = await cdp.eval('(()=>window.__zhuoxian.tutorialStep)()');
  const codexBtn0 = (await cdp.eval('(()=>window.__zhuoxian.hudButtons())()')).find((b) => b.id === 'codex');
  const codexPt0 = toClient(codexBtn0.x + codexBtn0.w / 2, codexBtn0.y + codexBtn0.h / 2);
  await cdp.click(codexPt0.x, codexPt0.y);
  const stepPostBtn = await cdp.eval('(()=>window.__zhuoxian.tutorialStep)()');
  check('点面板按钮不会顺手跳掉引导', stepPostBtn === stepPreBtn, `${stepPreBtn} → ${stepPostBtn}`);
  await cdp.click(codexPt0.x, codexPt0.y);

  // ── 2. 按钮条布局（从产品钩子读，不抄常量）────────────────────────────
  // ⚠ 不写死「六个」「固定顺序」：D93 加了第 7 个按钮（成就 J），写死的断言当天就假红。
  //   这里钉的是性质而不是名单：都在画布内、互不重叠、id 不重复、点谁开谁。
  //   顺序本身由 layoutHudButtons 的单测把守（纯函数），探针不该抄一份会腐的名单。
  const btns = await cdp.eval('(()=>window.__zhuoxian.hudButtons())()');
  const ids = btns.map((b) => b.id);
  check(
    '按钮都在画布内（数量从产品钩子读，不写死）',
    btns.length >= 6 && btns.every((b) => b.x >= 0 && b.x + b.w <= host.cw && b.y >= 0 && b.y + b.h <= host.ch),
    `${btns.length} 个：${ids.join(',')}`,
  );
  const overlaps = [];
  for (let i = 0; i < btns.length; i++) {
    for (let j = i + 1; j < btns.length; j++) {
      const a = btns[i];
      const b = btns[j];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) overlaps.push(`${a.id}×${b.id}`);
    }
  }
  check(
    '按钮互不重叠、id 不重复（点得中，不会两个按钮抢同一块）',
    overlaps.length === 0 && new Set(ids).size === ids.length,
    overlaps.length ? overlaps.join(' ') : `无重叠，${ids.length} 个唯一 id`,
  );

  // ── 3. 点按钮开面板 / 再点关面板 ─────────────────────────────────────
  const codexBtn = btns.find((b) => b.id === 'codex');
  const codexPt = toClient(codexBtn.x + codexBtn.w / 2, codexBtn.y + codexBtn.h / 2);
  await cdp.click(codexPt.x, codexPt.y);
  const open1 = await cdp.eval('(()=>window.__zhuoxian.panelsOpen())()');
  const meanOpen = await cdp.eval(MEAN);
  check('点「图鉴」按钮打开了图鉴面板', open1.includes('codex'), JSON.stringify(open1));
  check('面板压上来画面变暗（平均亮度降）', meanOpen < meanBase, `${meanBase.toFixed(1)} → ${meanOpen.toFixed(1)}`);

  await cdp.click(codexPt.x, codexPt.y);
  const open2 = await cdp.eval('(()=>window.__zhuoxian.panelsOpen())()');
  check('再点同一个按钮关掉面板（点得进也点得出）', !open2.includes('codex'), JSON.stringify(open2));

  // ── 3.5 一次只开一个面板（互斥）────────────────────────────────────
  // 六个面板都是整块覆盖层，两个同时开会互相盖住一半 → 玩家以为界面坏了。
  await cdp.click(codexPt.x, codexPt.y);
  const talentBtn = btns.find((b) => b.id === 'talent');
  const talentPt = toClient(talentBtn.x + talentBtn.w / 2, talentBtn.y + talentBtn.h / 2);
  await cdp.click(talentPt.x, talentPt.y);
  const openBoth = await cdp.eval('(()=>window.__zhuoxian.panelsOpen())()');
  check(
    '开着一个面板再点另一个：只留下新的那个（不叠面板）',
    openBoth.length === 1 && openBoth[0] === 'talent',
    JSON.stringify(openBoth),
  );
  await cdp.click(talentPt.x, talentPt.y);

  // ── 4. 每个按钮都能开、且开的是**它自己那块**面板 ──────────────────────
  // 契约（main.ts activatePanel）：点谁 → panelsOpen() 恰好等于 [那个 id]；再点 → 空。
  // ⚠ 不写死名单/数量：D93 加了「成就 J」后，写死的版本当天就假红。
  //   "点谁开谁"这条能抓到的真 bug 是「新按钮忘了在 activatePanel 里分支」（实测抓到过）。
  // 「音效」是开关不是面板（D181）：点它只切静音、不打开遮罩，所以不能混进「开/关面板」那组。
  const panelBtns = btns.filter((b) => b.id !== 'sound');
  const soundBtn = btns.find((b) => b.id === 'sound');

  const openedOk = [];
  for (const b of panelBtns) {
    const p = toClient(b.x + b.w / 2, b.y + b.h / 2);
    await cdp.click(p.x, p.y);
    const open = await cdp.eval('(()=>window.__zhuoxian.panelsOpen())()');
    await cdp.click(p.x, p.y);
    const closed = await cdp.eval('(()=>window.__zhuoxian.panelsOpen())()');
    const okOpen = open.length === 1 && open[0] === b.id;
    const okClose = closed.length === 0;
    openedOk.push(`${b.id}:${okOpen ? 'ok' : `开成${JSON.stringify(open)}`}${okClose ? '' : `/关不掉${JSON.stringify(closed)}`}`);
  }
  const allOpened = openedOk.every((s) => s.endsWith('ok'));
  check(
    '每个面板按钮点开后只开它自己那块面板、再点关掉（数量与 id 都从产品钩子读）',
    allOpened,
    openedOk.join(' '),
  );

  // 「音效」按钮：点一次切静音（不产生面板），再点一次切回来
  if (soundBtn) {
    const sp = toClient(soundBtn.x + soundBtn.w / 2, soundBtn.y + soundBtn.h / 2);
    const muted0 = await cdp.eval('(()=>window.__zhuoxian.audio().muted)()');
    await cdp.click(sp.x, sp.y);
    const afterClickMuted = await cdp.eval('(()=>window.__zhuoxian.audio().muted)()');
    const openAfterSound = await cdp.eval('(()=>window.__zhuoxian.panelsOpen())()');
    await cdp.click(sp.x, sp.y);
    const mutedBack = await cdp.eval('(()=>window.__zhuoxian.audio().muted)()');
    check(
      '「音效」按钮是开关不是面板（点一次切静音、不弹遮罩，再点切回）',
      afterClickMuted === !muted0 && openAfterSound.length === 0 && mutedBack === muted0,
      `muted ${muted0} → ${afterClickMuted} → ${mutedBack}，open=${JSON.stringify(openAfterSound)}`,
    );
  } else {
    check('「音效」按钮存在（D181 新增）', false, '按钮条里找不到 sound');
  }

  // 收尾：确保没有残留面板（只按「当前开着的」去关，不依赖名单）
  for (const b of [...btns].reverse()) {
    const open = await cdp.eval('(()=>window.__zhuoxian.panelsOpen())()');
    if (open.length > 0) {
      const p = toClient(b.x + b.w / 2, b.y + b.h / 2);
      const openId = open[0];
      const target = btns.find((x) => x.id === openId);
      if (target) {
        const q = toClient(target.x + target.w / 2, target.y + target.h / 2);
        await cdp.click(q.x, q.y);
      } else {
        await cdp.click(p.x, p.y);
      }
    }
  }
  const openFinal = await cdp.eval('(()=>window.__zhuoxian.panelsOpen())()');
  check('全部面板都能点关闭（清场）', openFinal.length === 0, JSON.stringify(openFinal));

  // ── 5. 按钮之外点不中（命中判定不是整屏）──────────────────────────────
  const btn0 = btns[0];
  const below = toClient(btn0.x + btn0.w / 2, btn0.y + btn0.h + 40);
  await cdp.click(below.x, below.y);
  const openBelow = await cdp.eval('(()=>window.__zhuoxian.panelsOpen())()');
  check('按钮下方（战斗区域）点击不会误开面板', openBelow.length === 0, JSON.stringify(openBelow));

  // ── 6. 缩放后仍点得中（手机真实路径）────────────────────────────────
  // 把画布 CSS 缩到 60%：坐标换算错的话，这一条必红
  await cdp.eval(`(() => {
    const c = document.getElementById('stage');
    c.style.width = '60%';
    c.style.height = 'auto';
    return true;
  })()`);
  await sleep(300);
  const host2 = await cdp.eval(locate);
  const scaleChanged = Math.abs(host2.width - host.width) > 20;
  check('画布被 CSS 缩放（缩放后 width 变化）', scaleChanged, `${host.width.toFixed(0)} → ${host2.width.toFixed(0)}px`);

  const marksBtn = btns.find((b) => b.id === 'marks');
  const marksPt = (() => {
    const x = host2.left + (marksBtn.x + marksBtn.w / 2) / host2.cw * host2.width;
    const y = host2.top + (marksBtn.y + marksBtn.h / 2) / host2.ch * host2.height;
    return { x, y };
  })();
  await cdp.click(marksPt.x, marksPt.y);
  const openScaled = await cdp.eval('(()=>window.__zhuoxian.panelsOpen())()');
  check('缩放 60% 后点「渊痕」按钮仍打开面板（坐标换算正确）', openScaled.includes('marks'), JSON.stringify(openScaled));

  // ── 7. 键盘路径没被破坏（同一条 activatePanel）──────────────────────
  await cdp.eval('(() => { const c = document.getElementById("stage"); c.style.width = ""; c.style.height = ""; return true; })()');
  await sleep(200);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyK', key: 'k', windowsVirtualKeyCode: 0 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyK', key: 'k', windowsVirtualKeyCode: 0 });
  await sleep(200);
  const openKey = await cdp.eval('(()=>window.__zhuoxian.panelsOpen())()');
  check('键盘 K 仍能开关图鉴（键盘与点击共用 activatePanel）', openKey.includes('codex'), JSON.stringify(openKey));
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyK', key: 'k', windowsVirtualKeyCode: 0 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyK', key: 'k', windowsVirtualKeyCode: 0 });
  await sleep(200);

  // ── 8. D137 锁层：键盘 L 真的接上了（单测已覆盖状态机，这里只验「键盘→钩子」这条线）──
  // 未解锁时 L 只打日志「尚未开定渊」，必须先把 diveLockUnlocked 置 true 才能测开关。
  const pressL = async () => {
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyL', key: 'l', windowsVirtualKeyCode: 0 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyL', key: 'l', windowsVirtualKeyCode: 0 });
    await sleep(220);
  };
  const lockBefore = await cdp.eval('(()=>window.__zhuoxian.diveLock())()');
  await pressL();
  const lockLocked = await cdp.eval('(()=>window.__zhuoxian.diveLock())()');
  check(
    '未开定渊时按 L 不生效（diveLock 保持关闭，钩子有门槛）',
    lockBefore.unlocked === false && lockLocked.active === false,
    `unlocked=${lockBefore.unlocked} active ${lockBefore.active}→${lockLocked.active}`,
  );

  await cdp.eval(`(() => {
    const z = window.__zhuoxian;
    z.session.character = { ...z.session.character, diveLockUnlocked: true };
    return z.setDiveLock(false);
  })()`);
  await pressL();
  const lockOn = await cdp.eval('(()=>window.__zhuoxian.diveLock())()');
  await pressL();
  const lockOff = await cdp.eval('(()=>window.__zhuoxian.diveLock())()');
  check(
    '解锁后键盘 L 真的开/关锁层（键盘→diveLock 钩子同源）',
    lockOn.active === true && lockOff.active === false,
    `开=${lockOn.active} → 关=${lockOff.active}`,
  );

  // 点一次让画面干净
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(SHOT, Buffer.from(shot.data, 'base64'));
  check('截图已写出', fs.existsSync(SHOT), SHOT);
  check('控制台零报错、零 4xx', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n结果：${passed}/${results.length}`);
  if (passed !== results.length) process.exitCode = 1;
} catch (e) {
  console.error('探针异常：', e);
  process.exitCode = 1;
} finally {
  try {
    ws?.close();
  } catch {
    /* ignore */
  }
  chrome.kill();
  await sleep(300);
  try {
    fs.rmSync(profile, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}
