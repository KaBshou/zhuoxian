/**
 * 音效（D181）真机探针。
 *
 * 这一条探针能证明什么、不能证明什么，必须写在最前面：
 * - **能证明**：设备里有音频引擎、它真的被调用了（played 增长）、静音开关走的是同一条路径、
 *   静音状态进了存档（刷新后还在）、按钮会高亮；
 * - **不能证明**「响没响」—— 无声卡/无声的 CI 里 AudioContext 一样能跑，
 *   耳朵才能判断好不好听。所以这里只钉「机制」，不钉「听感」。
 *
 * 判据纪律（D91.2）：数**结构像素**（按钮金色边框的条带），不数画面总金色 ——
 * HUD 里到处是金色，总数会把「按钮高亮」和「面板打开」混在一起。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const PORT = Number(process.env.PROBE_PORT ?? 9389);
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5292/';
const CHROME = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SHOT = process.argv[2] ?? 'docs/probe-audio.png';

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

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.errors = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.method === 'Runtime.exceptionThrown') this.errors.push(msg.params);
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') this.errors.push(msg.params);
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
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}

/** 按钮条里「sound」按钮那一格的边框像素（金色描边） */
async function soundButtonGold(cdp) {
  return evalJs(
    cdp,
    `(() => {
      const z = window.__zhuoxian;
      if (!z || typeof z.panelsOpen !== 'function') return { error: 'no-hook' };
      const c = document.getElementById('stage');
      const g = c.getContext('2d');
      const scale = c.width / z.viewport().logicalW;
      // 最后一个按钮就是「音效」（layout 顺序固定），从钩子拿几何，不写死坐标
      const bs = z.hudButtons();
      const b = bs[bs.length - 1];
      const d = g.getImageData(Math.round(b.x * scale), Math.round(b.y * scale), Math.round(b.w * scale), Math.round(b.h * scale)).data;
      let gold = 0;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], gg = d[i + 1], bb = d[i + 2];
        if (r > 150 && gg > 110 && bb < 120 && r - bb > 50) gold++;
      }
      return { id: b.id, gold };
    })()`,
  );
}

const profile = path.join(os.tmpdir(), `zx-audio-${Date.now()}`);
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
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=1280,720',
    'about:blank',
  ],
  { stdio: 'ignore', detached: false },
);

let cdp;
try {
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
  if (!wsUrl) throw new Error('CDP 起不来');
  cdp = await connect(wsUrl);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');

  // 清档 + 进游戏
  await cdp.send('Page.navigate', { url: `${BASE}?cls=yujian` });
  await sleep(2200);
  await evalJs(cdp, `localStorage.clear()`);
  await cdp.send('Page.reload');
  await sleep(2200);

  console.log('\n=== 音效（D181）真机 ===\n');

  const hooks = await evalJs(
    cdp,
    `(() => { const z = window.__zhuoxian; return { audio: typeof z?.audio, toggle: typeof z?.toggleSound }; })()`,
  );
  ok('调试钩子存在', hooks.audio === 'function' && hooks.toggle === 'function', JSON.stringify(hooks));

  const a0 = await evalJs(cdp, `window.__zhuoxian.audio()`);
  ok('新号默认不静音', a0.muted === false, JSON.stringify(a0));

  // 打 6 秒（真 tick，怪会死、会掉东西 ⇒ 一定有 cue）
  await sleep(6000);
  const a1 = await evalJs(cdp, `window.__zhuoxian.audio()`);
  ok('战斗里真的播了音效', a1.played > 0, `played=${a1.played}`);
  ok('没有音频异常', a1.failed === 0, `failed=${a1.failed}`);

  const goldBefore = await soundButtonGold(cdp);
  ok('按钮条最后一个按钮是「音效」', goldBefore.id === 'sound', JSON.stringify(goldBefore));

  // 按 V 关掉
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyV', key: 'v', windowsVirtualKeyCode: 86 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyV', key: 'v', windowsVirtualKeyCode: 86 });
  await sleep(400);

  const a2 = await evalJs(cdp, `window.__zhuoxian.audio()`);
  ok('按 V 能关静音（muted=true）', a2.muted === true, JSON.stringify(a2));
  const logHasMute = await evalJs(cdp, `window.__zhuoxian.session.log.some(l => l.text.includes('音效已关闭'))`);
  ok('关掉时有日志反馈', logHasMute === true);
  const savedMute = await evalJs(cdp, `(() => { const t = window.__zhuoxian.exportSaveText(); return t.includes('"muted": true'); })()`);
  ok('静音状态进了存档', savedMute === true);

  const goldMuted = await soundButtonGold(cdp);
  ok('静音时按钮高亮（金框变多）', goldMuted.gold > goldBefore.gold, `${goldBefore.gold} → ${goldMuted.gold}`);

  // 静音期间不该再累加
  const playedMutedStart = a2.played;
  await sleep(2500);
  const a3 = await evalJs(cdp, `window.__zhuoxian.audio()`);
  ok('静音期间不再播', a3.played === playedMutedStart, `${playedMutedStart} → ${a3.played}`);

  // 刷新后静音还在（读档恢复）
  await cdp.send('Page.reload');
  await sleep(2200);
  const a4 = await evalJs(cdp, `window.__zhuoxian.audio()`);
  ok('刷新后仍然是静音', a4.muted === true, JSON.stringify(a4));
  const charMuted = await evalJs(cdp, `window.__zhuoxian.session.character.muted`);
  ok('存档里的角色也记着静音', charMuted === true, String(charMuted));

  // 用钩子打开（同一条路径）
  const afterToggle = await evalJs(cdp, `window.__zhuoxian.toggleSound()`);
  ok('再切一次回到不静音', afterToggle === false, String(afterToggle));
  await sleep(2500);
  const a5 = await evalJs(cdp, `window.__zhuoxian.audio()`);
  ok('打开后继续播', a5.played > 0, `played=${a5.played}`);

  ok('控制台零报错', cdp.errors.length === 0, `${cdp.errors.length} 条`);

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(SHOT, Buffer.from(shot.data, 'base64'));
  console.log(`\n  截图：${path.resolve(SHOT)}`);
} finally {
  try {
    cdp?.ws.close();
  } catch {
    /* 忽略 */
  }
  chrome.kill();
  await sleep(300);
  fs.rmSync(profile, { recursive: true, force: true });
}

const total = pass + fail;
console.log(`\n=== ${pass}/${total} ===`);
process.exitCode = fail === 0 ? 0 : 1;
