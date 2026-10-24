/**
 * 首次游玩端到端验收（D203）。
 *
 * 为什么单独写一个：现有 33 个探针各自验一块（面板能开、按钮能点、掉落能进背包），
 * 但没有一个验「一个新玩家从打开到玩几分钟」这条完整路径 —— 而本轮新增的东西
 * （11 个面板、12 个 HUD 按钮、11 条引导、震动、音效、统计）都是**叠加在同一个屏幕上**，
 * 单块都好、叠起来互相挡，只有真按时间跑一遍才会露出来。
 *
 * 纪律：
 * - 只从**玩家能点的东西**驱动（点卡片、点按钮、按键），不调内部函数改状态；
 * - 断言「玩家感受得到的东西」（能不能继续玩、有没有报错、引导走不走得完），不钉具体数值；
 * - 跑满 N 秒真时间，不做时间加速（加速会掩盖「等太久」这类问题）。
 *
 * 用法：node tools/probe-playtest.mjs [url]
 *   PROBE_URL / PLAYTEST_SECONDS / PROBE_SHOT / PROBE_CDP_PORT 可覆盖默认
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const BASE_URL = process.env.PROBE_URL ?? process.argv[2] ?? 'http://127.0.0.1:5292/';
// 这个探针**故意不加 ?cls=**：它要验的正是「新玩家点卡片能不能选道统」。
// 其它探针加 ?cls= 是为了跳过开场直接进战斗，这里必须让它真的走一次开场。
const URL_NO_CLASS = BASE_URL.includes('cls=') ? BASE_URL.split('?')[0] : BASE_URL;
const PORT = Number(process.env.PROBE_CDP_PORT ?? 9396);
const SHOT = process.env.PROBE_SHOT ?? 'docs/probe-playtest.png';
const RUN_SECONDS = Number(process.env.PLAYTEST_SECONDS ?? 240);

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' · ' + detail : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function resolveChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* 路径探测失败不算错误 */
    }
  }
  return 'google-chrome';
}

const chrome = spawn(
  resolveChrome(),
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-extensions',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=1600,900',
    `--user-data-dir=${path.join(os.tmpdir(), `zhuoxian-playtest-${Date.now()}`)}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

function getJson(p) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${PORT}${p}`, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(d));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
  });
}

const HOST_EXPR = `(() => {
  const c = document.querySelector('canvas');
  if (!c) return null;
  const r = c.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
})()`;

async function main() {
  let targets = null;
  for (let i = 0; i < 40; i += 1) {
    try {
      targets = await getJson('/json/list');
      if (targets?.length) break;
    } catch {
      /* chrome 还没起来 */
    }
    await sleep(250);
  }
  if (!targets?.length) throw new Error('chrome 没起来（CDP 连不上）');

  // 必须挑 type === 'page' 的 target：Chrome 可能把扩展的 background_page 排在前面，
  // 那时拿 targets[0] 会连到扩展页面上，navigate 之后仍然没有 canvas（D203 踩过）。
  const pageTarget = targets.find((t) => t.type === 'page');
  if (!pageTarget) throw new Error('没有可用的 page target（只有扩展/浏览器内部页）');

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
      return;
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      errors.push(String(msg.params?.exceptionDetails?.text ?? 'exception'));
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
      errors.push(String(msg.params.args?.[0]?.value ?? 'console.error'));
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      id += 1;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.result?.exceptionDetails) {
      throw new Error(String(r.result.exceptionDetails.exception?.description ?? 'eval error'));
    }
    return r.result?.result?.value;
  };
  const click = async (x, y) => {
    for (const type of ['mousePressed', 'mouseReleased']) {
      await send('Input.dispatchMouseEvent', {
        type,
        x,
        y,
        button: 'left',
        clickCount: 1,
        buttons: type === 'mousePressed' ? 1 : 0,
      });
      await sleep(40);
    }
  };
  const pressKey = async (code, key, vk) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key, windowsVirtualKeyCode: vk });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key, windowsVirtualKeyCode: vk });
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1600,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send('Page.navigate', { url: URL_NO_CLASS });

  // 等 canvas 出现：冷启动 + 首次 transform 可能要几秒，写死 sleep 会随机器快慢假红。
  let host = null;
  for (let i = 0; i < 60; i += 1) {
    await sleep(300);
    host = await evaluate(HOST_EXPR).catch(() => null);
    if (host && host.width > 0) break;
  }
  if (!host) throw new Error('canvas 一直没出现（页面没加载起来？）');

  const toClient = (x, y) => ({
    x: Math.round(host.left + (x / 960) * host.width),
    y: Math.round(host.top + (y / 540) * host.height),
  });

  // ── 1. 开场：选道统 ─────────────────────────────────────
  const phase0 = await evaluate('window.__zhuoxian?.phase ?? null');
  check('开新档时先进入选道统', phase0 === 'select', `phase=${phase0}`);
  const cards = await evaluate('window.__zhuoxian.classCards().length');
  check('六张道统卡片都在', cards === 6, String(cards));
  const card3 = await evaluate('window.__zhuoxian.classCards()[2]');
  const p3 = toClient(card3.x + card3.w / 2, card3.y + card3.h / 2);
  await click(p3.x, p3.y);
  await sleep(1200);
  const entered = await evaluate(
    '(() => { const z = window.__zhuoxian; return { phase: z.phase ?? null, cls: z.session?.character?.classId ?? null }; })()',
  );
  check(
    '第一次玩能一下点进战斗（不要求点两下）',
    entered?.phase === 'play' && typeof entered?.cls === 'string',
    JSON.stringify(entered),
  );

  // ── 2. 前 60 秒：引导自己往前走、有击杀、时间在走 ─────────
  const first = await evaluate(
    '(() => { const s = window.__zhuoxian.session; return { tutorial: s.tutorialStep, kills: s.kills }; })()',
  );
  await sleep(60_000);
  const after60 = await evaluate(
    '(() => { const z = window.__zhuoxian; const s = z.session; return { tutorial: s.tutorialStep, len: z.tutorialLength, kills: s.kills, floor: s.floor, played: s.playedSeconds }; })()',
  );
  check(
    '60 秒内引导自己往前走了（不按键也走）',
    Number(after60.tutorial) > Number(first.tutorial),
    `${first.tutorial} → ${after60.tutorial} / ${after60.len}`,
  );
  check('60 秒内有击杀（战斗真的在打）', Number(after60.kills) > 0, `kills=${after60.kills}`);
  check(
    '60 秒内游戏时间在走',
    Number(after60.played) > 55,
    `played=${Number(after60.played).toFixed(1)}s`,
  );

  // ── 3. 玩家会做的事：把每个面板开一遍再关掉 ───────────────
  const buttons = await evaluate('window.__zhuoxian.hudButtons()');
  check(
    '按钮条读得到（探针从这里拿几何，不写死坐标）',
    Array.isArray(buttons) && buttons.length >= 11,
    String(buttons?.length),
  );
  const panelIds = [
    'detail',
    'breakdown',
    'talent',
    'skill',
    'codex',
    'achievement',
    'marks',
    'save',
    'floormap',
    'bag',
    'stats',
  ];
  let opened = 0;
  let closed = 0;
  for (const pid of panelIds) {
    const b = (buttons ?? []).find((x) => x.id === pid);
    if (!b) continue;
    const pc = toClient(b.x + b.w / 2, b.y + b.h / 2);
    await click(pc.x, pc.y);
    await sleep(250);
    if ((await evaluate(`window.__zhuoxian.panelsOpen().includes('${pid}')`)) === true) opened += 1;
    await click(pc.x, pc.y);
    await sleep(250);
    if ((await evaluate(`!window.__zhuoxian.panelsOpen().includes('${pid}')`)) === true) closed += 1;
  }
  check('每个面板都能点开', opened === panelIds.length, `${opened}/${panelIds.length}`);
  check('每个面板都能再点关掉', closed === panelIds.length, `${closed}/${panelIds.length}`);

  // ── 4. 帮助：点右下「?」能开（新人最先按的东西之一） ──────
  const helpBtn = await evaluate('window.__zhuoxian.helpButton()');
  const hc = toClient(helpBtn.x + helpBtn.w / 2, helpBtn.y + helpBtn.h / 2);
  await click(hc.x, hc.y);
  await sleep(300);
  check('右下「?」能打开帮助', (await evaluate('window.__zhuoxian.helpVisible === true')) === true);
  await pressKey('Escape', 'Escape', 27);
  await sleep(300);
  check('Esc 能关掉帮助', (await evaluate('window.__zhuoxian.helpVisible === true')) === false);

  // ── 5. 玩到 N 秒：还在跑、修为在涨、存档写了 ─────────────
  // 不按墙钟算剩余时间：中间开面板、点帮助都要花时间，墙钟会让真实游戏时长偏短，
  // 然后「跑满 N 秒」这条假红（D203 第一版）。只认游戏自己累加的 playedSeconds。
  for (let i = 0; i < 240; i += 1) {
    const playedNow = Number(await evaluate('window.__zhuoxian?.session?.playedSeconds ?? 0'));
    if (playedNow >= RUN_SECONDS) break;
    await sleep(2000);
  }
  const final = await evaluate(`(() => {
    const z = window.__zhuoxian; const s = z.session;
    return {
      played: s.playedSeconds, kills: s.kills, deaths: s.deaths, floor: s.floor, wave: s.wave,
      tutorial: s.tutorialStep, len: z.tutorialLength,
      step: s.character.step, bag: s.bag?.length ?? 0, xp: s.character.xp,
      hasSave: Boolean(localStorage.getItem('zhuoxian.save.v1')),
    };
  })()`);
  check(
    `跑满 ${RUN_SECONDS} 秒没崩、没罚站`,
    Number(final.played) > RUN_SECONDS - 20,
    `played=${Number(final.played).toFixed(0)}s`,
  );
  check('打死了不少怪', Number(final.kills) >= 10, `kills=${final.kills}`);
  check(
    '引导在时间内走完（不靠按键）',
    Number(final.tutorial) === Number(final.len),
    `${final.tutorial}/${final.len}`,
  );
  // 修为在涨即可：第一重门槛约 22 分钟（BALANCE REALM_SHAPE 0.085 × 260），
  // 4 分钟就要求「突破过」是错的期望（第一版写成 step>=2，假红）。
  check(
    '修为在积累（第一重还没到是正常的，但要 > 0）',
    Number(final.xp) > 0 || Number(final.step) > 0,
    `xp=${final.xp} step=${final.step}`,
  );
  check('存档已写入', final.hasSave === true);

  // ── 6. 截图 ────────────────────────────────────────────
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  if (shot.result?.data) fs.writeFileSync(SHOT, Buffer.from(shot.result.data, 'base64'));

  check('控制台零报错', errors.length === 0, errors.slice(0, 2).join(' | '));

  const pass = results.filter((r) => r.pass).length;
  console.log(`\n结果：${pass}/${results.length}`);
  console.log(`截图：${path.resolve(SHOT)}`);
  console.log(
    `· 玩家视角：${Number(final.played).toFixed(0)} 秒 / 击杀 ${final.kills} / 死 ${final.deaths} / 层 ${final.floor} 波 ${final.wave} / 境界 ${final.step} 重 / 背包 ${final.bag}`,
  );
  ws.close();
  chrome.kill();
  process.exitCode = pass === results.length ? 0 : 1;
}

main().catch((e) => {
  console.error('探针崩了：', e);
  chrome.kill();
  process.exitCode = 1;
});
