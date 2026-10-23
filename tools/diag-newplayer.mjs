/**
 * 新手前 5 分钟真机走查（诊断脚本，不进探针盘子）。
 *
 * 为什么要有：整盘 380+ 项探针验的都是「机制对不对」，没有一项验「一个新人打开它、
 * 什么都不懂、看 5 分钟，会不会卡住或看不懂」。GDD 里「可玩层验收」要求真人玩，
 * 我没法真玩，但可以让浏览器替我记下**每 20 秒发生了什么**，再人肉过一遍。
 *
 * 判据（先看数据，不预设结论）：
 *  - 引导有没有从 0 走到末条（末条 = TUTORIAL_LENGTH）
 *  - 有没有掉东西、背包/身上有没有真的换装
 *  - 有没有死；死了之后能不能自己回来（死循环 = 卡死）
 *  - 每 20 秒画面是否仍在变化（冻结 = 卡住）
 *  - 控制台有没有报错
 *
 * 用法：node tools/diag-newplayer.mjs [--seconds=300] [--cls=yujian]
 */
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const SECONDS = Number(args.seconds ?? 300);
const CLS = String(args.cls ?? 'yujian');
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5292';
const PORT = Number(args.port ?? 9391);
const SHOT = 'docs/diag-newplayer.png';

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
  const r = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text ?? 'eval failed');
  return r.result.value;
}

const SAMPLE = `(() => {
  const z = window.__zhuoxian;
  if (!z) return null;
  const s = z.session;
  const b = s.battle;
  return {
    t: Math.round(b.time),
    step: s.character.step,
    floor: s.floor,
    wave: s.wave,
    kills: s.kills,
    deaths: s.deaths,
    floorDeaths: s.floorDeaths,
    drops: s.dropsFound,
    bag: s.bag.length,
    equipped: Object.values(s.character.equipment).filter(Boolean).length,
    tutorial: s.tutorialStep,
    tutorialLen: z.tutorialLength,
    marks: s.character.marks ?? 0,
    pocket: (s.pocket?.huang ?? 0) + (s.pocket?.mie ?? 0) + (s.pocket?.xi ?? 0),
    gems: s.gemPouch ? Object.values(s.gemPouch).reduce((a, c) => a + c, 0) : 0,
    xp: Math.round(s.character.xp),
    hp: Math.round(b.player.hp),
    maxHp: Math.round(b.player.maxHp),
    monsters: b.monsters.length,
  };
})()`;

async function main() {
  const chrome = resolveChrome();
  const profile = path.join(os.tmpdir(), `zhuoxian-diag-${Date.now()}`);
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
      '--disable-renderer-backgrounding',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--autoplay-policy=no-user-gesture-required',
      'about:blank',
    ],
    { stdio: 'ignore', detached: false },
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

    const url = `${BASE}/?cls=${CLS}`;
    console.log(`\n=== 新手走查：${url}（${SECONDS}s）===\n`);
    await cdp.send('Page.navigate', { url });
    await sleep(2500);

    // 清档后重进，保证从全新存档开始
    await evalJs(cdp, 'localStorage.clear()');
    await cdp.send('Page.navigate', { url });
    await sleep(2500);

    const rows = [];
    const every = 20;
    let lastPixels = null;
    for (let elapsed = 0; elapsed <= SECONDS; elapsed += every) {
      const s = await evalJs(cdp, SAMPLE);
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      const hash = crypto
        .createHash('sha1')
        .update(shot.data.slice(0, 200000))
        .digest('hex')
        .slice(0, 8);
      const changed = lastPixels === null ? '—' : hash === lastPixels ? '静止' : '变化';
      lastPixels = hash;
      if (!s) {
        rows.push({ elapsed, note: '钩子不可用（页面可能未进 play）', changed });
      } else {
        rows.push({ elapsed, ...s, changed });
      }
      await sleep(every * 1000);
    }

    console.log(
      '  时间  波 层 击杀 死亡 掉落 背包 装备 引导 浊气? 修为 血量 怪 画面',
    );
    for (const r of rows) {
      if (r.note) {
        console.log(`  ${String(r.elapsed).padStart(4)}s  ${r.note}`);
        continue;
      }
      console.log(
        `  ${String(r.elapsed).padStart(4)}s ${String(r.wave).padStart(2)} ${String(r.floor).padStart(2)} ` +
          `${String(r.kills).padStart(4)} ${String(r.deaths).padStart(4)} ${String(r.drops).padStart(4)} ` +
          `${String(r.bag).padStart(4)} ${String(r.equipped).padStart(4)} ${String(r.tutorial).padStart(2)}/${r.tutorialLen} ` +
          `${String(r.pocket).padStart(3)} ${String(r.xp).padStart(5)} ${String(r.hp).padStart(4)}/${r.maxHp} ` +
          `${String(r.monsters).padStart(2)} ${r.changed}`,
      );
    }

    const first = rows.find((r) => !r.note);
    const last = [...rows].reverse().find((r) => !r.note);
    const stuck = rows.filter((r) => r.changed === '静止').length;

    console.log('\n--- 判读 ---');
    if (first && last) {
      console.log(`  引导：${first.tutorial} → ${last.tutorial} / ${last.tutorialLen}${last.tutorial === last.tutorialLen ? '（走完）' : '（未走完）'}`);
      console.log(`  击杀：${first.kills} → ${last.kills}（${((last.kills - first.kills) / Math.max(1, SECONDS / 60)).toFixed(1)}/分）`);
      console.log(`  掉落：${first.drops} → ${last.drops}｜背包 ${first.bag} → ${last.bag}｜装备 ${first.equipped} → ${last.equipped}`);
      console.log(`  死亡：${last.deaths}（本层 ${last.floorDeaths}）｜层 ${first.floor} → ${last.floor}｜波 ${first.wave} → ${last.wave}`);
      console.log(`  画面静止次数：${stuck} / ${rows.length}（>2 次要查是否卡死）`);
    }
    console.log(`  控制台报错：${cdp.errors.length} 条`);
    for (const e of cdp.errors.slice(0, 5)) console.log(`    - ${e}`);

    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.mkdirSync(path.dirname(SHOT), { recursive: true });
    fs.writeFileSync(SHOT, Buffer.from(shot.data, 'base64'));
    console.log(`\n  截图：${path.resolve(SHOT)}`);
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
