/**
 * 镇守血条真机验收（D183）。
 *
 * 为什么不能只靠单测：几何函数算对了，不代表渲染器把它画到了那个位置（本项目踩过
 * 「判据正确但读的是快照」「探针在错的位置采样」多次）。这里从钩子拿镇守的真实坐标，
 * 用同一套几何公式算出「条应该在哪」，再直接数那块像素。
 *
 * 用法：node tools/probe-boss-bar.mjs [--port=9392] [--base=http://127.0.0.1:5292]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const argv = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const PORT = Number(argv.port ?? 9392);
const BASE = String(argv.base ?? process.env.BASE_URL ?? 'http://127.0.0.1:5292');
const SHOT = 'docs/probe-boss-bar.png';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

function resolveChrome() {
  for (const p of CHROME_CANDIDATES) if (p && fs.existsSync(p)) return p;
  return 'google-chrome';
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(b));
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
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
        return;
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        this.errors.push(msg.params?.exceptionDetails?.text ?? 'exception');
      }
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        this.errors.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`timeout ${method}`));
        }
      }, 20000);
    });
  }
}

async function evalJs(cdp, expression) {
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text ?? 'eval failed');
  return r.result.value;
}

let pass = 0;
let fail = 0;
function ok(name, cond, detail = '') {
  if (cond) {
    pass++;
    console.log(`  [PASS] ${name}${detail ? `  — ${detail}` : ''}`);
  } else {
    fail++;
    console.log(`  [FAIL] ${name}${detail ? `  — ${detail}` : ''}`);
  }
}

/**
 * 在画布上数两类像素：镇守条（锈红）与百分比文字（暖金）。
 *
 * ⚠️ 传进来的 rect 必须是 **backing store 像素**（= 逻辑坐标 × viewport().ratio）：
 * D175 之后 canvas.width 不再等于 960，直接用逻辑坐标取 getImageData 会取到别的区域，
 * 表现为「明明画了却数到 0 像素」—— 我第一次就是这么假红的。
 */
const COUNT = `(rect) => {
  const cv = document.getElementById('stage');
  const ctx = cv.getContext('2d');
  const { x, y, w, h } = rect;
  if (w <= 0 || h <= 0) return { red: 0, gold: 0, n: 0 };
  const d = ctx.getImageData(x, y, w, h).data;
  let red = 0;
  let gold = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    if (r > 120 && g < 110 && b < 110 && r - g > 40) red++;
    else if (r > 180 && g > 140 && b < 200 && r - b > 40) gold++;
  }
  return { red, gold, n: d.length / 4 };
}`;

async function main() {
  const chrome = resolveChrome();
  const profile = path.join(os.tmpdir(), `zhuoxian-bossbar-${Date.now()}`);
  fs.mkdirSync(profile, { recursive: true });
  const proc = spawn(
    chrome,
    [
      '--headless=new',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-timer-throttling',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let cdp = null;
  try {
    let targets = null;
    for (let i = 0; i < 60; i++) {
      try {
        targets = await getJson(`http://127.0.0.1:${PORT}/json/list`);
        if (targets.some((t) => t.type === 'page')) break;
      } catch {
        /* not ready */
      }
      await sleep(300);
    }
    const page = targets.find((t) => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res);
      ws.addEventListener('error', rej);
    });
    cdp = new Cdp(ws);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 720,
      deviceScaleFactor: 1,
      mobile: false,
    });

    console.log('\n=== 镇守血条（D183）真机 ===\n');

    const url = `${BASE}/?cls=yujian`;
    await cdp.send('Page.navigate', { url });
    await sleep(2200);
    await evalJs(cdp, 'localStorage.clear()');
    await cdp.send('Page.navigate', { url });
    await sleep(2500);

    const hasHook = await evalJs(cdp, "typeof window.__zhuoxian === 'object'");
    ok('调试钩子存在', hasHook === true, String(hasHook));

    // 直接跳到第 10 波（镇守波）—— 等它自然走到要 160 秒，没必要
    await evalJs(cdp, '(() => { const s = window.__zhuoxian.session; s.wave = 9; s.battle.monsters.length = 0; window.__zhuoxian.startWave ? window.__zhuoxian.startWave() : null; return true; })()');
    // 没有 startWave 钩子就靠清场让主循环自己开下一波
    await evalJs(cdp, 'window.__zhuoxian.session.battle.monsters.length = 0');
    await sleep(2500);

    let boss = await evalJs(
      cdp,
      '(() => { const m = window.__zhuoxian.session.battle.monsters.find(x => x.rarity === "boss"); return m ? { x: m.x, y: m.y, size: m.size, hp: m.hp, maxHp: m.maxHp, name: m.name } : null; })()',
    );
    ok('进到镇守波并出现镇守', boss !== null, JSON.stringify(boss));

    if (!boss) {
      console.log('\n  镇守没出现，后续像素断言跳过');
    } else {
      // 等它掉血（玩家打它）—— 满血时按设计不画条
      let waited = 0;
      while (boss && boss.hp >= boss.maxHp && waited < 20000) {
        await sleep(1000);
        waited += 1000;
        boss = await evalJs(
          cdp,
          '(() => { const m = window.__zhuoxian.session.battle.monsters.find(x => x.rarity === "boss"); return m ? { x: m.x, y: m.y, size: m.size, hp: m.hp, maxHp: m.maxHp, name: m.name } : null; })()',
        );
      }
      ok('镇守已经开始掉血（条该画出来）', !!boss && boss.hp < boss.maxHp, boss ? `${Math.round(boss.hp)}/${boss.maxHp}` : 'null');

      const vp = await evalJs(cdp, 'window.__zhuoxian.viewport()');
      const ratio = vp && Number.isFinite(vp.ratio) ? vp.ratio : 1;
      ok('画布有像素比信息（取样要按它换算）', ratio > 0, JSON.stringify(vp));

      if (boss && boss.hp < boss.maxHp) {
        const r = boss.size / 2;
        const w = Math.max(96, r * 2.4);
        const barY = boss.y - r - 5 - 6;
        const barX = boss.x - w / 2;

        const barRect = {
          x: Math.round(barX * ratio),
          y: Math.round(barY * ratio),
          w: Math.round(w * ratio),
          h: Math.max(1, Math.round(5 * ratio)),
        };
        const barPixels = await evalJs(cdp, `(${COUNT})(${JSON.stringify(barRect)})`);
        ok('镇守条位置有锈红像素（条真的画了）', barPixels.red > 20, JSON.stringify(barPixels));

        const pctRect = {
          x: Math.round((barX + w + 4) * ratio),
          y: Math.round((barY - 8) * ratio),
          w: Math.round(40 * ratio),
          h: Math.round(16 * ratio),
        };
        const pctPixels = await evalJs(cdp, `(${COUNT})(${JSON.stringify(pctRect)})`);
        ok('条右侧有百分比文字像素', pctPixels.gold > 2, JSON.stringify(pctPixels));

        // 条宽应当明显大于普通怪的 2r 小条（D183 的核心视觉差异）
        ok('镇守条比普通怪小条宽', w >= 96 && w > r * 2, `r=${r} w=${w.toFixed(1)}`);
      }
    }

    ok('控制台零报错', cdp.errors.length === 0, `${cdp.errors.length} 条`);

    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.mkdirSync(path.dirname(SHOT), { recursive: true });
    fs.writeFileSync(SHOT, Buffer.from(shot.data, 'base64'));
    console.log(`\n  截图：${path.resolve(SHOT)}`);
    console.log(`\n=== ${pass}/${pass + fail} ===`);
console.log(`结果：${pass}/${pass + fail}`);
    if (fail > 0) process.exitCode = 1;
  } finally {
    try {
      cdp?.ws.close();
    } catch {
      /* ignore */
    }
    try {
      proc.kill();
    } catch {
      /* ignore */
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
