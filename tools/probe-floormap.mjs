/**
 * 秘境图真机探针（D185）。
 *
 * 为什么这条必须有：
 *   76 层的「回刷」以前只有 `←` `→` 两个键（从第 76 层回第 3 层要按 73 次 = 等于没有回刷）。
 *   面板做出来之后，唯一能证明它可用的是**真点一下、层号真的变了** —— 几何/命中/跳层
 *   三处任何一处写错都不会报错，只会让玩家觉得「点了没反应」或「点了跳错层」。
 *
 * 判据纪律：
 * - 格子几何从 `floorMapCells()` 读，**不许写死坐标**（布局一改，写死的探针只会假红）；
 * - 跳层结果读 `session.floor`，不信日志；
 * - 面板「画出来了」用**左缘 3px 金条**这种结构像素判，不数金色文字（文字颜色会随状态变）。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const PORT = Number(process.env.PROBE_CDP_PORT ?? 9390);
const ARGV = process.argv.slice(2);
const BASE_URL =
  process.env.PROBE_URL ?? ARGV.find((a) => a.startsWith('http')) ?? 'http://127.0.0.1:5292/';
const SHOT =
  process.env.PROBE_SHOT ??
  ARGV.find((a) => a.endsWith('.png')) ??
  'F:\\dsh-work\\zhuoxian\\docs\\probe-floormap.png';
const CHROME =
  process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

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
    this.errors = [];
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (m.error) reject(new Error(JSON.stringify(m.error)));
        else resolve(m.result);
      }
      if (m.method === 'Runtime.exceptionThrown') this.errors.push(m.params);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') this.errors.push(m.params);
    });
  }
  send(method, params = {}) {
    const id = (this.id += 1);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', {
      expression: expr,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text ?? 'eval failed');
    return r.result?.value;
  }
  async click(x, y) {
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await sleep(30);
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await sleep(260);
  }
  async key(code) {
    const map = { KeyP: { key: 'p', vk: 80 }, Escape: { key: 'Escape', vk: 27 } };
    const bit = map[code] ?? { key: code, vk: 0 };
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: bit.key, windowsVirtualKeyCode: bit.vk });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: bit.key, windowsVirtualKeyCode: bit.vk });
    await sleep(320);
  }
}

const buf = (n) => new Promise((r) => setTimeout(r, n));

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'zx-floormap-'));
  const chrome = spawn(
    CHROME,
    [
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      '--headless=new',
      '--window-size=1280,720',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--hide-scrollbars',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let ws;
  try {
    let target = null;
    for (let i = 0; i < 60 && !target; i += 1) {
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
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');

    console.log('\n=== 秘境图（D185）真机 ===\n');

    await cdp.send('Page.navigate', { url: `${BASE_URL}?cls=yujian` });
    const hookedExpr =
      'Boolean(window.__zhuoxian && window.__zhuoxian.floorMapCells && typeof window.__zhuoxian.floorMapVisible === "boolean")';
    let hooked = false;
    for (let i = 0; i < 25 && !hooked; i += 1) {
      await sleep(400);
      try {
        hooked = await cdp.eval(hookedExpr);
      } catch {
        hooked = false;
      }
    }
    check('调试钩子存在（floorMapCells / floorMapVisible）', hooked);
    if (!hooked) throw new Error('no hook');
    await sleep(600);

    const cells = await cdp.eval('window.__zhuoxian.floorMapCells()');
    check('钩子给出 76 格', Array.isArray(cells) && cells.length === 76, `n=${cells?.length}`);
    const stateOf = (f) => cells.find((c) => c.floor === f)?.state;
    check(
      '新号：第 1 层 current，其余 locked',
      stateOf(1) === 'current' && stateOf(2) === 'locked' && stateOf(76) === 'locked',
      `1=${stateOf(1)} 2=${stateOf(2)} 76=${stateOf(76)}`,
    );

    // 取画布几何，逻辑坐标 → 客户端坐标（D175 后 canvas 尺寸 ≠ 960）
    const host = await cdp.eval(`(() => {
      const c = document.getElementById('stage');
      const r = c.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height, cw: c.width, ch: c.height };
    })()`);
    // 逻辑→客户端：画布 CSS 宽对应 960 逻辑宽，按 CSS 尺寸/960 的比例换算
    const scale = host.width / 960;
    const pt = (x, y) => ({ x: host.left + x * scale, y: host.top + y * scale });

    const goldBefore = await cdp.eval(`(() => {
      const c = document.getElementById('stage');
      const ctx = c.getContext('2d');
      const sx = Math.round(160 * (c.width / 960)), sy = Math.round(60 * (c.height / 540));
      const sw = Math.round(640 * (c.width / 960)), sh = Math.round(420 * (c.height / 540));
      const d = ctx.getImageData(sx, sy, sw, sh).data;
      let gold = 0, dark = 0;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        if (r > 150 && g > 110 && b < 110 && r - b > 60) gold += 1;
        if (r < 24 && g < 24 && b < 30) dark += 1;
      }
      return { gold, dark };
    })()`);

    await cdp.key('KeyP');
    const opened = await cdp.eval('window.__zhuoxian.floorMapVisible');
    check('按 P 打开秘境图', opened === true, String(opened));

    const goldOpen = await cdp.eval(`(() => {
      const c = document.getElementById('stage');
      const ctx = c.getContext('2d');
      const sx = Math.round(160 * (c.width / 960)), sy = Math.round(60 * (c.height / 540));
      const sw = Math.round(640 * (c.width / 960)), sh = Math.round(420 * (c.height / 540));
      const d = ctx.getImageData(sx, sy, sw, sh).data;
      let gold = 0, dark = 0;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        if (r > 150 && g > 110 && b < 110 && r - b > 60) gold += 1;
        if (r < 24 && g < 24 && b < 30) dark += 1;
      }
      return { gold, dark };
    })()`);
    check(
      '面板真的画在屏幕上（金框像素显著增加 + 压暗）',
      goldOpen.gold > goldBefore.gold && goldOpen.dark > goldBefore.dark,
      `gold ${goldBefore.gold}→${goldOpen.gold}，dark ${goldBefore.dark}→${goldOpen.dark}`,
    );

    // 点当前层（第 1 层）：不该跳、也不该关面板（拒绝要有反馈）
    const c1 = cells.find((c) => c.floor === 1);
    await cdp.click(...Object.values(pt(c1.x + c1.w / 2, c1.y + c1.h / 2)));
    const afterSame = await cdp.eval('({ floor: window.__zhuoxian.session.floor, open: window.__zhuoxian.floorMapVisible })');
    check(
      '点当前层不跳层（拒绝要有反馈，不静默）',
      afterSame.floor === 1 && afterSame.open === true,
      JSON.stringify(afterSame),
    );

    // 造出「到过第 5 层」，再点第 3 层跳过去
    await cdp.eval('(() => { window.__zhuoxian.session.maxFloorReached = 5; window.__zhuoxian.session.floor = 5; return true; })()');
    const cells2 = await cdp.eval('window.__zhuoxian.floorMapCells()');
    check(
      '到过第 5 层后：1~4 可前往、5 当前',
      ['reachable', 'reachable', 'reachable', 'reachable', 'current'].every(
        (s, i) => cells2.find((c) => c.floor === i + 1)?.state === s,
      ),
      [1, 2, 3, 4, 5].map((f) => `${f}=${cells2.find((c) => c.floor === f)?.state}`).join(' '),
    );

    const c3 = cells2.find((c) => c.floor === 3);
    await cdp.click(...Object.values(pt(c3.x + c3.w / 2, c3.y + c3.h / 2)));
    const afterJump = await cdp.eval('({ floor: window.__zhuoxian.session.floor, open: window.__zhuoxian.floorMapVisible })');
    check(
      '点第 3 格真的跳到第 3 层，且面板自动关闭',
      afterJump.floor === 3 && afterJump.open === false,
      JSON.stringify(afterJump),
    );

    // 锁着的层：点了不跳
    await cdp.key('KeyP');
    const cells3 = await cdp.eval('window.__zhuoxian.floorMapCells()');
    const lockedCell = cells3.find((c) => c.state === 'locked' && c.floor > 10);
    await cdp.click(...Object.values(pt(lockedCell.x + lockedCell.w / 2, lockedCell.y + lockedCell.h / 2)));
    const afterLocked = await cdp.eval('({ floor: window.__zhuoxian.session.floor, open: window.__zhuoxian.floorMapVisible })');
    check(
      '点未抵达的层不跳（越界由 setFloor 负责拒绝）',
      afterLocked.floor === 3 && afterLocked.open === true,
      `目标 ${lockedCell.floor} → ${JSON.stringify(afterLocked)}`,
    );

    // 点面板外空白：关面板
    await cdp.click(host.left + 6 * scale, host.top + 6 * scale);
    const afterOutside = await cdp.eval('window.__zhuoxian.floorMapVisible');
    check('点面板外空白关闭面板', afterOutside === false, String(afterOutside));

    // 再按 P 打开、Escape 关闭
    await cdp.key('KeyP');
    const reopened = await cdp.eval('window.__zhuoxian.floorMapVisible');
    await cdp.key('Escape');
    const afterEsc = await cdp.eval('window.__zhuoxian.floorMapVisible');
    check('Escape 也能关（与其它面板一致）', reopened === true && afterEsc === false, `${reopened} → ${afterEsc}`);

    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(SHOT, Buffer.from(shot.data, 'base64'));
    check('截图已写出', fs.existsSync(SHOT), SHOT);

    check('控制台零报错', cdp.errors.length === 0, `${cdp.errors.length} 条`);
  } finally {
    try {
      ws?.close();
    } catch {
      /* ignore */
    }
    chrome.kill();
    await buf(300);
  }

  const pass = results.filter((r) => r.pass).length;
  const total = results.length;
  console.log(`\n=== ${pass}/${total} ===`);
  console.log(`结果：${pass}/${total}`);
  process.exitCode = pass === total ? 0 : 1;
}

main().catch((e) => {
  console.error('探针异常：', e);
  process.exitCode = 1;
});
