/**
 * probe-save-backup —— D201 存档双写备份的真浏览器验收。
 *
 * 只验**机制**：备份键真的被写、主档被写坏时真的能回退、回退时真的告诉玩家。
 * 不验「玩家能不能看懂那句话」——那只能靠人读。
 *
 * 盘子契约（D184）：入口参数按「长什么样」认；横幅后必须打印 `结果：N/M`；红一项 exit 1。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ARGV = process.argv.slice(2);
const BASE =
  process.env.PROBE_URL ?? ARGV.find((a) => a.startsWith('http')) ?? 'http://127.0.0.1:5292/';
const SHOT =
  process.env.PROBE_SHOT ??
  ARGV.find((a) => a.endsWith('.png')) ??
  path.join(process.cwd(), 'docs', 'probe-save-backup.png');
const PORT = Number(process.env.PROBE_CDP_PORT ?? 9395);
const CHROME =
  process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SAVE_KEY = 'zhuoxian.save.v1';
const BACKUP_KEY = 'zhuoxian.save.v1.bak';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0;
let fail = 0;
const lines = [];
function check(name, ok, detail = '') {
  if (ok) {
    pass += 1;
    lines.push(`  ✓ ${name}${detail ? ` · ${detail}` : ''}`);
  } else {
    fail += 1;
    lines.push(`  × ${name}${detail ? ` · ${detail}` : ''}`);
  }
}

const profile = path.join(
  process.env.TEMP ?? process.env.TMP ?? '.',
  `probe-backup-${process.pid}`,
);
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--window-size=1280,720',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

async function targets() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      /* 还没起来 */
    }
    await sleep(250);
  }
  throw new Error('chrome 没起来');
}

function connect(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
      return;
    }
    events.push(msg);
  });
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve());
    ws.addEventListener('error', (e) => reject(e));
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      id += 1;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  return { ws, send, ready, events };
}

async function evaluate(send, expression) {
  const r = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  });
  return r?.result?.value;
}

async function main() {
  const url = await targets();
  const { send, ready, events, ws } = connect(url);
  await ready;
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const go = async () => {
    await send('Page.navigate', { url: `${BASE}?cls=yujian` });
    for (let i = 0; i < 60; i += 1) {
      await sleep(300);
      const ok = await evaluate(
        send,
        'Boolean(window.__zhuoxian && window.__zhuoxian.session)',
      ).catch(() => false);
      if (ok) return true;
    }
    return false;
  };

  check('钩子存在（能读到 session）', await go());

  // 1) 第一次保存：主档有、备份没有。
  await evaluate(send, "localStorage.removeItem('zhuoxian.save.v1'); localStorage.removeItem('zhuoxian.save.v1.bak'); window.__zhuoxian.save()");
  await sleep(300);
  const first = await evaluate(
    send,
    `({ main: Boolean(localStorage.getItem('${SAVE_KEY}')), bak: Boolean(localStorage.getItem('${BACKUP_KEY}')) })`,
  );
  check('第一次保存只写主档（不写空备份）', first?.main === true && first?.bak === false,
    `main=${String(first?.main)} bak=${String(first?.bak)}`);

  // 2) 第二次保存：备份 = 上一份主档。
  await sleep(350);
  await evaluate(send, 'window.__zhuoxian.save()');
  await sleep(350);
  const second = await evaluate(
    send,
    `({ main: Boolean(localStorage.getItem('${SAVE_KEY}')), bak: Boolean(localStorage.getItem('${BACKUP_KEY}')), bakLen: (localStorage.getItem('${BACKUP_KEY}') ?? '').length })`,
  );
  check('第二次保存产生备份', second?.bak === true && (second?.bakLen ?? 0) > 100,
    `bakLen=${String(second?.bakLen)}`);

  // 3) 崩溃场景：主档坏了，但**没有离场 flush**（真崩溃时不会有）。
  //    这里不能靠 reload 模拟 —— 页面离开会触发 pagehide → flush，把好的内存会话写回主档，
  //    坏档当场被治好了，就测不到 fallback（第一版就是这么假绿的）。
  //    所以直接走「下次启动会走的那个读档入口」：`autosaver.load()`。
  await evaluate(send, `localStorage.setItem('${SAVE_KEY}', '{"version": 999, broken')`);
  const recoveredFromLoad = await evaluate(
    send,
    "(() => { const r = window.__zhuoxian.autosaver.load(); return r ? { ok: true, restored: r.restoredFromBackup === true } : { ok: false, restored: false }; })()",
  );
  check('主档坏 + 无 flush 时，读档能从备份恢复', recoveredFromLoad?.ok === true && recoveredFromLoad?.restored === true,
    JSON.stringify(recoveredFromLoad ?? null));

  // 4) 坏档没被自动删（玩家还能导出它，至少能亲眼确认坏了）。
  const stillBroken = await evaluate(send, `localStorage.getItem('${SAVE_KEY}')`);
  check('坏档没有被悄悄删掉', typeof stillBroken === 'string' && stillBroken.includes('broken'));

  // 5) 之后自动存档把主档恢复成合法 JSON。
  await evaluate(send, 'window.__zhuoxian.save()');
  await sleep(350);
  const repaired = await evaluate(send, `localStorage.getItem('${SAVE_KEY}')`);
  let ok = false;
  try {
    // `.mjs` 里不能写 TS 断言（`as string` 会让整个文件 SyntaxError，且报错落在这一行）。
    const parsedRepaired = typeof repaired === 'string' ? JSON.parse(repaired) : null;
    ok = Boolean(parsedRepaired && Number(parsedRepaired.version) >= 1);
  } catch {
    ok = false;
  }
  check('再存一次主档恢复为合法存档', ok, ok ? '' : String(repaired ?? '').slice(0, 40));

  // 7) 控制台干净。
  const errs = events.filter((e) => {
    if (e.method !== 'Log.entryAdded') return false;
    const lvl = e.params?.entry?.level;
    const text = String(e.params?.entry?.text ?? '');
    if (lvl !== 'error') return false;
    return !text.includes('favicon');
  });
  check('控制台零报错', errs.length === 0,
    errs.map((e) => e.params?.entry?.text).slice(0, 2).join(' / '));

  // 截图
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync(path.dirname(SHOT), { recursive: true });
  fs.writeFileSync(SHOT, Buffer.from(shot.data, 'base64'));

  ws.close();
  chrome.kill();
  await sleep(300);

  console.log(lines.join('\n'));
  console.log(`\n截图：${SHOT}`);
  console.log(`\n结果：${pass}/${pass + fail}`);
  process.exitCode = fail === 0 ? 0 : 1;
}

main().catch((e) => {
  console.log(lines.join('\n'));
  console.error(`\n探针本身炸了：${e?.message ?? e}`);
  chrome.kill();
  process.exit(1);
});
