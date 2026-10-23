/**
 * 浏览器探针 harness —— 《浊仙》可玩层验收基建。
 *
 * 思路来源：F:\dsh-work\tools\probe-zhuoxian.mjs（单文件探针，已验证可用）。
 * 本文件只做一件事：把「起/复用 vite、连 CDP、发键、截图、断言汇总」工程化，
 * 让每个探针脚本只写自己的断言，不再重复 300 行环境代码。
 *
 * 用法（见同目录 smoke.mjs）：
 *
 *   import { withPage, assert, summary } from './harness.mjs';
 *
 *   await withPage(async (page) => {
 *     const title = await page.eval('document.title');
 *     assert('页面标题可读', typeof title === 'string' && title.length > 0, title);
 *     assert('canvas 存在', await page.eval('!!document.querySelector("#stage")'));
 *     await page.screenshot('F:/dsh-work/zhuoxian/tools/probe/smoke.png');
 *   });
 *   summary();   // 打印「通过 N/M」并按全绿/有失败设置退出码
 *
 * 为什么必须放在 tools/probe/（而不是 src/ 或 scripts/）：
 *   vite dev server 会 watch 项目目录；探针写临时文件/截图会和 watcher 抢文件锁，
 *   Windows 上直接报 EBUSY: resource busy or locked，dev server 崩掉。
 *
 * 硬性环境事实（写死在这里，不在每个脚本里重复）：
 *   - Chrome：C:\Program Files\Google\Chrome\Application\chrome.exe
 *   - vite dev server：127.0.0.1:5274（已活着就复用，绝不重复起）
 *   - CDP：127.0.0.1:9333
 *   - 必须带 --disable-background-timer-throttling：后台标签页计时器会被降频，
 *     测「移动速度 / 计时器」必然假红。
 */

import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

// ────────────────────────────────────────────────────────────
// 默认环境
// ────────────────────────────────────────────────────────────

export const DEFAULT_CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
export const DEFAULT_PROJECT = 'F:\\dsh-work\\zhuoxian';
export const DEFAULT_PORT = 5274;
export const DEFAULT_CDP_PORT = 9333;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ────────────────────────────────────────────────────────────
// 断言收集（全局，一个脚本一份）
// ────────────────────────────────────────────────────────────

/** @type {{ name: string, ok: boolean, detail?: string }[]} */
const RESULTS = [];

/**
 * 记录一条断言并立刻打印。
 * @param {string} name  「输入/操作 → 期望」的可读描述
 * @param {boolean} cond 实际条件
 * @param {string} [detail] 实测值（红了必须能看出实际是多少）
 * @returns {boolean} 方便在调用处继续用
 */
export function assert(name, cond, detail) {
  const ok = Boolean(cond);
  RESULTS.push({ name, ok, detail });
  console.log(`${ok ? '  OK  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

/** 清空本进程已收集的断言（一个脚本里跑多段时用） */
export function resetAssertions() {
  RESULTS.length = 0;
}

/**
 * 打印汇总并按结果设置退出码。
 * - 全绿 → process.exitCode = 0（不覆盖调用方已设的非 0）
 * - 有失败 → process.exitCode = 1
 * - 一条断言都没跑 → 也视为失败（「没测」不等于「通过」）
 * @returns {{ pass: number, total: number, results: { name: string, ok: boolean, detail?: string }[] }}
 */
export function summary() {
  const total = RESULTS.length;
  const pass = RESULTS.filter((r) => r.ok).length;
  const results = RESULTS.map((r) => ({ ...r }));

  if (total === 0) {
    console.log('\n通过 0/0 —— 没有任何断言被执行，视为失败');
    process.exitCode = 1;
    return { pass: 0, total: 0, results };
  }

  console.log(`\n通过 ${pass}/${total}`);
  if (pass !== total) process.exitCode = 1;
  return { pass, total, results };
}

// ────────────────────────────────────────────────────────────
// vite dev server：先探活，活着就复用
// ────────────────────────────────────────────────────────────

/** 探 http://127.0.0.1:<port>/ 是不是真的活着（并且真的是本项目：页面里有 #stage 标记） */
async function probeDevServer(port, wantMarker) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`, {
      signal: AbortSignal.timeout(1200),
    });
    if (!res.ok) return false;
    if (!wantMarker) return true;
    const html = await res.text();
    return html.includes(wantMarker);
  } catch {
    return false;
  }
}

/**
 * 确保 vite 活着：优先复用，其次在本进程内起一个（可精确关掉，且不会触发 config 里的 open:true）。
 * @returns {Promise<{ started: boolean, close: () => Promise<void> }>}
 */
async function ensureDevServer(projectDir, port, verbose) {
  if (await probeDevServer(port, 'stage')) {
    if (verbose) console.log(`[harness] 复用已运行的 dev server :${port}`);
    return { started: false, close: async () => {} };
  }
  if (await probeDevServer(port, null)) {
    // 端口被别的服务占了，但我们不能乱杀它 —— 直接报清楚
    throw new Error(`端口 ${port} 已被非本项目服务占用，无法起 vite。请先关掉它。`);
  }

  if (verbose) console.log(`[harness] 启动 vite dev server :${port}`);

  // 首选：进程内 createServer（能覆盖 config 的 open:true，避免每次弹一个浏览器窗口）
  const viteEntry = join(projectDir, 'node_modules', 'vite', 'dist', 'node', 'index.js');
  try {
    const vite = await import(pathToFileURL(viteEntry).href);
    const server = await vite.createServer({
      root: projectDir,
      configFile: join(projectDir, 'vite.config.ts'),
      logLevel: 'error',
      clearScreen: false,
      server: {
        host: '127.0.0.1',
        port,
        strictPort: true,
        open: false,
        watch: {
          // 探针产物（截图/tmp）放在 tools/probe，别让 watcher 盯着它们，
          // 否则 Windows 上写文件会和 watcher 抢锁 → EBUSY
          ignored: ['**/*.tmpdir/**', '**/*.tmp', '**/.git/**', '**/tools/probe/**'],
        },
      },
    });
    await server.listen();
    return {
      started: true,
      close: async () => {
        await server.close();
      },
    };
  } catch (err) {
    if (verbose) console.log(`[harness] 进程内起 vite 失败（${err.message}），回退为子进程`);
  }

  // 回退：子进程起 vite（不带 --open；config 里 open:true 可能弹窗口，但功能没问题）
  const proc = spawn(
    process.execPath,
    [join(projectDir, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    { cwd: projectDir, stdio: 'ignore' },
  );
  for (let i = 0; i < 120; i++) {
    await sleep(250);
    if (await probeDevServer(port, 'stage')) {
      return {
        started: true,
        close: async () => {
          proc.kill();
          await sleep(200);
        },
      };
    }
    if (proc.exitCode !== null) throw new Error(`vite 子进程提前退出（exit ${proc.exitCode}）`);
  }
  proc.kill();
  throw new Error(`vite 30 秒内没起来（:${port}）`);
}

// ────────────────────────────────────────────────────────────
// Chrome + CDP
// ────────────────────────────────────────────────────────────

/** 读 CDP /json/list，返回第一个 page target 的 ws 地址 */
async function findPageTarget(cdpPort) {
  try {
    const res = await fetch(`http://127.0.0.1:${cdpPort}/json/list`, {
      signal: AbortSignal.timeout(1000),
    });
    if (!res.ok) return null;
    const targets = await res.json();
    const page = targets.find((t) => t.type === 'page');
    return page ? page.webSocketDebuggerUrl : null;
  } catch {
    return null;
  }
}

/** 起/复用 Chrome，返回 { proc, profile, wsUrl }（proc 为 null 表示复用，不要杀） */
async function ensureChrome(chromePath, cdpPort, reuse, verbose) {
  if (reuse) {
    const existing = await findPageTarget(cdpPort);
    if (existing) {
      if (verbose) console.log(`[harness] 复用已运行的 Chrome :${cdpPort}`);
      return { proc: null, profile: null, wsUrl: existing };
    }
  }

  const profile = mkdtempSync(join(tmpdir(), 'zhuoxian-probe-'));
  if (verbose) console.log(`[harness] 启动 headless Chrome，CDP :${cdpPort}`);

  const proc = spawn(
    chromePath,
    [
      '--headless=new',
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${profile}`,
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      // 关键三件套：后台标签页计时器/渲染降频会让「速度、计时」类断言假红
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--window-size=1000,620',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  for (let i = 0; i < 80; i++) {
    await sleep(150);
    const wsUrl = await findPageTarget(cdpPort);
    if (wsUrl) return { proc, profile, wsUrl };
    if (proc.exitCode !== null) {
      rmSyncQuiet(profile);
      throw new Error(`Chrome 提前退出（exit ${proc.exitCode}），检查 Chrome 路径：${chromePath}`);
    }
  }
  proc.kill();
  rmSyncQuiet(profile);
  throw new Error(`12 秒内连不上 CDP :${cdpPort}`);
}

function rmSyncQuiet(path) {
  if (!path) return;
  try {
    rmSync(path, { recursive: true, force: true });
  } catch {
    // Windows 上 profile 文件可能被 Chrome 短暂占用，忽略即可（下次用新临时目录）
  }
}

/** 一个极简 CDP 客户端：只有 send / 事件回调 / close */
async function createCdp(wsUrl, diagnose) {
  if (typeof WebSocket === 'undefined') {
    throw new Error('本机 Node 没有全局 WebSocket（需要 Node >= 22）。请升级 Node。');
  }
  const ws = new WebSocket(wsUrl);
  let nextId = 0;
  /** @type {Map<number, { resolve: (v: unknown) => void, reject: (e: Error) => void }>} */
  const pending = new Map();

  // 必须等连接真正建立再 send，否则 undici 报 "Sent before connected."
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve(), { once: true });
    ws.addEventListener('error', () => reject(new Error(`CDP WebSocket 连不上：${wsUrl}`)), { once: true });
  });

  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
      return;
    }
    diagnose.handleEvent(msg);
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  const close = () =>
    new Promise((resolve) => {
      try {
        if (ws.readyState === ws.CLOSED) return resolve();
        ws.addEventListener('close', () => resolve(), { once: true });
        ws.close();
      } catch {
        resolve();
      }
    });

  return { ws, send, close };
}

// ────────────────────────────────────────────────────────────
// 键盘：code → CDP 需要的信息
// ────────────────────────────────────────────────────────────

const NAMED_KEYS = {
  Space: { key: ' ', vk: 32 },
  Escape: { key: 'Escape', vk: 27 },
  Enter: { key: 'Enter', vk: 13 },
  Tab: { key: 'Tab', vk: 9 },
  Backspace: { key: 'Backspace', vk: 8 },
  ArrowLeft: { key: 'ArrowLeft', vk: 37 },
  ArrowUp: { key: 'ArrowUp', vk: 38 },
  ArrowRight: { key: 'ArrowRight', vk: 39 },
  ArrowDown: { key: 'ArrowDown', vk: 40 },
  ShiftLeft: { key: 'Shift', vk: 16 },
  ControlLeft: { key: 'Control', vk: 17 },
  AltLeft: { key: 'Alt', vk: 18 },
};

/** 'KeyD' → { key:'d', vk:68 }；'Digit1' → { key:'1', vk:49 }；'ArrowUp' → 查表 */
function keyInfo(code) {
  if (Object.prototype.hasOwnProperty.call(NAMED_KEYS, code)) return NAMED_KEYS[code];
  if (code.startsWith('Key') && code.length === 4) {
    const ch = code.slice(3).toLowerCase();
    return { key: ch, vk: ch.toUpperCase().charCodeAt(0) };
  }
  if (code.startsWith('Digit') && code.length === 6) {
    const ch = code.slice(5);
    return { key: ch, vk: ch.charCodeAt(0) };
  }
  return { key: code, vk: 0 };
}

// ────────────────────────────────────────────────────────────
// 噪音过滤：浏览器自发请求不算「控制台错误」
// ────────────────────────────────────────────────────────────

/**
 * 这条浏览器日志/异常是否该被忽略。
 * favicon 404 是浏览器自动请求的（页面没写也没关系），和游戏无关；
 * 以前不过滤，探针永远假红。
 */
export function isIgnorableNoise(text, url) {
  const u = String(url ?? '');
  const t = String(text ?? '');
  if (u.includes('favicon') || t.includes('favicon')) return true;
  // vite HMR 的连接断开是探针主动关标签页/服务时的正常现象
  if (t.includes('WebSocket closed without opened')) return true;
  return false;
}

// ────────────────────────────────────────────────────────────
// withPage：起环境 → 交给 fn(page) → 清理
// ────────────────────────────────────────────────────────────

/**
 * @param {(page: ProbePage) => Promise<unknown>} fn
 * @param {object} [opts]
 * @param {string} [opts.projectDir] 项目根目录（默认 F:\dsh-work\zhuoxian）
 * @param {number} [opts.port] vite 端口（默认 5274）
 * @param {number} [opts.cdpPort] CDP 端口（默认 9333）
 * @param {string} [opts.chromePath]
 * @param {string} [opts.url] 默认 http://127.0.0.1:<port>/
 * @param {boolean} [opts.reuseChrome] 9333 已有 Chrome 就复用（默认 true）
 * @param {number} [opts.settleMs] 页面加载后额外等待（默认 600）
 * @param {boolean} [opts.verbose]
 */
export async function withPage(fn, opts = {}) {
  const projectDir = opts.projectDir ?? DEFAULT_PROJECT;
  const port = opts.port ?? DEFAULT_PORT;
  const cdpPort = opts.cdpPort ?? DEFAULT_CDP_PORT;
  const chromePath = opts.chromePath ?? DEFAULT_CHROME;
  const verbose = opts.verbose === true;
  const settleMs = opts.settleMs ?? 600;
  const targetUrl = opts.url ?? `http://127.0.0.1:${port}/`;

  const dev = await ensureDevServer(projectDir, port, verbose);

  /** @type {{ proc: import('node:child_process').ChildProcess | null, profile: string | null, wsUrl: string } | null} */
  let chrome = null;
  let cdp = null;
  try {
    chrome = await ensureChrome(chromePath, cdpPort, opts.reuseChrome !== false, verbose);

    /** @type {string[]} 控制台错误（已过滤 favicon 等噪音） */
    const problems = [];

    cdp = await createCdp(chrome.wsUrl, {
      handleEvent(msg) {
        if (msg.method === 'Runtime.exceptionThrown') {
          const d = msg.params.exceptionDetails;
          const text = d.exception?.description ?? d.text ?? '';
          if (!isIgnorableNoise(text, d.url)) problems.push(`未捕获异常: ${text}`);
          return;
        }
        if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
          const text = msg.params.args
            .map((a) => a.value ?? a.description ?? '')
            .join(' ');
          if (!isIgnorableNoise(text, '')) problems.push(`console.error: ${text}`);
          return;
        }
        if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
          const entry = msg.params.entry;
          if (!isIgnorableNoise(entry.text, entry.url)) {
            problems.push(`浏览器日志: ${entry.text} ${entry.url ?? ''}`.trim());
          }
        }
      },
    });

    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Log.enable');

    const send = cdp.send;

    // ── page 对象 ─────────────────────────────────────────
    const page = {
      url: targetUrl,
      cdpPort,
      /** 在页面里执行表达式（字符串），返回可序列化的值 */
      async eval(expression) {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const r = await send('Runtime.evaluate', {
              expression,
              returnByValue: true,
              awaitPromise: true,
              userGesture: true,
            });
            if (r.exceptionDetails) {
              const msg = r.exceptionDetails.exception?.description ?? r.exceptionDetails.text;
              throw new Error(`页面执行出错：${msg}`);
            }
            return r.result.value;
          } catch (err) {
            // 页面正在导航/整页重载时执行上下文会销毁 —— 这不是失败，等一下就重试
            if (attempt < 2 && /Execution context was destroyed|Cannot find context|Inspected target navigated/i.test(err.message)) {
              await sleep(300);
              continue;
            }
            throw err;
          }
        }
        return undefined;
      },

      /** 轮询直到表达式为真；超时抛错（不要用 requestAnimationFrame 等待，后台标签页会挂起） */
      async waitFor(expression, timeoutMs = 15000) {
        const deadline = Date.now() + timeoutMs;
        let last = '';
        while (Date.now() < deadline) {
          try {
            if (await page.eval(expression)) return true;
          } catch (err) {
            last = err.message;
          }
          await sleep(100);
        }
        throw new Error(`waitFor 超时（${timeoutMs}ms）：${expression}${last ? ` / ${last}` : ''}`);
      },

      async navigate(url = targetUrl) {
        page.url = url;
        await send('Page.bringToFront');
        await send('Page.navigate', { url });
        await page.waitFor('document.readyState === "complete"', 20000);
      },

      async bringToFront() {
        await send('Page.bringToFront');
      },

      async reload() {
        await send('Page.reload', { ignoreCache: false });
        await page.waitFor('document.readyState === "complete"', 20000);
      },

      /** 发真实键盘按下（Input.dispatchKeyEvent 走浏览器原生事件，不走 DOM 合成事件） */
      async pressKey(code) {
        const k = keyInfo(code);
        await send('Input.dispatchKeyEvent', {
          type: 'keyDown',
          code,
          key: k.key,
          windowsVirtualKeyCode: k.vk,
          nativeVirtualKeyCode: k.vk,
        });
      },

      async releaseKey(code) {
        const k = keyInfo(code);
        await send('Input.dispatchKeyEvent', {
          type: 'keyUp',
          code,
          key: k.key,
          windowsVirtualKeyCode: k.vk,
          nativeVirtualKeyCode: k.vk,
        });
      },

      waitMs(ms) {
        return sleep(ms);
      },

      /** 截一张 PNG；返回文件路径（大小由调用方自己断言） */
      async screenshot(path) {
        const shot = await send('Page.captureScreenshot', { format: 'png' });
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, Buffer.from(shot.data, 'base64'));
        return path;
      },

      /** 已收集的控制台错误（已过滤 favicon 等浏览器自发噪音） */
      consoleErrors() {
        return problems.slice();
      },

      clearConsoleErrors() {
        problems.length = 0;
      },

      /** 需要非常规 CDP 调用时的逃生门 */
      send,
    };

    // 先把页面拉回干净起点：关掉存档副作用 → 清 localStorage → 导航 → 等应用挂载。
    // 不这么做，上一次探针留下的状态（旧存档 / ?pause=1）会让后面连锁假红 7 项以上。
    // 注意顺序：先关补存，再清 localStorage —— 否则 reload 时旧页面 pagehide 补存会把清掉的数据写回来。
    await send('Page.bringToFront');
    await page.navigate(targetUrl);
    await page.eval(
      '(() => { try { window.__storage?.setSaveEnabled?.(false); } catch {} localStorage.clear(); return true; })()',
    );
    await page.reload();
    await page.waitFor('document.readyState === "complete"', 20000);
    await page.waitMs(settleMs);

    return await fn(page);
  } finally {
    try {
      if (cdp) await cdp.close();
    } catch {
      // ignore
    }
    if (chrome && chrome.proc) {
      try {
        chrome.proc.kill();
      } catch {
        // ignore
      }
      await sleep(300);
      rmSyncQuiet(chrome.profile);
    }
    if (dev.started) {
      try {
        await dev.close();
      } catch {
        // ignore
      }
    }
  }
}
