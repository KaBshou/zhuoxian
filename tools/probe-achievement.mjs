/**
 * 成就面板探针（D87 第三个收集系统）：J 键打开、能翻、真打出来能结算、刷新不丢。
 *
 * 为什么这条探针必须存在：
 *   `tests/achievement.test.ts` 31 条单测全绿，但它证明不了三件事 ——
 *   ① J 键真的接在**成就**面板上（这里踩过一次：activatePanel 没有 achievement 分支，
 *      `else` 落到了渊痕价目表，按 J 打出 M 的面板，tsc 与单测都发现不了）；
 *   ② 面板真的画出来了（像素）；
 *   ③ 真打完一只怪之后，`syncAchievements` 那条路真的会发渊痕（单测只能造事实）。
 *
 * 判据纪律（沿用 probe-codex / probe-gem / probe-touch）：
 * - 面板近黑底板盖上来 → 平均亮度会【降】；
 * - 看不见的状态一律走调试钩子，像素只证明「画出来了」；
 * - **结构像素 > 调色板像素**（D91.2）：成就面板左缘有 3px 金条，关着时那一列不是金色，
 *   比「金色总数」可靠（HUD 自己就有很多金色，关闭态可能比打开态还多）；
 * - 探针**不许写死产品常量**：行数、id、奖励档全从 achievementRows() 取。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = Number(process.env.PROBE_PORT ?? 9364);
const BASE_URL = process.env.PROBE_URL ?? process.argv[2] ?? 'http://127.0.0.1:5288/';
const PROBE_CLASS = process.env.PROBE_CLASS ?? 'yujian';
const URL = BASE_URL.includes('cls=')
  ? BASE_URL
  : `${BASE_URL}${BASE_URL.includes('?') ? '&' : '?'}cls=${PROBE_CLASS}`;
const SHOT = process.argv[3] ?? 'F:\\dsh-work\\zhuoxian\\docs\\probe-achievement.png';

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
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      throw new Error(String(r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)));
    }
    return r.result.value;
  }
  async key(code, keyName) {
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: keyName, windowsVirtualKeyCode: 0 });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: keyName, windowsVirtualKeyCode: 0 });
  }
}

/** 全屏亮度 + 左侧结构金条：面板 W=760 居中于 960 ⇒ 左缘 x≈100，金条宽 3px */
const FINGERPRINT = `(() => {
  const c = document.getElementById('stage');
  const ctx = c.getContext('2d');
  const all = ctx.getImageData(0, 0, c.width, c.height).data;
  let sum = 0, n = 0;
  for (let i = 0; i < all.length; i += 4) {
    sum += all[i] * 0.299 + all[i + 1] * 0.587 + all[i + 2] * 0.114;
    n++;
  }
  // 左侧结构金条：只数 x∈[98,105]、y∈[30,510] 这一窄条里的暖金色
  const bar = ctx.getImageData(98, 30, 8, 480).data;
  let gold = 0;
  for (let i = 0; i < bar.length; i += 4) {
    const r = bar[i], g = bar[i + 1], b = bar[i + 2];
    if (r > 120 && r - b > 55 && g > 60) gold++;
  }
  return { mean: sum / n, goldBar: gold };
})()`;

const profile = `${process.env.TEMP}\\probe-ach-${Date.now()}`;
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
    if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) {
      const url = m.params.response.url;
      if (!url.includes('favicon')) consoleErrors.push(`HTTP ${m.params.response.status} ${url}`);
    }
  });

  // 真清档（走 reset()：localStorage.clear() 之后 reload 会被离场 flush 写回旧档）
  await cdp.send('Page.navigate', { url: URL });
  await sleep(1800);
  await cdp.eval('(()=>{window.__zhuoxian?.reset();return true})()');
  await sleep(2500);

  const hooked = await cdp.eval(
    'Boolean(window.__zhuoxian && window.__zhuoxian.achievements && window.__zhuoxian.achievementRows && window.__zhuoxian.achievementFacts && typeof window.__zhuoxian.achievementCursor === "number")',
  );
  check('调试钩子存在（achievements / achievementRows / achievementFacts / achievementCursor）', hooked);
  if (!hooked) throw new Error('no hook');

  const rows = await cdp.eval('(()=>window.__zhuoxian.achievementRows())()');
  check('成就行读得到（不写死 20）', Array.isArray(rows) && rows.length >= 10, `rows=${rows?.length}`);
  // 「奖励总额 == 模块导出」：总价是设计意图（20 条合计 385 000 那一档），但它必须以
  // ACHIEVEMENT_REWARD_TOTAL 这个单一来源为准 —— 写死数字的话，每加一条成就（层 28~76 /
  // 周目 / 深层内容）这条断言就假红一次，而真出问题时（某条 reward 被改错）又查不出来。
  const totals = await cdp.eval(`(async () => {
    const mod = await import('/src/data/achievements.ts');
    return { total: mod.ACHIEVEMENT_TOTAL, reward: mod.ACHIEVEMENT_REWARD_TOTAL };
  })()`);
  const rowReward = (rows ?? []).reduce((a, r) => a + r.reward, 0);
  check(
    '条数与奖励总额都等于模块导出（不写死 20 / 385000）',
    totals.total === (rows ?? []).length && totals.reward === rowReward,
    `ACHIEVEMENT_TOTAL=${totals.total}=rows ${(rows ?? []).length}? · ACHIEVEMENT_REWARD_TOTAL=${totals.reward} vs 行合计 ${rowReward}`,
  );
  check(
    '行字段齐全（id/name/desc/target/reward），id 不重复',
    rows.every((r) => typeof r.id === 'string' && r.id.length > 0 && typeof r.name === 'string' && r.name.length > 0 && r.target > 0) &&
      new Set(rows.map((r) => r.id)).size === rows.length,
  );
  // D87 的意图是「只发渊痕、有界」，不是「永远只有这四个数」。枚举档位等于
  // 「每次调整/新增一档奖励，这条断言就假红一次」（层 28~76 / 周目 / 深层内容都可能加档）。
  // 所以改成有界不变量：正数、整数、上限 50000、档位数 ≤ 6（防无限细分 / 最后一条暴涨）。
  const tiers = [...new Set(rows.map((r) => r.reward))].sort((a, b) => a - b);
  check(
    '奖励有界（正数 · ≤50000 · 档位 ≤6；D87：只发渊痕、有界）',
    rows.every((r) => Number.isInteger(r.reward) && r.reward > 0 && r.reward <= 50000) && tiers.length <= 6,
    `档位 ${tiers.join('/')}`,
  );

  const prog0 = await cdp.eval('(()=>window.__zhuoxian.achievements())()');
  check('新号：一条成就都没达成', prog0.got === 0 && prog0.percent === 0, `${prog0.got}/${prog0.total}`);

  const facts0 = await cdp.eval('(()=>window.__zhuoxian.achievementFacts())()');
  check('事实钩子返回 8 个字段（包括 deaths / xianEquipped）', Object.keys(facts0).length >= 8, Object.keys(facts0).join(','));

  // 打开面板
  const closed = await cdp.eval(FINGERPRINT);
  await cdp.key('KeyJ', 'j');
  await sleep(700);
  const opened = await cdp.eval(FINGERPRINT);
  const shot1 = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(SHOT, Buffer.from(shot1.data, 'base64'));

  check('按 J 画面变暗（面板盖上来）', opened.mean < closed.mean - 3, `${closed.mean.toFixed(1)} → ${opened.mean.toFixed(1)}`);
  check(
    '面板左缘 3px 金条（结构像素 > 调色板像素，D91.2）',
    opened.goldBar > 300 && closed.goldBar < opened.goldBar / 2,
    `关闭 ${closed.goldBar} → 打开 ${opened.goldBar}`,
  );

  // 按 J 打开的是成就，不是渊痕（这里踩过：activatePanel 没有分支时 else 会打开渊痕）
  const panels = await cdp.eval('(()=>window.__zhuoxian.panelsOpen())()');
  check('按 J 打开的是成就面板（不是渊痕价目表）', JSON.stringify(panels) === JSON.stringify(['achievement']), JSON.stringify(panels));

  const cur0 = await cdp.eval('(()=>window.__zhuoxian.achievementCursor)()');
  check('光标初始在第 0 行', cur0 === 0, String(cur0));
  await cdp.key('ArrowDown', 'ArrowDown');
  await sleep(250);
  const cur1 = await cdp.eval('(()=>window.__zhuoxian.achievementCursor)()');
  check('↓ 移动成就光标（方向键被面板接管，不会去回刷层）', cur1 === 1, `${cur0} → ${cur1}`);
  const floorDuring = await cdp.eval('(()=>window.__zhuoxian.session.floor)()');
  await cdp.key('ArrowDown', 'ArrowDown');
  await cdp.key('ArrowUp', 'ArrowUp');
  await sleep(200);
  const floorAfterArrows = await cdp.eval('(()=>window.__zhuoxian.session.floor)()');
  check('面板开着时 ↑↓ 不会改层号', floorAfterArrows === floorDuring, `${floorDuring} → ${floorAfterArrows}`);

  // ── D208：未达成行有进度条 + 页脚上方有「最接近」 ──
  // 判据：canvas 没有 DOM 可读，只能按区域数像素。
  // 「最接近」那一行在页脚上方（面板底 -40 ~ -20），是这一带唯一的米白文字。
  const NEAR_SCAN =
    '(() => {' +
    '  const cv = document.getElementById("stage");' +
    '  const ctx = cv.getContext("2d");' +
    '  const ratio = cv.width / 960;' +
    '  const W = 760, PAD = 18;' +
    '  const rowsPerCol = Math.ceil(window.__zhuoxian.achievementRows().length / 2);' +
    '  const h = PAD * 2 + 26 + rowsPerCol * 22 + 22 + 16;' +
    '  const x = Math.round((960 - W) / 2);' +
    '  const y = Math.round((540 - h) / 2);' +
    '  const d = ctx.getImageData(' +
    '    Math.round((x + PAD) * ratio),' +
    '    Math.round((y + h - 40) * ratio),' +
    '    Math.round(420 * ratio),' +
    '    Math.round(20 * ratio),' +
    '  ).data;' +
    '  let lit = 0;' +
    '  for (let i = 0; i < d.length; i += 4) {' +
    '    if (d[i] > 120 && d[i] - d[i + 2] > 50 && d[i + 1] > d[i + 2]) lit += 1;' +
    '  }' +
    '  return { lit };' +
    '})()';
  const nearLine = await cdp.eval(NEAR_SCAN);
  check('D208 页脚上方有「最接近」那一行', nearLine.lit > 120, 'lit=' + nearLine.lit);

  // 进度条填充色 #4fd1c5（青）—— 全画面数一遍；青色在这个面板里只有进度条在用
  // 只扫面板内部：世界层的玩家也是 #4fd1c5，全画布扫分不清「进度条」和「玩家」。
  const TEAL_SCAN =
    '(() => {' +
    '  const cv = document.getElementById("stage");' +
    '  const ctx = cv.getContext("2d");' +
    '  const ratio = cv.width / 960;' +
    '  const W = 760, PAD = 18;' +
    '  const rowsPerCol = Math.ceil(window.__zhuoxian.achievementRows().length / 2);' +
    '  const h = PAD * 2 + 26 + rowsPerCol * 22 + 22 + 16;' +
    '  const x = Math.round((960 - W) / 2);' +
    '  const y = Math.round((540 - h) / 2);' +
    '  const d = ctx.getImageData(' +
    '    Math.round((x + PAD) * ratio),' +
    '    Math.round((y + PAD + 26) * ratio),' +
    '    Math.round((W - PAD * 2) * ratio),' +
    '    Math.round((rowsPerCol * 22) * ratio),' +
    '  ).data;' +
    '  let teal = 0;' +
    '  for (let i = 0; i < d.length; i += 4) {' +
    '    if (d[i] > 60 && d[i] < 120 && d[i + 1] > 190 && d[i + 2] > 170) teal += 1;' +
    '  }' +
    '  return { teal };' +
    '})()';
  const barPix = await cdp.eval(TEAL_SCAN);
  check('D208 未达成行画了进度条（青色填充）', barPix.teal > 60, 'teal=' + barPix.teal);

  // 真结算：把击杀数顶到第一条门槛，让 syncAchievements 走真路径发渊痕
  // ⚠ 只能挑「击杀类」的第一条：target 最小的是 codex-l-1（目标 1），
  // 拿它当门槛会把 kills 设成 1，什么都不会解锁（第一版就踩了这条，红在「成就没解锁」上）。
  const killRow = rows.filter((r) => r.id.startsWith('kill-')).sort((a, b) => a.target - b.target)[0];
  // D102：**同一帧内**结算 + 读快照。旧写法是「设 kills → sleep(1200) → 比 xp」，
  // 但战斗循环每帧都在打怪，`xp 0 → 2` 完全可能只是这期间杀了 1 只（`XP_PER_KILL_PER_FLOOR = 2`），
  // 那条断言实测就假红过一次。跨帧测量得出的「没变」和「变了」都不作数。
  const snap = await cdp.eval(
    `(()=>{const z=window.__zhuoxian; z.session.kills=${killRow.target}; return z.syncAchievementsNow();})()`,
  );
  const marksBefore = snap.marksBefore;
  const xpBefore = snap.xpBefore;
  const marksAfter = snap.marksAfter;
  const xpAfter = snap.xpAfter;
  const prog1 = await cdp.eval('(()=>window.__zhuoxian.achievements())()');
  const rows1 = await cdp.eval('(()=>window.__zhuoxian.achievementRows())()');
  const unlockedRow = rows1.find((r) => r.id === killRow.id);
  check(
    '真打到门槛后成就解锁（走 session 的结算，不是直接改状态）',
    unlockedRow?.unlocked === true && prog1.got >= 1 && snap.unlockedAfter > snap.unlockedBefore,
    `${killRow.id} got=${prog1.got}/${prog1.total} ${prog1.percent}%（解锁 ${snap.unlockedBefore}→${snap.unlockedAfter}）`,
  );
  check(
    '解锁发的是渊痕（marks 增加 ≥ 该成就奖励）',
    marksAfter - marksBefore >= killRow.reward,
    `${marksBefore} → ${marksAfter}（奖励 ${killRow.reward}）`,
  );
  check('解锁不动修为（D87：只发渊痕，禁给修为/战力/掉率）', xpAfter === xpBefore, `xp ${xpBefore} → ${xpAfter}`);

  // ── D168：新事实轴 `xianFound`（累计获得过的仙品件数，不是身上同时装备数）──────
  // 两条断言只钉**结构**，不钉「27 条 / 585k」这类内容侧数字（那些由上面
  // 「条数与奖励总额 == 模块导出」动态对账，加成就不会假红）：
  //   ① `achievementFacts()` 必须真有 `xianFound` 这个轴（number），否则 `xian-80` 永远 0 进度；
  //   ② 把 `session.xianFound` 顶到目标值后**同帧**结算：该行解锁、发 reward、且**不动修为**。
  const factsShape = await cdp.eval('(()=>window.__zhuoxian.achievementFacts())()');
  check(
    '事实钩子含 xianFound 轴（D168：累计仙品件数，不是装备数）',
    typeof factsShape?.xianFound === 'number' && factsShape.xianFound >= 0,
    `xianFound=${factsShape?.xianFound} · 字段 ${Object.keys(factsShape ?? {}).length} 个`,
  );
  // ⚠ 只能挑「**累计**仙品」那条（`xianFound` 轴）：成就表里还有 `xian-1`「一仙在身」走的是
  // `xianEquipped`（身上同时装备数）—— 按 desc 含「仙品」取第一条会取到它，然后设 `session.xianFound`
  // 当然不会解锁（第一版就红在这里，marks 5000→5000）。所以按「id 前缀 xian- + 文案含『累计』」定位。
  const xianRow = rows.find((r) => String(r.id).startsWith('xian-') && /累计/.test(String(r.desc ?? ''))) ?? null;
  if (xianRow) {
    const snap2 = await cdp.eval(
      `(()=>{const z=window.__zhuoxian; z.session.xianFound=${xianRow.target}; return z.syncAchievementsNow();})()`,
    );
    const rows2 = await cdp.eval('(()=>window.__zhuoxian.achievementRows())()');
    const unlockedXian = rows2.find((r) => r.id === xianRow.id);
    check(
      `「${xianRow.name}」（${xianRow.id}，目标 ${xianRow.target} 件仙品）真能解锁：发 ${xianRow.reward} 渊痕且不动修为`,
      unlockedXian?.unlocked === true &&
        snap2.marksAfter - snap2.marksBefore >= xianRow.reward &&
        snap2.xpAfter === snap2.xpBefore,
      `marks ${snap2.marksBefore} → ${snap2.marksAfter}（奖励 ${xianRow.reward}）· xp ${snap2.xpBefore} → ${snap2.xpAfter}`,
    );
  } else {
    skip('「累计仙品」成就解锁：当前成就表里没有该轴的行（内容侧删了？）', '不影响其它断言');
  }

  const logText = await cdp.eval('(()=>window.__zhuoxian.session.log.map(l=>l.text).join(" | "))()');
  check('日志里播报了成就与渊痕奖励', /成就/.test(String(logText)) && /渊痕/.test(String(logText)), String(logText).slice(0, 90));

  // 关面板 → 亮度回升、金条消失（同一块画布两态）
  await cdp.key('KeyJ', 'j');
  await sleep(600);
  const closed2 = await cdp.eval(FINGERPRINT);
  check('再按 J 关闭：亮度回升且金条消失', closed2.mean > opened.mean + 2 && closed2.goldBar < opened.goldBar / 2, `${opened.mean.toFixed(1)} → ${closed2.mean.toFixed(1)}，金条 ${opened.goldBar} → ${closed2.goldBar}`);

  // 存档：刷新后成就还在（这条命中了「解锁不存档」的坑才算数）
  await cdp.eval('(()=>{window.__zhuoxian.save();return true})()');
  await cdp.send('Page.reload');
  await sleep(2800);
  const rowsReload = await cdp.eval('(()=>window.__zhuoxian.achievementRows())()');
  const kept = rowsReload.filter((r) => r.unlocked).length;
  check('刷新后成就还在（真的入了档）', rowsReload.find((r) => r.id === killRow.id)?.unlocked === true, `仍解锁 ${kept} 条`);

  // 面板关着时方向键还是原职责（回刷层）
  const floorBefore = await cdp.eval('(()=>window.__zhuoxian.session.floor)()');
  await cdp.key('ArrowRight', 'ArrowRight');
  await sleep(500);
  const floorAfter = await cdp.eval('(()=>window.__zhuoxian.session.floor)()');
  check('面板关着时 → 仍走回刷层（旧键位没被吃掉）', floorAfter === floorBefore || floorAfter === floorBefore + 1, `${floorBefore} → ${floorAfter}`);

  check('控制台无报错', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
} catch (e) {
  check('探针执行未崩溃', false, String(e));
} finally {
  try {
    ws?.close();
  } catch {
    /* ignore */
  }
  chrome.kill();
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} 通过`);
process.exitCode = passed === results.length ? 0 : 1;
