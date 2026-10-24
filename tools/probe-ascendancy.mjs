/**
 * D209 浊气觉醒 · 真浏览器验收（CDP 9397）。
 *
 * 为什么必须有一条真浏览器探针：
 * `tests/ascendancy.test.ts` 测的是「session 里会解锁」，而这一整块曾经的问题是
 * **纯函数存在、接线为零**（D207 同族）。纯函数测试永远发现不了「没人调用它」。
 * 这条探针走玩家路径：把层推到 9、清掉镇守波，然后看钩子里的 id 有没有变。
 *
 * 用法：
 *   node tools\probe-ascendancy.mjs
 *   $env:PROBE_URL='http://127.0.0.1:5292/'; node tools\probe-ascendancy.mjs
 *
 * 纪律：
 *   - 坐标/数字一律从钩子取，不写死。
 *   - 判「画出来了」按最小可见量给阈值（D208 教训）。
 *   - 改完 src/ 必须重启 server（`_serve.mjs` 是 watch:null）。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ARGV = process.argv.slice(2);
const BASE =
  process.env.PROBE_URL ?? process.env.BASE_URL ?? ARGV.find((a) => a.startsWith('http')) ?? 'http://127.0.0.1:5292/';
const SHOT = process.env.PROBE_SHOT ?? ARGV.find((a) => a.endsWith('.png')) ?? 'F:/dsh-work/zhuoxian/docs/probe-ascendancy.png';
const PORT = Number(process.env.PROBE_PORT ?? 9397);
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

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

const profile = path.join(os.tmpdir(), `zx-asc-${Date.now()}`);
fs.mkdirSync(profile, { recursive: true });
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--window-size=1280,720',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

let ws;
let msgId = 0;
const pending = new Map();
function send(method, params = {}) {
  msgId += 1;
  const id = msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => {
    pending.set(id, { res, rej });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        rej(new Error(`CDP timeout ${method}`));
      }
    }, 30000);
  });
}
async function ev(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { __err: r.exceptionDetails.exception?.description ?? r.exceptionDetails.text };
  return r.result?.value;
}

const errors = [];

async function main() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        break;
      }
    } catch {
      /* retry */
    }
    await sleep(250);
  }
  if (!ws) throw new Error('chrome 没起来');
  await new Promise((r) => ws.addEventListener('open', r));
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) p.rej(new Error(m.error.message));
      else p.res(m.result);
      return;
    }
    if (m.method === 'Runtime.exceptionThrown') {
      errors.push(m.params.exceptionDetails?.text ?? 'exception');
    }
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      const t = m.params.entry.text ?? '';
      if (!/favicon/i.test(t)) errors.push(t);
    }
  });

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Log.enable');

  const url = BASE.includes('?') ? `${BASE}&cls=yujian` : `${BASE}?cls=yujian`;
  await send('Page.navigate', { url });
  await sleep(1500);

  let ready = false;
  for (let i = 0; i < 40; i += 1) {
    const r = await ev('!!(window.__zhuoxian && window.__zhuoxian.ascendancy)');
    if (r === true) {
      ready = true;
      break;
    }
    await sleep(300);
  }
  ok('调试钩子存在（ascendancy）', ready);
  if (!ready) return;

  const a0 = await ev('window.__zhuoxian.ascendancy()');
  ok('新号未觉醒', a0 && a0.id === null, JSON.stringify(a0));
  ok('门槛是第 9 层', a0 && a0.unlockFloor === 9, String(a0 && a0.unlockFloor));
  ok('新号 ready=false', a0 && a0.ready === false);

  // 构造「第 9 层的镇守波已经打完」：下潜条件是 `wave % BOSS_EVERY === 0`，
  // 所以 wave 必须正好是 10（第 10 波 = 镇守波），monsters 清空即 isCleared。
  // 第一版写 wave = 9 ⇒ 只会开第 10 波（刷出镇守），永远不下潜 ⇒ 觉醒不触发。
  const setup = await ev(`(() => {
    const s = window.__zhuoxian.session;
    s.floor = 9;
    s.maxFloorReached = 9;
    s.firstClearedFloors = [];
    s.wave = 10;
    s.battle.monsters = [];
    s.battle.reviveCooldown = 0;
    s.battle.deathCleanup = false;
    return { floor: s.floor, wave: s.wave, asc: s.character.ascendancyId };
  })()`);
  ok('构造出「第 9 层镇守波已清」的现场', setup && setup.floor === 9 && setup.wave === 10 && setup.asc === null, JSON.stringify(setup));

  let a1 = null;
  for (let i = 0; i < 80; i += 1) {
    await sleep(250);
    a1 = await ev('window.__zhuoxian.ascendancy()');
    if (a1 && a1.id !== null) break;
  }
  ok('打完第 9 层后真的觉醒了', a1 && a1.id !== null, JSON.stringify(a1));
  ok('觉醒名与本道统一致（御剑堂 → 浊剑）', a1 && a1.name === '浊剑', a1 ? String(a1.name) : 'null');
  ok('觉醒后 ready 回到 false（不重复触发）', a1 && a1.ready === false);

  const stats = await ev(`(() => {
    const s = window.__zhuoxian.session;
    return { asc: s.character.ascendancyId, mods: s.battle.player.modifiers.length };
  })()`);
  ok('角色身上带 ascendancyId', stats && stats.asc !== null, String(stats && stats.asc));
  ok('战斗态修正器非空（觉醒进了管线）', stats && stats.mods > 0, String(stats && stats.mods));

  const closed = await ev('(() => { window.__zhuoxian.closePanels(); return window.__zhuoxian.statsVisible; })()');
  ok('统计面板默认关闭', closed === false);

  await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyY', key: 'y', windowsVirtualKeyCode: 89 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyY', key: 'y', windowsVirtualKeyCode: 89 });
  await sleep(500);
  const statsOpen = await ev('window.__zhuoxian.statsVisible');
  ok('按 Y 能打开统计面板（觉醒那一行在里面）', statsOpen === true, String(statsOpen));

  await ev('window.__zhuoxian.closePanels()');
  await sleep(200);

  try {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(SHOT, Buffer.from(shot.data, 'base64'));
    ok('截图已保存', fs.existsSync(SHOT), SHOT);
  } catch (e) {
    ok('截图已保存', false, String(e));
  }

  ok('控制台零报错', errors.length === 0, errors.slice(0, 3).join(' | '));
}

main()
  .catch((e) => {
    console.error(e);
    fail += 1;
  })
  .finally(async () => {
    console.log(`\n=== ${pass}/${pass + fail} ===`);
    console.log(`结果：${pass}/${pass + fail}`);
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
    await sleep(300);
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    process.exit(fail === 0 ? 0 : 1);
  });
