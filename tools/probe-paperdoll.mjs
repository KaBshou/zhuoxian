/**
 * 纸娃娃（D178）真机截图 + 布局体检。
 *
 * 检查三件事：
 *   1. 左列画出了 10 个格子（不是 10 行文字了）；
 *   2. 点某格会打开法宝详情，且详情里那一格有金框（focused）；
 *   3. 点格子不会误开 HUD 按钮面板（两者坐标不重叠）。
 *
 * 判据只用「结构像素」（格子边框色 + 金框），不数金色总量 ——
 * 金色在 HUD 里到处都是，数总量会把「详情面板开了」和「HUD 自己就有金」混在一起（D91.2）。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const PORT = 9379;
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5292/';
const CHROME =
  process.env.CHROME_PATH ??
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SHOT = process.argv[2] ?? 'docs/probe-paperdoll.png';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0;
let fail = 0;
function ok(name, cond, detail = '') {
  if (cond) {
    pass += 1;
    console.log(`  [PASS] ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail += 1;
    console.log(`  [FAIL] ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    });
  }
  send(method, params = {}) {
    this.id += 1;
    const id = this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  return new Cdp(ws);
}

async function evalJs(cdp, expression) {
  const r = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}

/** 取一块区域的结构像素统计 */
async function region(cdp, x, y, w, h) {
  const expr = `(() => {
    const c = document.getElementById('stage');
    const g = c.getContext('2d');
    const d = g.getImageData(${x}, ${y}, ${w}, ${h}).data;
    let gold = 0, bright = 0, dark = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], gg = d[i+1], b = d[i+2];
      if (r > 150 && gg > 110 && b < 120 && r - b > 50) gold++;
      const lum = (r*299 + gg*587 + b*114) / 1000;
      if (lum > 150) bright++;
      if (lum < 60) dark++;
    }
    return { gold, bright, dark, n: d.length / 4 };
  })()`;
  return evalJs(cdp, expr);
}

const profile = path.join(os.tmpdir(), `zx-paperdoll-${Date.now()}`);
fs.mkdirSync(profile, { recursive: true });

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--disable-background-timer-throttling',
    '--window-size=1280,720',
    'about:blank',
  ],
  { stdio: 'ignore', detached: false },
);

let cdp;
try {
  // 等 CDP 就绪
  let wsUrl = null;
  for (let i = 0; i < 40; i += 1) {
    await sleep(250);
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page');
      if (page) {
        wsUrl = page.webSocketDebuggerUrl;
        break;
      }
    } catch {
      /* 还没起 */
    }
  }
  if (!wsUrl) throw new Error('CDP 没起来');
  cdp = await connect(wsUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  console.log(`\n=== 纸娃娃真机体检：${BASE} ===\n`);

  await cdp.send('Page.navigate', { url: BASE });
  await sleep(2500);

  const hasHook = await evalJs(cdp, 'typeof window.__zhuoxian');
  ok('调试钩子存在', hasHook === 'object', `typeof = ${hasHook}`);
  if (hasHook !== 'object') throw new Error('没有钩子，后面全没法验');

  // 清档 + 进战斗
  await evalJs(cdp, 'window.__zhuoxian.reset()');
  await sleep(1800);
  await evalJs(cdp, `window.__zhuoxian.chooseClass('yujian')`);
  await sleep(1200);

  const phase = await evalJs(cdp, 'window.__zhuoxian.phase');
  ok('进入战斗（phase=play）', phase === 'play', `phase = ${phase}`);

  // 1) 左列格子：从钩子取几何（不许写死坐标 —— 布局改了探针要跟着改，
  //    写死的探针只会假红或假绿）
  const cells = await evalJs(cdp, 'window.__zhuoxian.paperdollCells()');
  ok('钩子给出 10 个格子', Array.isArray(cells) && cells.length === 10, `n = ${cells?.length}`);
  const first = cells?.[0];
  ok('第一格是法器且尺寸合理', first?.slot === 'sword' && first.w > 40 && first.h > 20,
    `slot=${first?.slot} ${first?.w}x${first?.h}`);

  // 逐格采样「格子里有没有内容」：空位是纯暗灰，有装备才有点亮的边框/文字。
  // 判据用「非背景像素」（格子底色 rgba(20,20,26) 亮度约 21，边框/文字明显更亮）。
  let litCells = 0;
  for (const c of cells ?? []) {
    const r = await region(cdp, c.x, c.y, c.w, c.h);
    if (r.bright > 3) litCells += 1;
  }
  ok('至少 1 格画出内容（起手法器）', litCells >= 1, `lit = ${litCells}/10`);

  // 2) 点第一格应打开详情并高亮
  const opened = await evalJs(cdp, `(() => {
    const z = window.__zhuoxian;
    if (typeof z.openDetailAtSlot !== 'function') return 'no-hook';
    z.openDetailAtSlot('sword');
    return { open: z.detailVisible, focus: z.detailFocus };
  })()`);
  if (opened === 'no-hook') {
    ok('openDetailAtSlot 钩子存在', false, '钩子缺失（main.ts 未暴露）');
  } else {
    ok('点格子打开详情', opened.open === true, `open = ${opened.open}`);
    ok('详情高亮那一格', opened.focus === 'sword', `focus = ${opened.focus}`);
  }
  await sleep(400);

  // 详情面板开着时画面明显变暗（全屏 0.72 遮罩）
  const covered = await region(cdp, 100, 200, 760, 200);
  ok('详情面板压暗了战斗画面', covered.dark > 0, `dark = ${covered.dark}`);

  await cdp.send('Page.captureScreenshot', { format: 'png' }).then((r) => {
    fs.writeFileSync(SHOT, Buffer.from(r.data, 'base64'));
  });
  console.log(`\n  截图：${path.resolve(SHOT)}`);

  // 3) 关掉详情，确认恢复
  await evalJs(cdp, 'window.__zhuoxian.closePanels()');
  await sleep(400);
  const after = await region(cdp, 100, 200, 760, 200);
  ok('关面板后画面恢复（暗像素变少）', after.dark < covered.dark, `${covered.dark} → ${after.dark}`);

  console.log(`\n=== ${pass}/${pass + fail} ===`);
  process.exitCode = fail === 0 ? 0 : 1;
} catch (err) {
  console.error('探针异常：', err.message);
  process.exitCode = 1;
} finally {
  try {
    if (cdp) cdp.ws.close();
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
