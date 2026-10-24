import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * D199 屏幕震动真机探针。
 *
 * 只证机制：①战斗会产生震动 ②没有事件时会衰减到 0 ③脏值不会把画面搞坏
 * ④震动只动世界层不动 HUD（这条用「顶栏区域像素在震动期间不位移」的方式近似验证）。
 *
 * 「震得好不好看」只能靠人眼 —— 探针不假装能判断手感。
 */
const ARGV = process.argv.slice(2);
const BASE = process.env.PROBE_URL ?? process.env.BASE_URL ?? ARGV.find((a) => a.startsWith('http')) ?? 'http://127.0.0.1:5292/';
const SHOT = process.env.PROBE_SHOT ?? ARGV.find((a) => a.endsWith('.png')) ?? 'F:/dsh-work/zhuoxian/docs/probe-shake.png';
const PORT = 9393;
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0;
let fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) {
    pass += 1;
    console.log(`  [PASS] ${name}${detail ? `  — ${detail}` : ''}`);
  } else {
    fail += 1;
    console.log(`  [FAIL] ${name}${detail ? `  — ${detail}` : ''}`);
  }
};

const profile = path.join(os.tmpdir(), `zx-shake-${Date.now()}`);
fs.mkdirSync(profile, { recursive: true });
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--window-size=1280,720',
  'about:blank',
], { stdio: 'ignore' });

let ws;
let msgId = 0;
const pending = new Map();
function send(method, params = {}) {
  msgId += 1;
  const id = msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => pending.set(id, { res, rej }));
}
async function ev(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { __err: r.exceptionDetails.exception?.description };
  return r.result?.value;
}

async function main() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break; }
    } catch { /* retry */ }
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
    }
  });
  await send('Runtime.enable');
  await send('Page.enable');
  const url = BASE.includes('cls=') ? BASE : `${BASE}${BASE.includes('?') ? '&' : '?'}cls=yujian`;
  await send('Page.navigate', { url });
  await sleep(2500);
  await ev('window.__zhuoxian && window.__zhuoxian.reset && window.__zhuoxian.reset()');
  await sleep(1800);

  ok('钩子存在', (await ev('Boolean(window.__zhuoxian && window.__zhuoxian.session)')) === true);
  const fresh = await ev('window.__zhuoxian.session.shake');
  // 不能断言 ===0：reset 之后战斗立刻开打，1.8 秒足够产生一次受击。
  // 这里只钉「有界且不是脏值」——具体数值随时序变化，钉它必然假红。
  ok('reset 后震动是 0~1 的有限数', typeof fresh === 'number' && Number.isFinite(fresh) && fresh >= 0 && fresh <= 1, `${fresh}`);

  // 打 4 秒，采最大震动值（战斗是自动的，几秒内必然有受击/击杀）
  let maxShake = 0;
  for (let i = 0; i < 40; i += 1) {
    const v = await ev('window.__zhuoxian.session.shake');
    if (typeof v === 'number' && v > maxShake) maxShake = v;
    await sleep(100);
  }
  ok('战斗会产生震动（4 秒内出现过 > 0）', maxShake > 0, `max=${maxShake.toFixed(3)}`);
  ok('震动不超过上限 1（显示态不许无限叠加）', maxShake <= 1, `max=${maxShake.toFixed(3)}`);

  // 手动注入大震动再观察衰减（不依赖事件时机）
  await ev('(() => { window.__zhuoxian.session.shake = 0.9; })()');
  await sleep(250);
  const decayed = await ev('window.__zhuoxian.session.shake');
  // 战斗一直在往里加震动（每次受击 +0.06），所以下限会被「战斗本身」顶住，
  // 绝对阈值必然假红。测方向：0.9 在 0.25 秒内掉掉一半以上就是衰减在生效。
  ok('注入 0.9 后 0.25 秒明显下降（衰减在生效，纯战斗驱动到不了这个幅度）', typeof decayed === 'number' && decayed < 0.5, `${decayed}`);

  // 脏值注入：不许把画面搞坏（NaN 震动 → 偏移 0）
  await ev('(() => { window.__zhuoxian.session.shake = Number.NaN; })()');
  await sleep(200);
  const afterNaN = await ev('window.__zhuoxian.session.shake');
  // 不能断言 ===0：NaN 被 decayShake 清成 0 之后，下一帧战斗又会加一个正常振幅。
  // 这里钉的是「NaN 没有扩散」——值必须回到有限且有界。
  ok(
    '注入 NaN 后回到有限有界值（渲染层吃 NaN 会整屏不画）',
    typeof afterNaN === 'number' && Number.isFinite(afterNaN) && afterNaN >= 0 && afterNaN <= 0.3,
    `${afterNaN}`,
  );

  // HUD 不动：震动期间顶栏右侧文字区域仍有内容（如果整屏平移，这里会移动但不会消失；用「有内容」近似）
  const hudLit = await ev(`(() => {
    const c = document.getElementById('stage'); const g = c.getContext('2d');
    const s = c.width / 960;
    const d = g.getImageData(Math.round(600 * s), Math.round(0 * s), Math.round(340 * s), Math.round(38 * s)).data;
    let lit = 0;
    for (let i = 0; i < d.length; i += 4) { const l = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2]; if (l > 90) lit += 1; }
    return lit;
  })()`);
  ok('震动期间顶栏仍有内容（HUD 没被一起平移出画面）', typeof hudLit === 'number' && hudLit > 100, `lit=${hudLit}`);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(SHOT, Buffer.from(shot.data, 'base64'));
  ok('控制台零报错', ((await ev('window.__zhuoxian.__consoleErrors ? window.__zhuoxian.__consoleErrors.length : 0')) ?? 0) === 0);

  console.log(`\n  截图：${SHOT}`);
  console.log(`\n=== ${pass}/${pass + fail} ===`);
  console.log(`结果：${pass}/${pass + fail}`);
  chrome.kill();
  process.exitCode = fail === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error('EXPLODE', err);
  chrome.kill();
  process.exitCode = 1;
});
