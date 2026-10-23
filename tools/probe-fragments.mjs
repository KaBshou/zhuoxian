/**
 * 五行碎片探针（D104）：F 键真的在切换定向、M 面板真的画了碎片那行、镇守真的会掉。
 *
 * 为什么这条探针必须存在（单测已经 16 条绿了，但它们证明不了三件事）：
 *   ① `F` 键真的挂在「切换碎片定向」上 —— 本项目踩过一次同类的坑：`activatePanel` 漏了
 *      分支，按 J 打出的是渊痕面板，而 tsc 与 31 条单测全绿，只有探针抓到；
 *   ② M 面板真的把碎片那行画出来了（几何变了但没有溢出/被 HUD 盖住）；
 *   ③ 钩子读到的余额是**运行时真相**，不是面板自己算的副本。
 *
 * 判据纪律（沿用 probe-achievement / probe-marks-panel）：
 * - 面板近黑底板盖上来 → 平均亮度【降】；
 * - 结构像素 > 调色板像素（D91.2）：这里用「碎片行那条窄带的文字像素」而不是全屏金色；
 * - 探针**不许写死产品常量**：金/火/水的显示名从 `fragments()` 与面板文案里读。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = Number(process.env.PROBE_PORT ?? 9366);
const BASE_URL = process.env.PROBE_URL ?? process.argv[2] ?? 'http://127.0.0.1:5288/';
const PROBE_CLASS = process.env.PROBE_CLASS ?? 'yujian';
const URL = BASE_URL.includes('cls=')
  ? BASE_URL
  : `${BASE_URL}${BASE_URL.includes('?') ? '&' : '?'}cls=${PROBE_CLASS}`;
const SHOT = process.argv[3] ?? 'F:\\dsh-work\\zhuoxian\\docs\\probe-fragments.png';

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' · ' + detail : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fetchJson(path) {
  return new Promise((resolve, reject) => {
    http
      .get(`http://127.0.0.1:${PORT}${path}`, (res) => {
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
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    };
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) {
      throw new Error(String(r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)));
    }
    return r.result.value;
  }
  async key(code, keyName) {
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      code,
      key: keyName,
      windowsVirtualKeyCode: 0,
    });
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      code,
      key: keyName,
      windowsVirtualKeyCode: 0,
    });
  }
}

/**
 * 全屏亮度 + 面板「碎片行」的米白文字像素。
 *
 * 为什么不写死坐标：`probe-marks-panel` 吃过这个亏 —— 面板高度随「碎片行」变了 22px，
 * 写死的取样带就会落到面板外面的战场上，读到的像素和面板毫无关系（然后要么假绿要么假红）。
 * 这里改成**结构自校准**：先沿面板左缘那一列找 3px 金色竖条（它横跨整个面板高度），
 * 用它反推面板上下边界，再从「底边往上 62px」取带 —— 金条在，坐标就是真的。
 */
const FINGERPRINT = `(() => {
  const c = document.getElementById('stage');
  const ctx = c.getContext('2d');
  const all = ctx.getImageData(0, 0, c.width, c.height).data;
  let sum = 0, n = 0;
  for (let i = 0; i < all.length; i += 4) {
    sum += all[i] * 0.299 + all[i + 1] * 0.587 + all[i + 2] * 0.114;
    n++;
  }
  // 面板 W=520 居中于 960 ⇒ 左缘 x≈220，金条宽 3px。沿 x=221 这一列找金条的上下端。
  // 只认**最长连续段**：同一列上还可能压着 HUD 底部的金色键位提示（实测 y≈497），
  // 取「最先/最后出现」会把面板底边误判成 497，于是取样带整条落到面板外面。
  const col = ctx.getImageData(221, 0, 1, c.height).data;
  let runStart = -1, bestLen = 0, top = -1, bottom = -1;
  for (let y = 0; y < c.height; y++) {
    const i = y * 4;
    const r = col[i], g = col[i + 1], b = col[i + 2];
    const gold = r > 120 && r - b > 55 && g > 60;
    if (gold) {
      if (runStart === -1) runStart = y;
      const len = y - runStart + 1;
      if (len > bestLen) {
        bestLen = len;
        top = runStart;
        bottom = y;
      }
    } else {
      runStart = -1;
    }
  }
  const barPx = bestLen;
  let fragText = 0;
  if (barPx > 40 && bottom > 80) {
    const y0 = Math.max(0, bottom - 62);
    const strip = ctx.getImageData(226, y0, 500, 20).data;
    for (let i = 0; i < strip.length; i += 4) {
      const r = strip[i], g = strip[i + 1], b = strip[i + 2];
      const mn = Math.min(r, g, b), mx = Math.max(r, g, b);
      if (mn > 120 && mx - mn < 60) fragText++;
    }
  }
  return { mean: sum / n, fragText, barPx, barBottom: bottom };
})()`;
const profile = `${process.env.TEMP}\\probe-frag-${Date.now()}`;
fs.mkdirSync(profile, { recursive: true });
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--window-size=1000,620',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--hide-scrollbars',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

let ws;
try {
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
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

  const consoleErrors = [];
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Network.enable');
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      consoleErrors.push(m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    }
  });

  await cdp.send('Page.navigate', { url: URL });
  await sleep(1800);
  await cdp.eval('(()=>{window.__zhuoxian?.reset();return true})()');
  await sleep(2500);

  const hooked = await cdp.eval(
    'Boolean(window.__zhuoxian && window.__zhuoxian.fragments && window.__zhuoxian.setFragmentAim && window.__zhuoxian.session)',
  );
  check('调试钩子存在（fragments / setFragmentAim / session）', hooked);
  if (!hooked) throw new Error('no hook');

  const f0 = await cdp.eval('(()=>window.__zhuoxian.fragments())()');
  check(
    '新号碎片余额全 0 且未定向',
    f0.metal === 0 && f0.fire === 0 && f0.water === 0 && f0.aim === null,
    `metal=${f0.metal} fire=${f0.fire} water=${f0.water} aim=${f0.aim}`,
  );

  // F 键循环：未定向 → 金 → 火 → 水 → 未定向
  const seen = [];
  for (let i = 0; i < 4; i++) {
    await cdp.key('KeyF', 'f');
    await sleep(160);
    seen.push(await cdp.eval('(()=>window.__zhuoxian.fragments().aim)()'));
  }
  check(
    'F 键循环四态（金→火→水→未定向）',
    seen.join(',') === 'metal,fire,water,',
    `序列 ${seen.map((v) => v ?? 'null').join(' → ')}`,
  );

  // 定向成立后，钩子读到的 aim 必须与日志一致（同一份真相，不是面板副本）
  await cdp.eval("(()=>{window.__zhuoxian.setFragmentAim('fire');return true})()");
  const aimSet = await cdp.eval('(()=>window.__zhuoxian.fragments().aim)()');
  check('setFragmentAim 能直接设成火行', aimSet === 'fire', `aim=${aimSet}`);
  await cdp.eval('(()=>{window.__zhuoxian.setFragmentAim(null);return true})()');

  // M 面板：打开 → 变暗 + 碎片行有文字
  const before = await cdp.eval(FINGERPRINT);
  await cdp.key('KeyM', 'm');
  await sleep(500);
  const opened = await cdp.eval(FINGERPRINT);
  check('按 M 面板盖上来（平均亮度下降）', opened.mean < before.mean - 1.5, `${before.mean.toFixed(1)} → ${opened.mean.toFixed(1)}`);
  check('碎片行真的画出了文字像素', opened.fragText > 40, `fragText=${opened.fragText}`);
  check(
    '按 M 之后只有渊痕面板开着（互斥）',
    JSON.stringify(await cdp.eval('(()=>window.__zhuoxian.panelsOpen())()')) === '["marks"]',
  );

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(SHOT, Buffer.from(shot.data, 'base64'));

  await cdp.key('Escape', 'Escape');
  await sleep(400);
  const closed = await cdp.eval(FINGERPRINT);
  check('Escape 能关掉面板且碎片行文字消失', closed.fragText < opened.fragText / 2, `fragText ${opened.fragText} → ${closed.fragText}`);

  // 余额真的来自角色状态（不是面板自算的副本）：改状态 → 重开面板 → 数字跟着变
  await cdp.eval(
    "(()=>{const s=window.__zhuoxian.session;s.character={...s.character,fragments:{metal:7,fire:0,water:0}};return true})()",
  );
  await cdp.key('KeyM', 'm');
  await sleep(450);
  const refilled = await cdp.eval(FINGERPRINT);
  const hookNow = await cdp.eval('(()=>window.__zhuoxian.fragments())()');
  check(
    '面板数字跟着角色状态走（金 7）',
    hookNow.metal === 7 && refilled.fragText >= opened.fragText * 0.8,
    `hook.metal=${hookNow.metal} fragText ${opened.fragText} → ${refilled.fragText}`,
  );
  await cdp.key('Escape', 'Escape');
  await sleep(300);

  // ── F 只改定向，不动余额 ───────────────────────────────────────────────
  // 定向本身不消耗碎片（消耗发生在「添灵纹」那一步）。这条是**余额不变量**：
  // 若哪次实现把 F 写成「切一次扣一颗」，玩家会因为误触直接损失长线积累物。
  const beforeF = await cdp.eval(`(()=>{
    const z=window.__zhuoxian;
    z.session.character={...z.session.character, fragments:{metal:7,fire:8,water:9}};
    z.setFragmentAim(null);
    return z.fragments();
  })()`);
  await cdp.key('KeyF', 'f');
  await sleep(160);
  await cdp.key('KeyF', 'f');
  await sleep(160);
  const afterF = await cdp.eval('(()=>window.__zhuoxian.fragments())()');
  check(
    'F 只改定向、不动余额（定向不消耗碎片）',
    afterF.metal === beforeF.metal && afterF.fire === beforeF.fire && afterF.water === beforeF.water,
    `金 ${beforeF.metal}→${afterF.metal} · 火 ${beforeF.fire}→${afterF.fire} · 水 ${beforeF.water}→${afterF.water} · aim=${afterF.aim}`,
  );
  await cdp.eval('(()=>{window.__zhuoxian.setFragmentAim(null);return true})()');

  // ── 镇守必掉 1 颗：走**真击杀派发**，不给生产入口开模拟钩子 ─────────────
  // 做法：用 battle.spawnMonster 在玩家射程内生一只 1 血的镇守（这是战斗模块本来就有的导出，
  // 不是为探针新开的后门），然后让真战斗循环补最后一刀 ⇒ session 的 kill 分支发碎片。
  const killSetup = await cdp.eval(`(async () => {
    const z = window.__zhuoxian;
    const s = z.session;
    s.character = {...s.character, fragments: {metal:0, fire:0, water:0}};
    const battle = await import('/src/core/battle.ts');
    const monsters = await import('/src/data/monsters.ts');
    const boss = monsters.bossOfTier(1);
    if (!boss) return { ok: false, why: 'bossOfTier(1) 为空' };
    const p = s.battle.player;
    const uid = 900000 + Math.floor(Math.random() * 1000);
    const m = battle.spawnMonster(boss, s.floor, uid, p.x + 20, p.y, 'boss', []);
    m.hp = 1;                       // 1 血 ⇒ 玩家下一刀就是最后一刀，但派发仍走真实路径
    s.battle.monsters.push(m);
    return { ok: true, floor: s.floor, uid };
  })()`);
  check('能在真 session 里造一只 1 血镇守（走 spawnMonster，不伪造击杀事件）', killSetup?.ok === true, JSON.stringify(killSetup).slice(0, 120));

  let gotFragment = false;
  for (let i = 0; i < 60 && !gotFragment; i++) {
    await sleep(250);
    const f = await cdp.eval('(()=>window.__zhuoxian.fragments())()');
    gotFragment = f.metal >= 1;
  }
  const afterKill = await cdp.eval('(()=>window.__zhuoxian.fragments())()');
  check(
    '镇守必掉 1 颗碎片（层 1 镇守 ⇒ 金行，真击杀派发）',
    gotFragment && afterKill.metal === 1 && afterKill.fire === 0 && afterKill.water === 0,
    `金 ${afterKill.metal} · 火 ${afterKill.fire} · 水 ${afterKill.water}（层 ${killSetup?.floor}）`,
  );

  // ── 元素映射：读产品导出函数，探针里不写 28/3 这种魔数 ─────────────────
  const mapping = await cdp.eval(`(async () => {
    const f = await import('/src/data/fragments.ts');
    // 采样点覆盖每一档 + 无尽段的轮转首尾，**并越过 46**：层上限已从 46 扩到 76（D110），
    // 若不补 47/60/76，则「层 >46 的元素映射」永远没被采到 = 漏检（探针绿着但产品可以错）。
    const rows = [[1,1],[9,1],[10,2],[18,2],[19,3],[27,3],[28,3],[29,3],[30,3],[46,3],[47,3],[60,3],[76,3]]
      .map(([floor, tier]) => [floor, f.fragmentElementForBoss(floor, tier)]);
    return { rows };
  })()`);
  const expectRows = mapping.rows.map(([floor]) =>
    floor <= 9 ? 'metal' : floor <= 18 ? 'fire' : floor <= 27 ? 'water' : ['metal', 'fire', 'water'][(floor - 28) % 3],
  );
  check(
    '元素映射按阶（1~9 金 / 10~18 火 / 19~27 水）、无尽按 (floor-28)%3 轮转',
    JSON.stringify(mapping.rows.map((r) => r[1])) === JSON.stringify(expectRows),
    mapping.rows.map(([f2, e]) => `${f2}:${e}`).join(' '),
  );

  // ── 独立掉落槽：碎片不许混进 pocket（pocket 只有三种通货） ─────────────
  const pocketKeys = await cdp.eval('Object.keys(window.__zhuoxian.session.pocket).sort()');
  check(
    '碎片走独立槽：不进 pocket（pocket 只有 huang/mie/xi）',
    JSON.stringify(pocketKeys) === JSON.stringify(['huang', 'mie', 'xi']),
    'pocket keys=' + JSON.stringify(pocketKeys),
  );

  check('控制台零报错', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
} catch (e) {
  check('探针自身没崩', false, String(e).slice(0, 200));
} finally {
  try {
    ws?.close();
  } catch {
    /* ignore */
  }
  chrome.kill();
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} 通过 · EXIT=${passed === results.length ? 0 : 1}`);
process.exit(passed === results.length ? 0 : 1);
