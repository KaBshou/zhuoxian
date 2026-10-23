/**
 * 五行碎片探针（D104）：F 键循环定向 / M 面板真的画了碎片行 / 镇守必掉 1 颗 / 碎片不混进 pocket。
 *
 * 为什么必须存在：
 *   `tests/fragments.test.ts` 是纯函数单测（addFragments / sanitizeFragments / fragmentElementForBoss），
 *   证明不了「F 键真的接上了」「面板真的把余额画出来了」「真打死的镇守真的发了一颗」。
 *   这个项目已经踩过三次「纯函数全绿、按键没接 / 面板没画」的坑（图鉴、技能面板、M 面板 Escape）。
 *
 * 判据纪律：
 * 1. **只用钩子，不抄常量**：余额与定向读 `__zhuoxian.fragments()`，元素→层映射读
 *    `src/data/fragments.ts` 的导出函数（页面内动态 import），探针里不出现 28 / 3 这类魔数。
 * 2. **面板几何不写死**：D104 给 marks 面板加了 `FRAG_ROW_H=22` 的碎片行，未来还会动。
 *    所以面板矩形是**扫出来的**：左缘那条 3px 金竖条在整列上连续上百像素，用它的列号定 x0、
 *    用它的上下端定 y0/y1；碎片行拿「面板底部 30px」这条带，靠**改余额看像素变化**来证明绑定。
 * 3. **场景自己造**：余额先显式置 0/3/5/7，不依赖新号默认值（marks 探针那条教训）。
 * 4. **只读面板不拦键位**：D90 的纪律 —— 面板开着时 F 仍应改定向（F 是全局键位，不是面板内键）。
 * 5. 干净 server：`tools/_serve.mjs` 是 `watch: null`，改源码不热更新，跑前必须重起 server。
 *
 * 已知坑（2026-10-23，前四份探针踩过，这里一律复用）：
 * - CDP 端口独占：上一轮 chrome 没退会连到旧页面（症状「钩子不是函数」）；
 * - `Runtime.evaluate` 在 reload 期可能永不 resolve ⇒ 所有 eval 都套 Promise.race 超时；
 * - 米白/金色像素不要跨「开/关面板」对比（HUD 自己也有），只看面板矩形内的差分；
 * - `Page.captureScreenshot` 的返回已是 result，别再取 `.result`。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9365;
const BASE_URL = process.env.PROBE_URL ?? process.argv[2] ?? 'http://127.0.0.1:5288/';
const PROBE_CLASS = process.env.PROBE_CLASS ?? 'yujian';
const URL = BASE_URL.includes('cls=')
  ? BASE_URL
  : `${BASE_URL}${BASE_URL.includes('?') ? '&' : '?'}cls=${PROBE_CLASS}`;
const SHOT = process.argv[3] ?? 'F:\\dsh-work\\zhuoxian\\docs\\probe-fragments.png';

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `　—　${detail}` : ''}`);
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
  send(method, params = {}, timeoutMs = 240000) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method} 超时 ${timeoutMs}ms（reload 期常见）`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
    });
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
  async key(code, keyName, keyCode = 0) {
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      code,
      key: keyName,
      windowsVirtualKeyCode: keyCode,
    });
    await sleep(40);
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      code,
      key: keyName,
      windowsVirtualKeyCode: keyCode,
    });
    await sleep(180);
  }
}

/**
 * 扫面板矩形 + 底部碎片行的指纹。
 * - 先找「左边金竖条」：整列金色像素 ≥100 且连续 ⇒ 那条 3px 竖条；
 * - 碎片行 = 竖条最低端往上 30px 的横带（D104 把它插在底部分隔线之前）；
 * - 指纹只取这两块，跟 HUD 无关。
 */
const FINGERPRINT = `(() => {
  const c = document.getElementById('stage');
  const ctx = c.getContext('2d');
  const W = c.width, H = c.height;
  const all = ctx.getImageData(0, 0, W, H).data;
  const isGold = (r, g, b) => r > 150 && g > 110 && r - b > 55 && b < 175;
  const colGold = new Array(W).fill(0);
  const colTop = new Array(W).fill(-1);
  const colBot = new Array(W).fill(-1);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (isGold(all[i], all[i + 1], all[i + 2])) {
        colGold[x]++;
        if (colTop[x] < 0) colTop[x] = y;
        colBot[x] = y;
      }
    }
  }
  // 竖条：找金色像素最多的那一列（面板左缘 3px 竖条 = 整列几乎全金）
  let bx = -1, best = 0;
  for (let x = 0; x < W; x++) if (colGold[x] > best) { best = colGold[x]; bx = x; }
  const panel = { found: bx >= 0 && best >= 80, x: bx, y0: colTop[bx], y1: colBot[bx], height: best };
  let sum = 0, n = 0;
  for (let i = 0; i < all.length; i += 4) { sum += all[i] * 0.299 + all[i + 1] * 0.587 + all[i + 2] * 0.114; n++; }
  const mean = sum / n;
  if (!panel.found) return { panel, mean, stripes: [], rows: [] };
  // 面板高度 = 竖条高度（bar 是 fillRect(x, y, 3, h)，h 就是面板高）。
  // 把面板横向切成 8 条，逐条数「米白文字像素」：余额从 0/0/0 变 3/5/7 时，
  // **只有碎片那一行的条**会变（标题/价目/页脚都是同一个 marks 值，不受影响）。
  const px = 520;
  const stripes = new Array(8).fill(0);
  const stripeH = Math.max(1, Math.round(panel.height / 8));
  const rectX = Math.min(bx, W - px);
  for (let s = 0; s < 8; s++) {
    const sy = panel.y0 + s * stripeH;
    const sh = Math.min(stripeH, H - sy);
    if (sh <= 0) continue;
    const sd = ctx.getImageData(rectX, sy, px, sh).data;
    let pale = 0;
    for (let i = 0; i < sd.length; i += 4) {
      const r = sd[i], g = sd[i + 1], b = sd[i + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (mn > 150 && mx - mn < 50) pale++;
    }
    stripes[s] = pale;
  }
  return { panel, mean, stripes, rect: { x: rectX, w: px, stripeH } };
})()`;

const profile = `${process.env.TEMP}\\probe-fragments-${Date.now()}`;
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
  if (!target) throw new Error('CDP 没起来（9365 被占用？先杀掉残留 chrome）');

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

  // 真清档：走 reset()（localStorage.clear()+reload 会被离场 flush 写回旧档）
  await cdp.send('Page.navigate', { url: URL });
  await sleep(1800);
  await cdp.eval('(()=>{window.__zhuoxian?.reset();return true})()');
  await sleep(2500);

  const waitFor = async (expr, ms = 25000, step = 250) => {
    const t0 = Date.now();
    for (;;) {
      try {
        if (await cdp.eval(expr)) return true;
      } catch {
        /* reload 中 */
      }
      if (Date.now() - t0 > ms) return false;
      await sleep(step);
    }
  };

  const hooked = await waitFor(
    'Boolean(window.__zhuoxian && typeof window.__zhuoxian.fragments === "function" && window.__zhuoxian.session)',
  );
  check('钩子存在（fragments()/setFragmentAim()，未新增产品侧钩子）', hooked);
  if (!hooked) throw new Error('no hook');

  const phase = await cdp.eval('window.__zhuoxian.phase');
  check('已在 play 阶段（?cls= 直达，不是卡在选道统）', phase === 'play', `phase=${phase}`);

  const shape = await cdp.eval(`(() => {
    const f = window.__zhuoxian.fragments();
    const keys = Object.keys(f).sort().join(',');
    const nums = [f.metal, f.fire, f.water].every((v) => typeof v === 'number' && v >= 0);
    const aimsOk = f.aim === null || ['metal', 'fire', 'water'].includes(f.aim);
    return { keys, nums, aimsOk, f };
  })()`);
  check(
    'fragments() 形状正确（metal/fire/water 非负数字 + aim ∈ null|metal|fire|water）',
    shape.keys === 'aim,fire,metal,water' && shape.nums && shape.aimsOk,
    shape.keys + ' · aim=' + JSON.stringify(shape.f.aim),
  );

  // ── A. F 键循环：null → 金 → 火 → 水 → null（定向是手动工具，自动挑就退化） ──
  await cdp.eval('(()=>{window.__zhuoxian.setFragmentAim(null);return true})()');
  await sleep(150);
  const aimSeq = [await cdp.eval('window.__zhuoxian.fragments().aim')];
  for (let i = 0; i < 4; i++) {
    await cdp.key('KeyF', 'f', 70);
    aimSeq.push(await cdp.eval('window.__zhuoxian.fragments().aim'));
  }
  check(
    'F 键定向循环：null → metal → fire → water → null',
    JSON.stringify(aimSeq) === JSON.stringify([null, 'metal', 'fire', 'water', null]),
    aimSeq.map((a) => a ?? 'null').join(' → '),
  );

  const noSpend = await cdp.eval(`(async () => {
    const z = window.__zhuoxian;
    z.session.character.fragments = { metal: 7, fire: 8, water: 9 };
    z.setFragmentAim(null);
    const before = z.fragments();
    return before;
  })()`);
  await cdp.key('KeyF', 'f', 70);
  await cdp.key('KeyF', 'f', 70);
  const afterF = await cdp.eval('window.__zhuoxian.fragments()');
  check(
    'F 只改定向、不动余额（定向本身不消耗碎片，消耗发生在添灵纹）',
    afterF.metal === noSpend.metal && afterF.fire === noSpend.fire && afterF.water === noSpend.water,
    `金 ${noSpend.metal}→${afterF.metal} · 火 ${noSpend.fire}→${afterF.fire} · 水 ${noSpend.water}→${afterF.water}`,
  );

  // ── B. M 面板真的把碎片行画出来（改余额 ⇒ 底部横带像素必须变） ──
  const setFrags = (m, f, w) =>
    cdp.eval(`(()=>{window.__zhuoxian.session.character.fragments={metal:${m},fire:${f},water:${w}};return true})()`);

  await setFrags(0, 0, 0);
  await sleep(250);
  const closedFp = await cdp.eval(FINGERPRINT);
  await cdp.key('KeyM', 'm');
  await sleep(450);
  const openZero = await cdp.eval(FINGERPRINT);
  check(
    '按 M 打开面板（全屏压暗；面板矩形靠左缘金竖条扫出来，不写死几何）',
    closedFp.mean !== undefined && openZero.mean < closedFp.mean - 2 && openZero.panel.found,
    `亮度 ${closedFp.mean?.toFixed(1)} → ${openZero.mean?.toFixed(1)} · 竖条列 ${openZero.panel.x} 高 ${openZero.panel.height}px`,
  );

  await setFrags(3, 5, 7);
  await sleep(350);
  const openRich = await cdp.eval(FINGERPRINT);
  // 余额从「金0火0水0」变成「金3火5水7」：碎片那行的米白像素数会变，而标题/价目/页脚
  // 用的是同一个 marks 值（没动）⇒ 差异必须落在碎片行所在的条上，前面的条必须原样。
  const stripeDiff = (openRich.stripes ?? []).map((v, i) => v - (openZero.stripes?.[i] ?? 0));
  // 阈值 2：12px 字体下 "0" → "3/5/7" 只改动个位数像素（实测 +3/+3），用 5 会假红；
  // 噪声侧由「标题 3 条必须 ≤1」兜住（同一个 marks 值，理论上 0 变化）。
  const changedRows = stripeDiff.map((d, i) => (Math.abs(d) >= 2 ? i : -1)).filter((i) => i >= 3 && i <= 7);
  const headStable = stripeDiff.slice(0, 3).every((d) => Math.abs(d) <= 1);
  check(
    '面板碎片行随余额变化（0/0/0 → 3/5/7 时只有碎片那行的像素变）',
    changedRows.length >= 1 && headStable,
    `逐条米白增量 [${stripeDiff.join(', ')}]（变化条 ${changedRows.join('/') || '无'}；标题 3 条须稳定）`,
  );
  check(
    '碎片行确实用米白文字（不是纯装饰条）',
    Math.max(...(openRich.stripes ?? [0]).slice(3, 7)) >= 10,
    `碎片行所在条最大米白 ${Math.max(...(openRich.stripes ?? [0]).slice(3, 7))} 像素（条高 ${openRich.rect?.stripeH}px）`,
  );

  // 面板开着时 F 仍生效（只读面板不拦全局键位，D90 纪律）
  await cdp.eval('(()=>{window.__zhuoxian.setFragmentAim(null);return true})()');
  await cdp.key('KeyF', 'f', 70);
  const aimWithPanel = await cdp.eval('window.__zhuoxian.fragments().aim');
  check('面板开着时 F 仍改定向（只读面板不拦键位）', aimWithPanel === 'metal', `aim=${aimWithPanel}`);
  await cdp.key('KeyM', 'm');
  await sleep(300);

  // ── C. 真打死一只镇守 ⇒ 金行碎片 +1（走真 session 的击杀派发，不直接调 addFragments） ──
  const beforeKill = await cdp.eval(
    '(()=>{const z=window.__zhuoxian; z.session.character.fragments={metal:0,fire:0,water:0}; return {f:z.fragments(), floor:z.session.floor, kills:z.session.kills};})()',
  );
  const killed = await cdp.eval(`(async () => {
    const z = window.__zhuoxian;
    const s = z.session;
    const battle = await import('/src/core/battle.ts');
    const monsters = await import('/src/data/monsters.ts');
    const boss = monsters.bossOfTier(1);
    if (!boss) return { ok: false, why: 'bossOfTier(1) 为空' };
    const p = s.battle.player;
    const uid = 900000 + Math.floor(Math.random() * 1000);
    // 放在玩家射程内 + 1 血：让真战斗循环自己补最后一刀，碎片才会走 kill 派发
    const m = battle.spawnMonster(boss, s.floor, uid, p.x + 20, p.y, 'boss', []);
    m.hp = 1;
    s.battle.monsters.push(m);
    return { ok: true, hp: m.hp, floor: s.floor, x: m.x, y: m.y, uid };
  })()`);
  check('能在真 session 里造一只 1 血镇守（走 spawnMonster，不伪造击杀）', killed?.ok === true, JSON.stringify(killed).slice(0, 120));

  const gotFrag = await waitFor('window.__zhuoxian.fragments().metal >= 1', 15000);
  const afterKill = await cdp.eval('(()=>{const z=window.__zhuoxian; return {f:z.fragments(), kills:z.session.kills};})()');
  check(
    '镇守必掉 1 颗碎片（层 1 镇守 ⇒ 金行，走真击杀派发）',
    gotFrag && afterKill.f.metal === 1 && afterKill.f.fire === 0 && afterKill.f.water === 0,
    `金 ${beforeKill.f.metal} → ${afterKill.f.metal}（火 ${afterKill.f.fire} / 水 ${afterKill.f.water}）· 击杀 ${beforeKill.kills} → ${afterKill.kills}`,
  );

  // ── D. 元素→层映射（读 src 的导出函数，探针里不写 28/3 这类魔数） ──
  const mapping = await cdp.eval(`(async () => {
    const f = await import('/src/data/fragments.ts');
    const rows = [[1,1],[9,1],[10,2],[18,2],[19,3],[27,3],[28,3],[29,3],[30,3],[46,3]]
      .map(([floor, tier]) => [floor, f.fragmentElementForBoss(floor, tier)]);
    return { rows, cap: f.FRAGMENT_CAP, mul: f.FRAGMENT_WEIGHT_MUL, term: f.FRAGMENT_TERM };
  })()`);
  const expectRows = mapping.rows.map(([floor]) => (floor <= 9 ? 'metal' : floor <= 18 ? 'fire' : floor <= 27 ? 'water' : ['metal', 'fire', 'water'][(floor - 28) % 3]));
  const mapOk = JSON.stringify(mapping.rows.map((r) => r[1])) === JSON.stringify(expectRows);
  check(
    '元素映射：主线按阶（1~9 金 / 10~18 火 / 19~27 水）、无尽按 (floor-28)%3 轮转',
    mapOk,
    mapping.rows.map(([f2, e]) => `${f2}:${e}`).join(' '),
  );
  check(
    '碎片走独立槽：不写进 pocket（pocket 只有 huang/mie/xi 三种通货）',
    (() => true)() && JSON.stringify(await cdp.eval('Object.keys(window.__zhuoxian.session.pocket).sort()')) === JSON.stringify(['huang', 'mie', 'xi']),
    'pocket keys=' + JSON.stringify(await cdp.eval('Object.keys(window.__zhuoxian.session.pocket).sort()')),
  );

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(SHOT, Buffer.from(shot.data, 'base64'));

  check('控制台无报错', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | ') || 'ok');
} catch (e) {
  check('探针自身没崩', false, String(e).slice(0, 200));
} finally {
  try {
    ws?.close();
  } catch {
    /* 忽略 */
  }
  chrome.kill();
  await sleep(400);
  fs.rmSync(profile, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.pass);
console.log(`\n结果：${results.length - failed.length}/${results.length} 通过   截图：${SHOT}`);
if (failed.length) {
  console.log('失败项：' + failed.map((f) => f.name).join(' | '));
  process.exitCode = 1;
}
